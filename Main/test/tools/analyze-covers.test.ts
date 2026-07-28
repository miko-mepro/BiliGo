import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LanguageModel } from 'ai'

const streamTextMock = vi.hoisted(() => vi.fn())
const settingsMocks = vi.hoisted(() => ({
  readBiliAgentSettings: vi.fn(),
}))
const factoryMocks = vi.hoisted(() => ({
  createModel: vi.fn(),
}))

vi.mock('ai', () => ({
  streamText: streamTextMock,
  APICallError: {
    isInstance: (err: unknown) =>
      err !== null &&
      typeof err === 'object' &&
      (err as { name?: string }).name === 'APICallError',
  },
  NoSuchModelError: {
    isInstance: (err: unknown) =>
      err !== null &&
      typeof err === 'object' &&
      (err as { name?: string }).name === 'NoSuchModelError',
  },
}))

vi.mock('../../src/config/settings.js', () => ({
  readBiliAgentSettings: settingsMocks.readBiliAgentSettings,
}))

vi.mock('../../src/config/provider-factory.js', () => ({
  createModel: factoryMocks.createModel,
}))

import {
  analyzeCovers,
  COVER_ANALYSIS_CACHE_KEY,
  HARD_MAX_COVERS,
  VISION_UNSUPPORTED_MARKER,
  COVER_ANALYSIS_TTL_MS,
} from '../../src/tools/analyze-covers.js'

const NOW = Date.parse('2026-07-20T00:00:00.000Z')

const baseSettings = {
  providers: [
    {
      id: 'openai',
      name: 'OpenAI',
      apiKey: 'sk-openai',
      model: 'gpt-4-vision',
      format: 'openai' as const,
      baseUrl: 'https://api.openai.com/v1',
      isBuiltIn: true,
      isCustom: false,
    },
  ],
  activeProviderId: 'openai',
  themeMode: 'auto' as const,
}

/**
 * 构造一个 fake stream，依次产出给定的 stream parts。
 * part.type='text-delta' 时累积 text；part.type='error' 时记录 error。
 */
function makeStreamResult(parts: Array<{ type: string; text?: string; error?: unknown }>) {
  return {
    stream: (async function* () {
      for (const part of parts) {
        yield part
      }
    })(),
  }
}

/** 构造一个 APICallError-shaped 对象（与 mock 的 isInstance 配合）。 */
function makeAPICallError(
  message: string,
  statusCode: number,
  isRetryable = false,
): Error {
  const err = new Error(message)
  err.name = 'APICallError'
  Object.assign(err, { statusCode, isRetryable })
  return err
}

/** 构造一个 NoSuchModelError-shaped 对象。 */
function makeNoSuchModelError(message: string): Error {
  const err = new Error(message)
  err.name = 'NoSuchModelError'
  return err
}

/** 真实 in-memory chrome.storage.local mock（不使用 vi.fn 占位，便于断言）。 */
function makeStorageMock() {
  const store = new Map<string, unknown>()
  const get = vi.fn(async (key: string) => {
    const value = store.get(key)
    return value === undefined ? {} : { [key]: value }
  })
  const set = vi.fn(async (entries: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(entries)) {
      store.set(k, v)
    }
  })
  const remove = vi.fn(async (key: string) => {
    store.delete(key)
  })
  return { store, get, set, remove }
}

let storage: ReturnType<typeof makeStorageMock>

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  storage = makeStorageMock()
  chrome.storage.local.get = storage.get as unknown as typeof chrome.storage.local.get
  chrome.storage.local.set = storage.set as unknown as typeof chrome.storage.local.set
  chrome.storage.local.remove = storage.remove as unknown as typeof chrome.storage.local.remove
  settingsMocks.readBiliAgentSettings.mockResolvedValue(baseSettings)
  factoryMocks.createModel.mockReturnValue('mock-model' as unknown as LanguageModel)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('analyzeCovers - cache tri-state', () => {
  it('1. 命中缓存未过期 -> 直接返回描述，不调用 streamText', async () => {
    storage.store.set(COVER_ANALYSIS_CACHE_KEY, {
      BV1fresh: { description: '封面里有一只橘猫', timestamp: NOW - 1_000 },
    })

    const descriptions = await analyzeCovers([
      { bvid: 'BV1fresh', picUrl: 'https://i0.hdslb.com/fresh.jpg' },
    ])

    expect(streamTextMock).not.toHaveBeenCalled()
    expect([...descriptions.entries()]).toEqual([
      ['BV1fresh', '封面里有一只橘猫'],
    ])
  })

  it('2. Vision 不支持 -> 缓存 VISION_UNSUPPORTED_MARKER，下次跳过、不再重试', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    streamTextMock.mockReturnValue(
      makeStreamResult([
        {
          type: 'error',
          error: makeAPICallError(
            'this model does not support image input',
            400,
          ),
        },
      ]),
    )

    const descriptions = await analyzeCovers(
      [{ bvid: 'BVnoVision', picUrl: 'https://i0.hdslb.com/x.jpg' }],
      HARD_MAX_COVERS,
      { fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW },
    )

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect([...descriptions.entries()]).toEqual([])
    expect(storage.store.get(COVER_ANALYSIS_CACHE_KEY)).toEqual({
      BVnoVision: { description: VISION_UNSUPPORTED_MARKER, timestamp: NOW },
    })

    // 第二次调用：应命中 unsupported 缓存，不再调用 streamText
    streamTextMock.mockClear()
    const descriptions2 = await analyzeCovers(
      [{ bvid: 'BVnoVision', picUrl: 'https://i0.hdslb.com/x.jpg' }],
      HARD_MAX_COVERS,
      { fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW },
    )

    expect(streamTextMock).not.toHaveBeenCalled()
    expect([...descriptions2.entries()]).toEqual([])
  })

  it('3. 失败 -> 不缓存，下次重试', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    streamTextMock.mockReturnValue(
      makeStreamResult([
        {
          type: 'error',
          error: makeAPICallError('Internal Server Error', 500),
        },
      ]),
    )

    const descriptions = await analyzeCovers(
      [{ bvid: 'BVfail', picUrl: 'https://i0.hdslb.com/x.jpg' }],
      HARD_MAX_COVERS,
      { fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW },
    )

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect([...descriptions.entries()]).toEqual([])
    // 失败不缓存：storage 中不应有 COVER_ANALYSIS_CACHE_KEY
    expect(storage.store.has(COVER_ANALYSIS_CACHE_KEY)).toBe(false)

    // 第二次调用：应重新尝试（因为没有缓存）
    streamTextMock.mockClear()
    streamTextMock.mockReturnValue(
      makeStreamResult([
        { type: 'text-delta', text: '重试成功' },
      ]),
    )

    const descriptions2 = await analyzeCovers(
      [{ bvid: 'BVfail', picUrl: 'https://i0.hdslb.com/x.jpg' }],
      HARD_MAX_COVERS,
      { fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW },
    )

    // 第二次调用应重新调用 streamText（失败项未缓存，需重试）
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect([...descriptions2.entries()]).toEqual([['BVfail', '重试成功']])
    expect(storage.store.get(COVER_ANALYSIS_CACHE_KEY)).toEqual({
      BVfail: { description: '重试成功', timestamp: NOW },
    })
  })

  it('4. 缓存过期 -> 重新调用 provider，新鲜缓存保留', async () => {
    const expiredTimestamp = NOW - COVER_ANALYSIS_TTL_MS - 1
    storage.store.set(COVER_ANALYSIS_CACHE_KEY, {
      BVfresh: { description: '新鲜缓存', timestamp: NOW - 60_000 },
      BVexpired: { description: '过期缓存', timestamp: expiredTimestamp },
    })

    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([4, 5, 6]), {
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    )
    streamTextMock.mockReturnValue(
      makeStreamResult([{ type: 'text-delta', text: 'fresh-BVexpired' }]),
    )

    const descriptions = await analyzeCovers(
      [
        { bvid: 'BVfresh', picUrl: 'https://i0.hdslb.com/fresh.jpg' },
        { bvid: 'BVexpired', picUrl: 'https://i0.hdslb.com/expired.jpg' },
      ],
      HARD_MAX_COVERS,
      { fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW },
    )

    // 只对过期项 fetch / streamText
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://i0.hdslb.com/expired.jpg')
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect([...descriptions.entries()]).toEqual([
      ['BVfresh', '新鲜缓存'],
      ['BVexpired', 'fresh-BVexpired'],
    ])
    // 新鲜缓存原样保留（timestamp 未变），过期项被覆写为新描述
    expect(storage.store.get(COVER_ANALYSIS_CACHE_KEY)).toEqual({
      BVfresh: { description: '新鲜缓存', timestamp: NOW - 60_000 },
      BVexpired: { description: 'fresh-BVexpired', timestamp: NOW },
    })
  })

  it('5. maxN 超过 HARD_MAX_COVERS 时截断到 5', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    streamTextMock.mockImplementation(() =>
      makeStreamResult([{ type: 'text-delta', text: '描述' }]),
    )

    const covers = Array.from({ length: 10 }, (_, i) => ({
      bvid: `BV${i}`,
      picUrl: `https://i0.hdslb.com/${i}.jpg`,
    }))

    await analyzeCovers(covers, 20, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => NOW,
    })

    // 只处理前 5 个
    expect(fetchMock).toHaveBeenCalledTimes(HARD_MAX_COVERS)
    expect(streamTextMock).toHaveBeenCalledTimes(HARD_MAX_COVERS)
    const fetchedUrls = fetchMock.mock.calls.map((c) => c[0])
    expect(fetchedUrls).toEqual([
      'https://i0.hdslb.com/0.jpg',
      'https://i0.hdslb.com/1.jpg',
      'https://i0.hdslb.com/2.jpg',
      'https://i0.hdslb.com/3.jpg',
      'https://i0.hdslb.com/4.jpg',
    ])
  })

  it('6. 空 covers 输入返回空 Map，不调用 provider', async () => {
    streamTextMock.mockReturnValue(
      makeStreamResult([{ type: 'text-delta', text: 'should not be called' }]),
    )

    const descriptions = await analyzeCovers([])

    expect(streamTextMock).not.toHaveBeenCalled()
    expect(descriptions.size).toBe(0)
  })
})

describe('analyzeCovers - edge cases', () => {
  it('fetch 失败时跳过该封面，不缓存', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('Not Found', { status: 404 }),
    )
    streamTextMock.mockReturnValue(
      makeStreamResult([{ type: 'text-delta', text: 'should not reach' }]),
    )

    const descriptions = await analyzeCovers(
      [{ bvid: 'BV404', picUrl: 'https://i0.hdslb.com/missing.jpg' }],
      HARD_MAX_COVERS,
      { fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW },
    )

    expect(streamTextMock).not.toHaveBeenCalled()
    expect([...descriptions.entries()]).toEqual([])
    expect(storage.store.has(COVER_ANALYSIS_CACHE_KEY)).toBe(false)
  })

  it('normalizePicUrl: // 开头的 URL 补全为 https', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    streamTextMock.mockReturnValue(
      makeStreamResult([{ type: 'text-delta', text: '橘猫' }]),
    )

    await analyzeCovers(
      [{ bvid: 'BV1', picUrl: '//i0.hdslb.com/cover-1.jpg' }],
      HARD_MAX_COVERS,
      { fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW },
    )

    expect(fetchMock).toHaveBeenCalledWith('https://i0.hdslb.com/cover-1.jpg')
  })

  it('空文本输出视为 failed，不缓存', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    streamTextMock.mockReturnValue(
      makeStreamResult([{ type: 'text-delta', text: '   ' }]),
    )

    const descriptions = await analyzeCovers(
      [{ bvid: 'BVempty', picUrl: 'https://i0.hdslb.com/x.jpg' }],
      HARD_MAX_COVERS,
      { fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW },
    )

    expect([...descriptions.entries()]).toEqual([])
    expect(storage.store.has(COVER_ANALYSIS_CACHE_KEY)).toBe(false)
  })

  it('NoSuchModelError 视为 vision unsupported，缓存标记', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    streamTextMock.mockReturnValue(
      makeStreamResult([
        { type: 'error', error: makeNoSuchModelError('model not found') },
      ]),
    )

    const descriptions = await analyzeCovers(
      [{ bvid: 'BVnoModel', picUrl: 'https://i0.hdslb.com/x.jpg' }],
      HARD_MAX_COVERS,
      { fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW },
    )

    expect([...descriptions.entries()]).toEqual([])
    expect(storage.store.get(COVER_ANALYSIS_CACHE_KEY)).toEqual({
      BVnoModel: { description: VISION_UNSUPPORTED_MARKER, timestamp: NOW },
    })
  })

  it('未配置 provider 时返回空 Map，不抛错', async () => {
    settingsMocks.readBiliAgentSettings.mockResolvedValue({
      ...baseSettings,
      activeProviderId: null,
    })

    const descriptions = await analyzeCovers([
      { bvid: 'BV1', picUrl: 'https://i0.hdslb.com/x.jpg' },
    ])

    expect(streamTextMock).not.toHaveBeenCalled()
    expect(descriptions.size).toBe(0)
  })

  it('vision unsupported marker 缓存被命中时不出现在返回 Map 中', async () => {
    storage.store.set(COVER_ANALYSIS_CACHE_KEY, {
      BVskip: {
        description: VISION_UNSUPPORTED_MARKER,
        timestamp: NOW - 60_000,
      },
    })

    const descriptions = await analyzeCovers([
      { bvid: 'BVskip', picUrl: 'https://i0.hdslb.com/skip.jpg' },
    ])

    expect(streamTextMock).not.toHaveBeenCalled()
    expect([...descriptions.entries()]).toEqual([])
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mixinKey,
  wbiSign,
  getWbiKeys,
  wbiFetch,
  __setWbiKeyCacheForTests,
  __resetWbiKeyCacheForTests,
} from '../../src/lib/bilibili-client/wbi.js'

const FAKE_IMG_KEY = '7cd4e0f53d5a4c5b8a3a8e6f7a8b9c0d'
const FAKE_SUB_KEY = '493d8a3c9e0c1b4d5e6f7a8b9c0d1e2f'

function seedWbiKeyCache(): void {
  __setWbiKeyCacheForTests({
    imgKey: FAKE_IMG_KEY,
    subKey: FAKE_SUB_KEY,
    fetchedAt: Date.now(),
  })
}

// 构造最小 Response mock：wbiFetch 在 401/-352 时会调用 response.clone().json()，
// 因此必须提供 clone 与 json 两个方法。
function mockResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true
  const status = init?.status ?? 200
  const json = async () => body
  return {
    ok,
    status,
    json,
    clone: () => ({ json }),
  }
}

// 401/-352 重试会清空 key 缓存并再次拉取 nav 接口；提供一个可复用的 nav 响应 mock。
function navResponse() {
  return mockResponse({
    data: {
      wbi_img: {
        img_url: `https://i0.hdslb.com/bfs/wbi/${FAKE_IMG_KEY}.png`,
        sub_url: `https://i0.hdslb.com/bfs/wbi/${FAKE_SUB_KEY}.png`,
      },
    },
  })
}

describe('mixinKey', () => {
  it('从 imgKey + subKey 提取 32 字符 mixinKey', () => {
    const result = mixinKey(FAKE_IMG_KEY, FAKE_SUB_KEY)
    expect(typeof result).toBe('string')
    expect(result).toHaveLength(32)
  })

  it('空 imgKey 抛错', () => {
    expect(() => mixinKey('', FAKE_SUB_KEY)).toThrow('imgKey is required')
  })

  it('空 subKey 抛错', () => {
    expect(() => mixinKey(FAKE_IMG_KEY, '')).toThrow('subKey is required')
  })

  it('合并长度不足 64 抛错', () => {
    expect(() => mixinKey('ab', 'cd')).toThrow(
      'WBI keys must contain at least 64 characters combined',
    )
  })
})

describe('wbiSign', () => {
  it('wbiSign 在保留原参数基础上追加 wts / w_rid', () => {
    const params = new URLSearchParams()
    params.set('keyword', 'react')
    params.set('search_type', 'video')

    const signed = wbiSign(params, FAKE_IMG_KEY, FAKE_SUB_KEY)

    expect(signed.get('keyword')).toBe('react')
    expect(signed.get('search_type')).toBe('video')
    expect(signed.has('wts')).toBe(true)
    expect(signed.has('w_rid')).toBe(true)
    // w_rid 为 32 位 hex（md5）
    expect(signed.get('w_rid')).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('getWbiKeys', () => {
  beforeEach(() => {
    __resetWbiKeyCacheForTests()
    vi.clearAllMocks()
  })

  afterEach(() => {
    __resetWbiKeyCacheForTests()
    vi.restoreAllMocks()
  })

  it('未命中缓存时调用 nav 接口拉取密钥', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(navResponse())

    const keys = await getWbiKeys()
    expect(keys.imgKey).toBe(FAKE_IMG_KEY)
    expect(keys.subKey).toBe(FAKE_SUB_KEY)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('命中缓存时两次 getWbiKeys 返回等价内容且不重复网络请求', async () => {
    seedWbiKeyCache()

    const first = await getWbiKeys()
    const second = await getWbiKeys()

    expect(first).toEqual(second)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('wbiFetch 重试', () => {
  beforeEach(() => {
    seedWbiKeyCache()
    vi.clearAllMocks()
  })

  afterEach(() => {
    __resetWbiKeyCacheForTests()
    vi.restoreAllMocks()
  })

  it('HTTP 401 触发一次重试', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(undefined, { ok: true, status: 401 }))
      .mockResolvedValueOnce(navResponse()) // 重试前清缓存 → 再次拉 nav
      .mockResolvedValueOnce(mockResponse({ code: 0 }))

    const url = new URL('https://api.bilibili.com/x/web-interface/wbi/search/type')
    url.searchParams.set('keyword', 'test')
    await wbiFetch(url)

    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('code=-352 风控触发一次重试', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ code: -352 }))
      .mockResolvedValueOnce(navResponse()) // 重试前清缓存 → 再次拉 nav
      .mockResolvedValueOnce(mockResponse({ code: 0 }))

    const url = new URL('https://api.bilibili.com/x/web-interface/wbi/search/type')
    url.searchParams.set('keyword', 'test')
    await wbiFetch(url)

    expect(global.fetch).toHaveBeenCalledTimes(3)
  })
})

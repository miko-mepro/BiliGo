import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  executeVideoRerank,
  RERANK_LLM_INACTIVITY_TIMEOUT_MS,
  type RerankMemoryStore,
  type LlmJsonCaller,
} from '../../src/tools/video-rerank.js'
import type {
  BilibiliVideoCard,
  WorkingMemory,
} from '../../src/lib/shared-types/index.js'

// hoisted mock for ./llm-json.js (3.7 §6.1)
const llmMocks = vi.hoisted(() => ({
  callLlmForJson: vi.fn(),
}))

vi.mock('../../src/tools/llm-json.js', () => ({
  callLlmForJson: llmMocks.callLlmForJson,
}))

// hoisted mock for ../lib/bilibili-client/tags.js (3.7 §6.1)
const tagsMocks = vi.hoisted(() => ({
  fetchVideoTags: vi.fn(),
}))

vi.mock('../../src/lib/bilibili-client/tags.js', () => ({
  fetchVideoTags: tagsMocks.fetchVideoTags,
}))

/** 构造单个 BilibiliVideoCard（3.7 §6.3 helper video(index, overrides?)）。 */
function video(index: number, overrides: Partial<BilibiliVideoCard> = {}): BilibiliVideoCard {
  const bvid = `BV${String(index).padStart(10, '0')}`
  return {
    bvid,
    aid: index,
    title: `视频${index}`,
    author: `UP主${index}`,
    pic: `https://example.com/pic${index}.jpg`,
    play: 1000 * index,
    videoReview: 100 * index,
    favorites: 50 * index,
    duration: '10:00',
    pubdate: Date.now(),
    tag: '',
    description: '',
    ...overrides,
  }
}

/** 构造 count 个视频（3.7 §6.3 helper videos(count)）。 */
function videos(count: number): BilibiliVideoCard[] {
  return Array.from({ length: count }, (_, i) => video(i + 1))
}

/**
 * 构造一个 memoryStore mock（3.7 §6.3 helper createMemoryStore(existing?)）。
 *
 * 默认空 WorkingMemory；传入 existing 可预置 failureReasons 等字段。
 * get/update 均为 vi.fn，便于断言调用参数。
 */
function createMemoryStore(
  existing?: Partial<WorkingMemory>,
): RerankMemoryStore {
  const store: WorkingMemory = {
    traceId: 'trace-1',
    triedKeywords: existing?.triedKeywords ?? [],
    rejectedBvids: existing?.rejectedBvids ?? [],
    failureReasons: existing?.failureReasons ?? [],
    clarificationCount: existing?.clarificationCount ?? 0,
  }
  return {
    get: vi.fn(async () => ({ ...store })),
    update: vi.fn(async (patch: Partial<WorkingMemory>) => {
      Object.assign(store, patch)
      return { ...store }
    }),
  }
}

/** 包装 callLlmForJson mock 为 LlmJsonCaller 类型，便于注入。 */
function asLlmCaller(fn: ReturnType<typeof vi.fn>): LlmJsonCaller {
  return fn as unknown as LlmJsonCaller
}

beforeEach(() => {
  vi.clearAllMocks()
  tagsMocks.fetchVideoTags.mockResolvedValue([])
})

/**
 * 构造 rerank deps，统一注入 mock 的 callLlmForJson 和传入的 memoryStore。
 */
function makeDeps(memoryStore: RerankMemoryStore, onActivity?: () => void): {
  memoryStore: RerankMemoryStore
  callLlmForJson: LlmJsonCaller
  onActivity?: () => void
} {
  return {
    memoryStore,
    callLlmForJson: asLlmCaller(llmMocks.callLlmForJson),
    ...(onActivity ? { onActivity } : {}),
  }
}

describe('video_rerank / candidates', () => {
  it('truncates candidates above thirty and reports trimmed', async () => {
    llmMocks.callLlmForJson.mockResolvedValue({
      items: videos(30).map((v, i) => ({
        bvid: v.bvid,
        score: 0.5,
        reason: 'ok',
      })),
    })
    const memoryStore = createMemoryStore()

    const result = await executeVideoRerank(videos(32), '测试意图', makeDeps(memoryStore))

    expect(result.strategy).toBe('llm')
    expect(result.trimmed).toBe(2)
    // 仅处理前 30 条；tags 调用次数 = 30（截断后）
    expect(tagsMocks.fetchVideoTags).toHaveBeenCalledTimes(30)
    // 返回的 items 全部来自前 30 条的 bvid
    const knownBvids = new Set(videos(30).map((v) => v.bvid))
    for (const item of result.items) {
      expect(knownBvids.has(item.bvid)).toBe(true)
    }
  })
})

describe('video_rerank / tags', () => {
  it('continues when one fetchVideoTags call fails', async () => {
    const cards = [video(1), video(2)]
    tagsMocks.fetchVideoTags.mockImplementation((bvid: string) => {
      if (bvid === cards[1].bvid) {
        return Promise.reject(new Error('tags fetch failed'))
      }
      return Promise.resolve([{ tag_id: 1, tag_name: '标签' }])
    })
    llmMocks.callLlmForJson.mockResolvedValue({
      items: [
        { bvid: cards[0].bvid, score: 0.8, reason: 'match' },
        { bvid: cards[1].bvid, score: 0.4, reason: 'low' },
      ],
    })
    const memoryStore = createMemoryStore()

    const result = await executeVideoRerank(cards, '意图', makeDeps(memoryStore))

    expect(result.strategy).toBe('llm')
    // LLM 仍被调用
    expect(llmMocks.callLlmForJson).toHaveBeenCalledTimes(1)
    expect(llmMocks.callLlmForJson.mock.calls[0][1]).toEqual({
      inactivityTimeoutMs: RERANK_LLM_INACTIVITY_TIMEOUT_MS,
    })
    // 失败的视频按空标签处理，不阻断
    expect(result.items).toHaveLength(2)
  })

  it('limits tag requests to 15 concurrent calls across three batches', async () => {
    const cards = videos(30)
    let active = 0
    let maxActive = 0
    const releases: Array<() => void> = []
    tagsMocks.fetchVideoTags.mockImplementation(() => new Promise((resolve) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      releases.push(() => {
        active -= 1
        resolve([])
      })
    }))
    llmMocks.callLlmForJson.mockResolvedValue({
      items: cards.map((card) => ({ bvid: card.bvid, score: 0.5, reason: 'ok' })),
    })
    const activity = vi.fn()
    const memoryStore = createMemoryStore()
    const promise = executeVideoRerank(cards, '意图', makeDeps(memoryStore, activity))

    await vi.waitFor(() => {
      expect(tagsMocks.fetchVideoTags).toHaveBeenCalledTimes(15)
    })
    expect(maxActive).toBe(15)
    releases.splice(0).forEach((release) => release())

    await vi.waitFor(() => {
      expect(tagsMocks.fetchVideoTags).toHaveBeenCalledTimes(30)
    })
    expect(maxActive).toBe(15)
    releases.splice(0).forEach((release) => release())

    const result = await promise
    expect(result.strategy).toBe('llm')
    expect(activity).toHaveBeenCalledTimes(6)
  })

  it('reports completed tag batches and each LLM output activity', async () => {
    const cards = videos(6)
    const activity = vi.fn()
    tagsMocks.fetchVideoTags.mockResolvedValue([])
    llmMocks.callLlmForJson.mockImplementation(async (
      _messages,
      options: { onActivity?: () => void } | undefined,
    ) => {
      options?.onActivity?.()
      options?.onActivity?.()
      return {
        items: cards.map((card) => ({ bvid: card.bvid, score: 0.5, reason: 'ok' })),
      }
    })
    const memoryStore = createMemoryStore()

    const result = await executeVideoRerank(cards, '意图', makeDeps(memoryStore, activity))

    expect(result.strategy).toBe('llm')
    expect(activity).toHaveBeenCalledTimes(4)
    expect(llmMocks.callLlmForJson.mock.calls[0][1].onActivity).toBe(activity)
  })
})

describe('video_rerank / LLM ranking', () => {
  it('sorts valid LLM scores in descending order', async () => {
    const cards = [video(1), video(2), video(3)]
    llmMocks.callLlmForJson.mockResolvedValue({
      items: [
        { bvid: cards[0].bvid, score: 0.3, reason: '低' },
        { bvid: cards[1].bvid, score: 0.9, reason: '高' },
        { bvid: cards[2].bvid, score: 0.6, reason: '中' },
      ],
    })
    const memoryStore = createMemoryStore()

    const result = await executeVideoRerank(cards, '意图', makeDeps(memoryStore))

    expect(result.strategy).toBe('llm')
    const scores = result.items.map((i) => i.score)
    // 降序：0.9, 0.6, 0.3
    expect(scores).toEqual([0.9, 0.6, 0.3])
    expect(result.items[0].bvid).toBe(cards[1].bvid)
  })
})

describe('video_rerank / validation', () => {
  it('drops bvid values not present in candidates', async () => {
    const cards = [video(1), video(2)]
    llmMocks.callLlmForJson.mockResolvedValue({
      items: [
        { bvid: cards[0].bvid, score: 0.8, reason: 'ok' },
        { bvid: 'BV_UNKNOWN_999', score: 0.95, reason: 'fake' },
        { bvid: cards[1].bvid, score: 0.5, reason: 'ok2' },
      ],
    })
    const memoryStore = createMemoryStore()

    const result = await executeVideoRerank(cards, '意图', makeDeps(memoryStore))

    expect(result.strategy).toBe('llm')
    const bvids = result.items.map((i) => i.bvid)
    expect(bvids).not.toContain('BV_UNKNOWN_999')
    expect(bvids).toEqual(expect.arrayContaining([cards[0].bvid, cards[1].bvid]))
  })

  it('clamps scores into the inclusive zero-to-one range', async () => {
    const cards = [video(1), video(2), video(3)]
    llmMocks.callLlmForJson.mockResolvedValue({
      items: [
        { bvid: cards[0].bvid, score: -0.4, reason: '负' },
        { bvid: cards[1].bvid, score: 0.5, reason: '中' },
        { bvid: cards[2].bvid, score: 1.8, reason: '超' },
      ],
    })
    const memoryStore = createMemoryStore()

    const result = await executeVideoRerank(cards, '意图', makeDeps(memoryStore))

    const scores = result.items.map((i) => i.score).sort((a, b) => a - b)
    // clamp 结果：0, 0.5, 1（按升序便于断言）
    expect(scores).toEqual([0, 0.5, 1])
  })
})

describe('video_rerank / fallback', () => {
  it('preserves candidate order with decreasing fallback scores', async () => {
    const cards = [video(1), video(2), video(3)]
    llmMocks.callLlmForJson.mockResolvedValue(null)
    const memoryStore = createMemoryStore()

    const result = await executeVideoRerank(cards, '意图', makeDeps(memoryStore))

    expect(result.strategy).toBe('fallback')
    // 原序保持
    expect(result.items.map((i) => i.bvid)).toEqual([
      cards[0].bvid,
      cards[1].bvid,
      cards[2].bvid,
    ])
    // score = 1 - i * 0.01：1, 0.99, 0.98
    expect(result.items.map((i) => i.score)).toEqual([1, 0.99, 0.98])
    expect(result.items.every((i) => i.reason === 'fallback')).toBe(true)
  })

  it('records the fallback reason in memory', async () => {
    const cards = [video(1), video(2)]
    llmMocks.callLlmForJson.mockResolvedValue(null)
    // 预置已有的 failureReasons，验证追加而非覆盖
    const memoryStore = createMemoryStore({
      failureReasons: ['previous_error'],
    })

    const result = await executeVideoRerank(cards, '意图', makeDeps(memoryStore))

    expect(result.strategy).toBe('fallback')
    expect(memoryStore.update).toHaveBeenCalled()
    const updateCall = (memoryStore.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => (call[0] as Partial<WorkingMemory>).failureReasons !== undefined,
    )
    expect(updateCall).toBeDefined()
    const reasons = (updateCall![0] as Partial<WorkingMemory>).failureReasons!
    // 保留旧值
    expect(reasons).toContain('previous_error')
    // 追加 rerank_fallback: 前缀
    expect(reasons.some((r) => r.startsWith('rerank_fallback:'))).toBe(true)
  })
})

describe('video_rerank / empty', () => {
  it('returns an empty fallback without external calls', async () => {
    const memoryStore = createMemoryStore()

    const result = await executeVideoRerank([], '意图', makeDeps(memoryStore))

    expect(result.items).toEqual([])
    expect(result.strategy).toBe('fallback')
    expect(result.trimmed).toBe(0)
    // 不调 tags / LLM
    expect(tagsMocks.fetchVideoTags).not.toHaveBeenCalled()
    expect(llmMocks.callLlmForJson).not.toHaveBeenCalled()
  })
})

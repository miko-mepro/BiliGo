import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createBilibiliSearchTool,
  executeBilibiliSearch,
} from '../../src/tools/bilibili-search.js'
import type { BilibiliVideoCard } from '../../src/lib/shared-types/index.js'

/**
 * bilibili_search 工具单测（工厂函数注入依赖模式）。
 *
 * 参照 test/tools/slang-understand.test.ts / test/tools/query-expand.test.ts 的
 * 工厂函数注入依赖模式：mock searchVideo 和 analyzeCoversFn，避免触发真实 B站接口。
 *
 * 覆盖点（与任务要求对齐）：
 * 1. execute 正常路径（返回视频列表）
 * 2. 依赖抛错降级路径（searchVideo 抛错时 executeBilibiliSearch 的行为）
 * 3. working-memory 交互（analyze_covers=true 时调用 analyzeCoversFn 附加描述）
 */

// ---- Mock searchVideo ----
// bilibili-search.ts 直接 import { searchVideo } from '../lib/bilibili-client/search.js'，
// 用 vi.mock 替换为可控 mock，避免触发真实 wbi 签名和 fetch。
// 同时保留 BilibiliRiskError 类定义（原模块导出，mock 需导出以供断言错误 name 用）。
// 用 vi.hoisted 把所有 mock 工厂内容提升到模块顶部，避免 ReferenceError。
const searchMocks = vi.hoisted(() => {
  class BilibiliRiskError extends Error {
    readonly code = -352
    constructor(message = 'Bilibili risk control triggered') {
      super(message)
      this.name = 'BilibiliRiskError'
    }
  }
  return {
    searchVideo: vi.fn(),
    BilibiliRiskError,
  }
})

vi.mock('../../src/lib/bilibili-client/search.js', () => ({
  searchVideo: searchMocks.searchVideo,
  BilibiliRiskError: searchMocks.BilibiliRiskError,
}))

// 导出 BilibiliRiskError 便于用例 3a 直接构造
const { BilibiliRiskError } = searchMocks

// ---- Mock chrome.cookies ----
// bilibili-search.ts 通过 chrome.cookies.get 读 SESSDATA（getSessdata），
// test/setup.ts 注入的 chrome.cookies.get 默认 resolve(null)，此处覆盖为可控 mock。
const mockCookiesGet = vi.fn()

/** 构造最小合法视频卡片。 */
function makeVideoCard(
  overrides: Partial<BilibiliVideoCard> = {},
): BilibiliVideoCard {
  return {
    bvid: 'BV1aa',
    aid: 1,
    title: 'video1',
    author: 'up主',
    pic: 'https://example.com/pic1.jpg',
    play: 1000,
    videoReview: 10,
    favorites: 50,
    duration: '10:30',
    pubdate: 1700000000,
    tag: '鬼畜',
    description: 'desc',
    ...overrides,
  }
}

/** 构造 mock analyzeCoversFn（直接返回 vi.fn，其 .mock 属性原生可用）。 */
function createMockAnalyzeCoversFn(
  descMap: Map<string, string> = new Map(),
): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Map(descMap))
}

beforeEach(() => {
  vi.clearAllMocks()
  // 默认 chrome.cookies.get 返回 null（游客身份）
  mockCookiesGet.mockResolvedValue(null)
  ;(globalThis.chrome as any).cookies = {
    get: mockCookiesGet,
  }
  // 默认 searchVideo 返回 2 条视频
  searchMocks.searchVideo.mockResolvedValue([
    makeVideoCard({ bvid: 'BV1', pic: 'https://i.bili.com/1.jpg', title: 'v1' }),
    makeVideoCard({ bvid: 'BV2', pic: 'https://i.bili.com/2.jpg', title: 'v2' }),
  ])
})

describe('bilibili_search / 正常路径', () => {
  it('1a) execute 正常路径返回视频列表', async () => {
    const videos = await executeBilibiliSearch('鬼畜')

    expect(videos).toHaveLength(2)
    expect(videos[0].bvid).toBe('BV1')
    expect(videos[1].bvid).toBe('BV2')

    // 验证 searchVideo 被调用，keyword 透传
    expect(searchMocks.searchVideo).toHaveBeenCalledTimes(1)
    expect(searchMocks.searchVideo).toHaveBeenCalledWith(
      '鬼畜',
      {},
      undefined, // 游客身份 sessdata 为 undefined
    )
  })

  it('1b) order 透传给 searchVideo 的 opts.order', async () => {
    await executeBilibiliSearch('鬼畜', 'click')

    const callArgs = searchMocks.searchVideo.mock.calls[0]
    expect(callArgs[1]).toEqual({ order: 'click' })
  })

  it('1c) SESSDATA cookie 存在时传入 searchVideo 的 sessdata 参数', async () => {
    mockCookiesGet.mockResolvedValue({ value: 'sessdata-abc' })

    await executeBilibiliSearch('鬼畜')

    expect(mockCookiesGet).toHaveBeenCalledWith({
      url: 'https://www.bilibili.com',
      name: 'SESSDATA',
    })
    expect(searchMocks.searchVideo).toHaveBeenCalledWith('鬼畜', {}, 'sessdata-abc')
  })

  it('1d) 通过工厂 tool().execute 调用同样返回视频列表', async () => {
    const toolDef = createBilibiliSearchTool()
    const execute = toolDef.execute
    if (!execute) throw new Error('tool.execute missing')

    // AI SDK tool() execute 接受 input + options
    const result = await execute(
      { keyword: 'mad' },
      { toolCallId: 'tc', messages: [], abortSignal: undefined },
    )

    expect(result).toHaveLength(2)
    expect(searchMocks.searchVideo).toHaveBeenCalledWith('mad', {}, undefined)
  })
})

describe('bilibili_search / 空关键词', () => {
  it('2a) keyword 为空串抛 "bilibili_search requires a keyword argument"', async () => {
    await expect(executeBilibiliSearch('')).rejects.toThrow(
      'bilibili_search requires a keyword argument',
    )
    // 不应访问 chrome.cookies 或 searchVideo
    expect(mockCookiesGet).not.toHaveBeenCalled()
    expect(searchMocks.searchVideo).not.toHaveBeenCalled()
  })

  it('2b) keyword 仅空白也抛相同错误', async () => {
    await expect(executeBilibiliSearch('   ')).rejects.toThrow(
      'bilibili_search requires a keyword argument',
    )
    expect(searchMocks.searchVideo).not.toHaveBeenCalled()
  })
})

describe('bilibili_search / 依赖抛错降级路径', () => {
  /**
   * executeBilibiliSearch 本身没有 try-catch 包裹 searchVideo 调用，
   * 抛错时直接向上传播；上层编排（SC-1 stream.ts）catch 会转为 error 消息。
   *
   * 本测试验证：searchVideo 抛 BilibiliRiskError 时 executeBilibiliSearch
   * 正确向上传播（不吞错），上层可捕获并降级。
   */
  it('3a) searchVideo 抛 BilibiliRiskError 时 executeBilibiliSearch 向上传播', async () => {
    searchMocks.searchVideo.mockRejectedValue(new BilibiliRiskError('风控触发'))

    await expect(executeBilibiliSearch('鬼畜')).rejects.toThrow('风控触发')
    // 验证错误 name 保留（上层 SC-1 依据 name 转为 code=BILIBILI_RISK）
    await expect(executeBilibiliSearch('鬼畜')).rejects.toMatchObject({
      name: 'BilibiliRiskError',
    })
  })

  it('3b) searchVideo 抛普通 Error 时 executeBilibiliSearch 向上传播', async () => {
    searchMocks.searchVideo.mockRejectedValue(new Error('网络连接失败'))

    await expect(executeBilibiliSearch('鬼畜')).rejects.toThrow('网络连接失败')
  })

  it('3c) chrome.cookies.get 抛异常时降级为游客身份继续搜索', async () => {
    // getSessdata 内部 try-catch 吞掉 cookies 异常，返回 undefined 继续游客搜索
    mockCookiesGet.mockRejectedValue(new Error('chrome cookies api unavailable'))

    const videos = await executeBilibiliSearch('鬼畜')

    // cookies.get 抛错被吞，sessdata 为 undefined，searchVideo 正常调用
    expect(videos).toHaveLength(2)
    expect(searchMocks.searchVideo).toHaveBeenCalledWith('鬼畜', {}, undefined)
  })
})

describe('bilibili_search / working-memory 交互（封面分析）', () => {
  /**
   * analyze_covers=true 时，对前 5 条有 bvid+pic 的视频调用 analyzeCoversFn，
   * 将返回的描述附加到对应视频的 coverDescription 字段。
   */
  it('4a) analyze_covers=true 且注入 analyzeCoversFn 时附加封面描述', async () => {
    const descMap = new Map([
      ['BV1', '封面是鬼畜全明星'],
      ['BV2', '封面是动漫截图'],
    ])
    const analyzeCoversFn = createMockAnalyzeCoversFn(descMap)

    const videos = await executeBilibiliSearch(
      '鬼畜',
      undefined,
      true, // analyzeCovers
      analyzeCoversFn,
    )

    // analyzeCoversFn 被调用，传入前 5 条 CoverInput
    expect(analyzeCoversFn).toHaveBeenCalledTimes(1)
    const callArgs = (analyzeCoversFn as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs).toHaveLength(2)
    expect(callArgs[0]).toEqual({
      bvid: 'BV1',
      picUrl: 'https://i.bili.com/1.jpg',
    })
    expect(callArgs[1]).toEqual({
      bvid: 'BV2',
      picUrl: 'https://i.bili.com/2.jpg',
    })

    // coverDescription 被附加到对应视频
    expect((videos[0] as any).coverDescription).toBe('封面是鬼畜全明星')
    expect((videos[1] as any).coverDescription).toBe('封面是动漫截图')
  })

  it('4b) analyze_covers=true 但 analyzeCoversFn 缺省时不调用封面分析', async () => {
    // 工厂未注入 analyzeCovers 时，analyze_covers=true 也不调用
    const videos = await executeBilibiliSearch('鬼畜', undefined, true, undefined)

    // 返回原视频列表，不附加 coverDescription
    expect(videos).toHaveLength(2)
    expect((videos[0] as any).coverDescription).toBeUndefined()
  })

  it('4c) analyze_covers=false 时不调用 analyzeCoversFn', async () => {
    const analyzeCoversFn = createMockAnalyzeCoversFn()

    await executeBilibiliSearch('鬼畜', undefined, false, analyzeCoversFn)

    expect(analyzeCoversFn).not.toHaveBeenCalled()
  })

  it('4d) 视频列表超过 5 条时仅对前 5 条做封面分析（HARD_MAX_COVERS=5）', async () => {
    // 构造 7 条视频
    const sevenVideos = Array.from({ length: 7 }, (_, i) =>
      makeVideoCard({
        bvid: `BV${i}`,
        pic: `https://i.bili.com/${i}.jpg`,
        title: `v${i}`,
      }),
    )
    searchMocks.searchVideo.mockResolvedValue(sevenVideos)

    const analyzeCoversFn = createMockAnalyzeCoversFn(
      new Map([['BV0', 'desc0']]),
    )

    await executeBilibiliSearch('鬼畜', undefined, true, analyzeCoversFn)

    // analyzeCoversFn 收到的 covers 长度被截断为 5（HARD_MAX_COVERS）
    const analyzeCoversFnSpy = analyzeCoversFn as ReturnType<typeof vi.fn>
    const analyzeCallArgs = analyzeCoversFnSpy.mock.calls[0][0]
    expect(analyzeCallArgs).toHaveLength(5)
    expect(analyzeCallArgs[0].bvid).toBe('BV0')
    expect(analyzeCallArgs[4].bvid).toBe('BV4')

    // 第 2 个参数 maxN 也应为 5
    expect(analyzeCoversFnSpy.mock.calls[0][1]).toBe(5)
  })

  it('4e) 无 bvid 或 pic 的视频被过滤，不传入 analyzeCoversFn', async () => {
    searchMocks.searchVideo.mockResolvedValue([
      makeVideoCard({ bvid: 'BV1', pic: 'https://i.bili.com/1.jpg' }),
      makeVideoCard({ bvid: '', pic: 'https://i.bili.com/2.jpg' }), // 无 bvid，过滤
      makeVideoCard({ bvid: 'BV3', pic: '' }), // 无 pic，过滤
    ])

    const analyzeCoversFn = createMockAnalyzeCoversFn()
    await executeBilibiliSearch('鬼畜', undefined, true, analyzeCoversFn)

    // 仅 BV1 通过过滤
    const callArgs = (analyzeCoversFn as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs).toHaveLength(1)
    expect(callArgs[0].bvid).toBe('BV1')
  })
})

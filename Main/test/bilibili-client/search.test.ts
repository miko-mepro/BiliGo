import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  searchVideo,
  BilibiliRiskError,
  BilibiliNetworkError,
  BilibiliApiError,
} from '../../src/lib/bilibili-client/search.js'
import {
  __setWbiKeyCacheForTests,
  __resetWbiKeyCacheForTests,
} from '../../src/lib/bilibili-client/wbi.js'
import type { BilibiliVideoCard } from '../../src/lib/shared-types/index.js'

// 通过预置 WBI 密钥缓存，避免测试触达真实网络拉取 nav 接口。
const FAKE_IMG_KEY = '7cd4e0f53d5a4c5b8a3a8e6f7a8b9c0d'
const FAKE_SUB_KEY = '493d8a3c9e0c1b4d5e6f7a8b9c0d1e2f'

function seedWbiKeyCache(): void {
  __setWbiKeyCacheForTests({
    imgKey: FAKE_IMG_KEY,
    subKey: FAKE_SUB_KEY,
    fetchedAt: Date.now(),
  })
}

// 构造一个最小可用的 Response mock：包含 ok/status/json/clone，
// 以兼容 wbiFetch 在 401/-352 重试判定里调用的 response.clone().json() 链路。
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

// -352 / 401 重试会清空 key 缓存并再次拉取 nav 接口；提供一个可复用的 nav 响应 mock。
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

function makeVideoResult() {
  return {
    aid: 12345,
    bvid: 'BV1xx411c7mD',
    title: '示例视频标题',
    author: '示例UP主',
    pic: 'http://example.com/pic.jpg',
    tag: '测试,标签',
    play: 1000,
    video_review: 200,
    favorites: 300,
    duration: '10:30',
    pubdate: 1700000000,
    description: '示例描述',
  }
}

function makeExpectedCard(): BilibiliVideoCard {
  const r = makeVideoResult()
  return {
    aid: r.aid,
    bvid: r.bvid,
    title: r.title,
    author: r.author,
    pic: r.pic,
    tag: r.tag,
    play: r.play,
    videoReview: r.video_review,
    favorites: r.favorites,
    duration: r.duration,
    pubdate: r.pubdate,
    description: r.description,
  }
}

describe('searchVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedWbiKeyCache()
  })

  afterEach(() => {
    __resetWbiKeyCacheForTests()
    vi.restoreAllMocks()
  })

  it('正常返回时映射为 BilibiliVideoCard 数组', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse({ code: 0, data: { result: [makeVideoResult()] } }),
    )

    const result = await searchVideo('test')
    expect(result).toEqual([makeExpectedCard()])
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('HTTP 非 2xx 抛 BilibiliNetworkError', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(undefined, { ok: false, status: 500 }),
    )

    await expect(searchVideo('test')).rejects.toThrow(BilibiliNetworkError)
  })

  it('code=-352 抛 BilibiliRiskError', async () => {
    // wbiFetch 在 -352 时会自动清缓存并重试一次，重试返回的仍是 -352
    // 则由 searchVideo 抛风险错误。
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ code: -352, message: 'risk' }))
      .mockResolvedValueOnce(navResponse())
      .mockResolvedValueOnce(mockResponse({ code: -352, message: 'risk' }))

    await expect(searchVideo('test')).rejects.toThrow(BilibiliRiskError)
  })

  it('code 非 0 非 -352 抛 BilibiliApiError', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse({ code: -400, message: 'bad request' }),
    )

    await expect(searchVideo('test')).rejects.toThrow(BilibiliApiError)
  })

  it('合法 SESSDATA 会附 Cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockResponse({ code: 0, data: { result: [] } }),
    )
    global.fetch = fetchMock

    // 仅含字母/数字与模式内符号，匹配 SESSDATA_PATTERN
    await searchVideo('test', {}, 'aB1,_-*%')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Cookie).toBe('SESSDATA=aB1,_-*%')
  })

  it('非法 SESSDATA 不附 Cookie，降级匿名搜索', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockResponse({ code: 0, data: { result: [] } }),
    )
    global.fetch = fetchMock

    // 含非法字符 "#"，不匹配 SESSDATA_PATTERN
    await searchVideo('test', {}, 'bad#sessdata')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Cookie).toBeUndefined()
  })
})

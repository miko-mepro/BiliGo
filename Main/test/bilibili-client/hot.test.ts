import { describe, it, expect, beforeEach, vi } from 'vitest'
import { searchHot, type HotKeyword } from '../../src/lib/bilibili-client/hot.js'
import {
  BilibiliNetworkError,
  BilibiliApiError,
} from '../../src/lib/bilibili-client/search.js'

describe('searchHot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch and parse hot keywords successfully', async () => {
    const mockResponse: HotKeyword[] = [
      {
        keyword: 'test keyword 1',
        show_name: 'Test Keyword 1',
        icon: 'http://example.com/icon1.png',
        pos: 1,
      },
      {
        keyword: 'test keyword 2',
        show_name: 'Test Keyword 2',
        pos: 2,
      },
    ]

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          list: [
            {
              position: 1,
              keyword: 'test keyword 1',
              show_name: 'Test Keyword 1',
              icon: 'http://example.com/icon1.png',
            },
            {
              position: 2,
              keyword: 'test keyword 2',
              show_name: 'Test Keyword 2',
            },
          ],
        },
      }),
    })

    const result = await searchHot(20)
    expect(result).toEqual(mockResponse)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://app.bilibili.com/x/v2/search/trending/ranking',
      ),
      expect.any(Object),
    )
  })

  it('should throw BilibiliNetworkError on HTTP failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await expect(searchHot()).rejects.toThrow(BilibiliNetworkError)
  })

  it('should throw BilibiliApiError on non-zero code', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: -1,
        message: 'API error',
      }),
    })

    await expect(searchHot()).rejects.toThrow(BilibiliApiError)
  })
})

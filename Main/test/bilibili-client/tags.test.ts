import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import {
  fetchVideoTags,
  type VideoTag,
} from '../../src/lib/bilibili-client/tags.js'
import {
  BilibiliApiError,
  BilibiliNetworkError,
} from '../../src/lib/bilibili-client/search.js'

describe('fetchVideoTags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should fetch tags successfully', async () => {
    const mockResponse: VideoTag[] = [
      { tag_id: 12620189, tag_name: '异度侵入' },
      { tag_id: 707, tag_name: 'ED', cover: 'http://example.com/ed.jpg' },
    ]

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 0,
        data: mockResponse,
      }),
    })

    const result = await fetchVideoTags('BV1M741177Kg')

    expect(result).toEqual(mockResponse)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('bvid=BV1M741177Kg'),
      expect.any(Object),
    )
  })

  it('should throw on invalid bvid', async () => {
    await expect(fetchVideoTags('')).rejects.toThrow(BilibiliApiError)
    await expect(fetchVideoTags('invalid')).rejects.toThrow(
      'Invalid bvid format: invalid',
    )
  })

  it('should throw on API error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: -400,
        message: 'Request error',
      }),
    })

    await expect(fetchVideoTags('BV1M741177Kg')).rejects.toThrow(
      BilibiliApiError,
    )
  })
})

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import { searchSuggest } from '../../src/lib/bilibili-client/suggest.js'

describe('searchSuggest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns suggest items on success', async () => {
    const mockResponse = {
      code: 0,
      result: {
        tag: [
          { value: 'react', ref: 0, type: '' },
          { value: 'react 18', ref: 0, type: '' },
        ],
      },
    }

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const result = await searchSuggest('react')
    expect(result).toEqual([
      { value: 'react', ref: 0, type: '' },
      { value: 'react 18', ref: 0, type: '' },
    ])
  })

  it('throws error when term is empty', async () => {
    await expect(searchSuggest('')).rejects.toThrow('term required')
  })

  it('throws error on API failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await expect(searchSuggest('test')).rejects.toThrow('HTTP 500')
  })
})

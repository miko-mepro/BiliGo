import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getSessionMemory,
  updateSessionMemory,
  clearSessionMemory,
} from '../../src/config/session-memory.js'
import type { SessionMemory } from '../../src/lib/shared-types/index.js'

describe('SessionMemory', () => {
  let store: Record<string, SessionMemory>

  beforeEach(() => {
    vi.clearAllMocks()
    store = {}

    ;(
      chrome.storage.session.get as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      (
        key: string | string[] | Record<string, unknown>,
      ): Promise<Record<string, SessionMemory>> => {
        const keys: string[] =
          typeof key === 'string' ? [key] : Array.isArray(key) ? key : Object.keys(key as Record<string, unknown>)
        const result: Record<string, SessionMemory> = {}
        keys.forEach((k) => {
          if (store[k]) {
            result[k] = JSON.parse(JSON.stringify(store[k])) as SessionMemory
          }
        })
        return Promise.resolve(result)
      },
    )

    ;(
      chrome.storage.session.set as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((data: Record<string, SessionMemory>) => {
      Object.assign(store, data)
      return Promise.resolve()
    })

    ;(
      chrome.storage.session.remove as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((keys: string[]) => {
      keys.forEach((k: string) => delete store[k])
      return Promise.resolve()
    })
  })

  it('returns empty skeleton for non-existent conversation', async () => {
    const memory = await getSessionMemory('conv-1')
    expect(memory).toEqual({
      conversationId: 'conv-1',
      recentUnderstandings: [],
      recentExpansions: [],
      updatedAt: expect.any(Number),
    })
  })

  it('writes and reads session memory', async () => {
    const result = await updateSessionMemory('conv-1', {
      recentUnderstandings: [
        {
          original: 'pdd',
          normalized: 'pinduoduo',
          explanation: 'Chinese e-commerce platform',
          matchedDict: true,
        },
      ],
    })
    expect(result).toBe(true)

    const retrieved = await getSessionMemory('conv-1')
    expect(retrieved.recentUnderstandings).toHaveLength(1)
    expect(retrieved.recentUnderstandings[0].original).toBe('pdd')
  })

  it('truncates to LRU 20 items', async () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      original: `term${i}`,
      normalized: `normalized${i}`,
      explanation: `explanation${i}`,
      matchedDict: false,
    }))

    const result = await updateSessionMemory('conv-1', {
      recentUnderstandings: items,
    })
    expect(result).toBe(true)

    const retrieved = await getSessionMemory('conv-1')
    expect(retrieved.recentUnderstandings).toHaveLength(20)
    expect(retrieved.recentUnderstandings[0].original).toBe('term5')
    expect(retrieved.recentUnderstandings[19].original).toBe('term24')
  })

  it('clears session memory', async () => {
    await updateSessionMemory('conv-1', {
      recentUnderstandings: [
        {
          original: 'test',
          normalized: 'test',
          explanation: 'test',
          matchedDict: false,
        },
      ],
    })

    await clearSessionMemory('conv-1')
    const retrieved = await getSessionMemory('conv-1')
    expect(retrieved.recentUnderstandings).toHaveLength(0)
  })

  it('rejects write when serialized data exceeds 100KB', async () => {
    const largeString = 'x'.repeat(101 * 1024)
    const expansions = Array.from({ length: 100 }, () => ({
      keywords: [largeString],
      tags: [largeString],
      categories: [largeString],
      rationale: largeString,
    }))

    const result = await updateSessionMemory('conv-1', {
      recentExpansions: expansions,
    })
    expect(result).toBe(false)
  })
})

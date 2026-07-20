import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkingMemoryStore } from '../../src/tools/working-memory.js'
import type { WorkingMemory } from '../../src/lib/shared-types/index.js'

const STORAGE_PREFIX = 'working-memory:'
const TTL_MS = 5 * 60 * 1000

interface StoredEntry {
  data: WorkingMemory
  expiresAt: number
}

function makeStorageMock() {
  const store = new Map<string, StoredEntry>()
  const get = vi.fn(async (key: string) => {
    const entry = store.get(key)
    return entry ? { [key]: entry } : {}
  })
  const set = vi.fn(async (entries: Record<string, StoredEntry>) => {
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
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
  storage = makeStorageMock()
  chrome.storage.session.get = storage.get as any
  chrome.storage.session.set = storage.set as any
  chrome.storage.session.remove = storage.remove as any
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WorkingMemoryStore.create', () => {
  it('stores a fresh empty memory and returns it', async () => {
    const memory = await WorkingMemoryStore.create('trace_1')

    expect(memory).toEqual({
      traceId: 'trace_1',
      triedKeywords: [],
      rejectedBvids: [],
      failureReasons: [],
      clarificationCount: 0,
    })
    expect(storage.set).toHaveBeenCalledTimes(1)
    const storedEntry = storage.store.get(STORAGE_PREFIX + 'trace_1')
    expect(storedEntry).toBeDefined()
    expect(storedEntry!.expiresAt).toBe(Date.now() + TTL_MS)
    expect(storedEntry!.data).toEqual(memory)
  })
})

describe('WorkingMemoryStore.get', () => {
  it('returns the memory immediately after create', async () => {
    await WorkingMemoryStore.create('trace_1')

    const memory = await WorkingMemoryStore.get('trace_1')

    expect(memory).toBeDefined()
    expect(memory!.traceId).toBe('trace_1')
    expect(memory!.clarificationCount).toBe(0)
  })

  it('returns the memory 4 minutes after create (not expired)', async () => {
    await WorkingMemoryStore.create('trace_1')

    vi.setSystemTime(new Date('2025-01-01T00:04:00Z'))

    const memory = await WorkingMemoryStore.get('trace_1')

    expect(memory).toBeDefined()
    expect(memory!.traceId).toBe('trace_1')
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('returns undefined and cleans storage 5 min + 1 sec after create (expired)', async () => {
    await WorkingMemoryStore.create('trace_1')

    vi.setSystemTime(new Date('2025-01-01T00:05:01Z'))

    const memory = await WorkingMemoryStore.get('trace_1')

    expect(memory).toBeUndefined()
    expect(storage.remove).toHaveBeenCalledTimes(1)
    expect(storage.remove).toHaveBeenCalledWith(STORAGE_PREFIX + 'trace_1')
    expect(storage.store.has(STORAGE_PREFIX + 'trace_1')).toBe(false)
  })

  it('returns undefined for an unknown traceId', async () => {
    const memory = await WorkingMemoryStore.get('never_created')

    expect(memory).toBeUndefined()
    expect(storage.remove).not.toHaveBeenCalled()
  })
})

describe('WorkingMemoryStore.update', () => {
  it('merges a patch into the existing memory', async () => {
    await WorkingMemoryStore.create('trace_1')

    const updated = await WorkingMemoryStore.update('trace_1', {
      triedKeywords: ['鬼畜'],
      clarificationCount: 1,
    })

    expect(updated).toBeDefined()
    expect(updated!.traceId).toBe('trace_1')
    expect(updated!.triedKeywords).toEqual(['鬼畜'])
    expect(updated!.clarificationCount).toBe(1)
    expect(updated!.rejectedBvids).toEqual([])
    expect(updated!.failureReasons).toEqual([])

    const storedEntry = storage.store.get(STORAGE_PREFIX + 'trace_1')
    expect(storedEntry!.data).toEqual(updated)
  })

  it('preserves old fields when only some are patched (merge semantics)', async () => {
    await WorkingMemoryStore.create('trace_1')
    await WorkingMemoryStore.update('trace_1', {
      triedKeywords: ['鬼畜'],
    })
    await WorkingMemoryStore.update('trace_1', {
      rejectedBvids: ['BV1xxx'],
    })

    const memory = await WorkingMemoryStore.get('trace_1')

    expect(memory).toBeDefined()
    expect(memory!.triedKeywords).toEqual(['鬼畜'])
    expect(memory!.rejectedBvids).toEqual(['BV1xxx'])
    expect(memory!.failureReasons).toEqual([])
    expect(memory!.clarificationCount).toBe(0)
  })

  it('refreshes the TTL on update', async () => {
    await WorkingMemoryStore.create('trace_1')
    const initialExpiresAt = storage.store.get(STORAGE_PREFIX + 'trace_1')!
      .expiresAt

    vi.setSystemTime(new Date('2025-01-01T00:03:00Z'))

    await WorkingMemoryStore.update('trace_1', {
      triedKeywords: ['update'],
    })

    const refreshedExpiresAt = storage.store.get(STORAGE_PREFIX + 'trace_1')!
      .expiresAt
    expect(refreshedExpiresAt).toBe(Date.now() + TTL_MS)
    expect(refreshedExpiresAt).toBeGreaterThan(initialExpiresAt)
  })

  it('returns undefined when updating an unknown traceId', async () => {
    const result = await WorkingMemoryStore.update('never_created', {
      triedKeywords: ['foo'],
    })

    expect(result).toBeUndefined()
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('does not allow patch to overwrite traceId', async () => {
    await WorkingMemoryStore.create('trace_1')

    const updated = await WorkingMemoryStore.update('trace_1', {
      traceId: 'tampered' as any,
    })

    expect(updated!.traceId).toBe('trace_1')
    const storedEntry = storage.store.get(STORAGE_PREFIX + 'trace_1')
    expect(storedEntry!.data.traceId).toBe('trace_1')
  })

  it('returns undefined when updating after expiry', async () => {
    await WorkingMemoryStore.create('trace_1')

    vi.setSystemTime(new Date('2025-01-01T00:06:00Z'))

    const result = await WorkingMemoryStore.update('trace_1', {
      triedKeywords: ['late'],
    })

    expect(result).toBeUndefined()
  })

  it('lets the caller accumulate clarificationCount (store only merges)', async () => {
    await WorkingMemoryStore.create('trace_1')

    const current = await WorkingMemoryStore.get('trace_1')
    await WorkingMemoryStore.update('trace_1', {
      clarificationCount: (current!.clarificationCount ?? 0) + 1,
    })
    const afterFirst = await WorkingMemoryStore.get('trace_1')
    await WorkingMemoryStore.update('trace_1', {
      clarificationCount: (afterFirst!.clarificationCount ?? 0) + 1,
    })

    const final = await WorkingMemoryStore.get('trace_1')

    expect(final!.clarificationCount).toBe(2)
  })
})

describe('WorkingMemoryStore.release', () => {
  it('removes the entry so subsequent get returns undefined', async () => {
    await WorkingMemoryStore.create('trace_1')

    await WorkingMemoryStore.release('trace_1')

    const memory = await WorkingMemoryStore.get('trace_1')
    expect(memory).toBeUndefined()
    expect(storage.store.has(STORAGE_PREFIX + 'trace_1')).toBe(false)
  })

  it('does not throw when releasing an unknown traceId', async () => {
    await expect(WorkingMemoryStore.release('never_created')).resolves.toBeUndefined()
  })
})

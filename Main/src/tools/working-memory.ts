import type { WorkingMemory } from '../lib/shared-types/index.js'

const STORAGE_PREFIX = 'working-memory:'
const TTL_MS = 5 * 60 * 1000

interface StoredEntry {
  data: WorkingMemory
  expiresAt: number
}

export class WorkingMemoryStore {
  static async create(traceId: string): Promise<WorkingMemory> {
    const memory: WorkingMemory = {
      traceId,
      triedKeywords: [],
      rejectedBvids: [],
      failureReasons: [],
      clarificationCount: 0,
    }

    const key = STORAGE_PREFIX + traceId
    await chrome.storage.session.set({
      [key]: { data: memory, expiresAt: Date.now() + TTL_MS },
    })

    return memory
  }

  static async get(traceId: string): Promise<WorkingMemory | undefined> {
    const key = STORAGE_PREFIX + traceId
    const result = await chrome.storage.session.get(key)
    const stored = result[key] as StoredEntry | undefined

    if (!stored) return undefined
    if (Date.now() > stored.expiresAt) {
      await chrome.storage.session.remove(key)
      return undefined
    }

    return stored.data
  }

  static async update(
    traceId: string,
    patch: Partial<WorkingMemory>,
  ): Promise<WorkingMemory | undefined> {
    const existing = await this.get(traceId)
    if (!existing) return undefined

    const updated: WorkingMemory = { ...existing, ...patch, traceId }
    const key = STORAGE_PREFIX + traceId
    await chrome.storage.session.set({
      [key]: { data: updated, expiresAt: Date.now() + TTL_MS },
    })

    return updated
  }

  static async release(traceId: string): Promise<void> {
    const key = STORAGE_PREFIX + traceId
    await chrome.storage.session.remove(key)
  }
}

// 会话记忆：基于 chrome.storage.session 的 LRU 记忆缓存。
// 存储 recentUnderstandings 与 recentExpansions，供 Agent 工具跨轮次复用上下文。
// 设计依据 3.4 §6 / §8。
//
// 约束（逐字契约）：
//   - 存 chrome.storage.session，key 前缀 'bili-agent-memory:'
//   - LRU 上限 20 条（recentUnderstandings / recentExpansions 各自截断到最后 20 条）
//   - 序列化为 UTF-8 字节后超过 100KB 返回 false（拒绝写入）
import type { SessionMemory } from '../lib/shared-types/index.js'

/** chrome.storage.session 的 key 前缀 */
const STORAGE_PREFIX = 'bili-agent-memory:'
/** 序列化为 UTF-8 后最大字节数（100KB），超限拒绝写入 */
const MAX_MEMORY_SIZE = 100 * 1024
/** 单个 recent 列表的 LRU 上限 */
const MAX_RECENT_ITEMS = 20

/**
 * 读取指定会话的记忆。不存在时返回空骨架（conversationId 固定，列表为空）。
 */
export async function getSessionMemory(
  conversationId: string,
): Promise<SessionMemory> {
  const key = `${STORAGE_PREFIX}${conversationId}`
  try {
    const result = (await chrome.storage.session.get(key)) as Record<
      string,
      SessionMemory | undefined
    >

    const existing = result[key]
    if (existing) {
      return existing
    }
  } catch {
    // 读取失败时降级返回空骨架，与"不存在"行为一致
  }

  return {
    conversationId,
    recentUnderstandings: [],
    recentExpansions: [],
    updatedAt: Date.now(),
  }
}

/**
 * 更新指定会话的记忆（合并 patch，强制覆盖 conversationId）。
 * - recentUnderstandings / recentExpansions 超过 20 条时截断到最后 20 条（LRU）
 * - 序列化为 UTF-8 字节后超过 100KB 时返回 false（拒绝写入），调用方可降级处理
 * - 成功写入返回 true
 */
export async function updateSessionMemory(
  conversationId: string,
  patch: Partial<SessionMemory>,
): Promise<boolean> {
  const current = await getSessionMemory(conversationId)

  const updated: SessionMemory = {
    ...current,
    ...patch,
    conversationId,
    updatedAt: Date.now(),
  }

  // 截断到 LRU 20 条（保留最新的 20 条，即数组末尾）
  if (updated.recentUnderstandings.length > MAX_RECENT_ITEMS) {
    updated.recentUnderstandings = updated.recentUnderstandings.slice(
      -MAX_RECENT_ITEMS,
    )
  }
  if (updated.recentExpansions.length > MAX_RECENT_ITEMS) {
    updated.recentExpansions = updated.recentExpansions.slice(-MAX_RECENT_ITEMS)
  }

  // 序列化后体积校验：按 UTF-8 真实字节数判定，超过 100KB 拒绝写入
  // 注意：JSON.stringify(...).length 取的是 UTF-16 码元数，中文单字占 1 码元却占 3 字节，
  // 会导致实际写入可达 ~300KB 超出 chrome.storage.session 配额，故改用 TextEncoder 取真实字节。
  const serialized = JSON.stringify(updated)
  const byteLength = new TextEncoder().encode(serialized).length
  if (byteLength > MAX_MEMORY_SIZE) {
    return false
  }

  const key = `${STORAGE_PREFIX}${conversationId}`
  try {
    await chrome.storage.session.set({ [key]: updated })
    return true
  } catch {
    return false
  }
}

/**
 * 清除指定会话的记忆。
 */
export async function clearSessionMemory(
  conversationId: string,
): Promise<void> {
  const key = `${STORAGE_PREFIX}${conversationId}`
  await chrome.storage.session.remove([key])
}

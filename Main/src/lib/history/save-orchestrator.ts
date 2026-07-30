// 会话保存编排层：聚合所有"保存当前对话"的触发点。
// 按 feature 聚合到 lib/history/ 下（非按 layer 聚合）。
// 本文件可以 import React（它是 hook）；存储原语（store.ts/sync.ts）禁止 import React。
//
// 四个保存触发点（逐字契约，不可删减）：
//   1) 本地缓存防抖（300ms）——state.messages/videos/understandings/expansions/reranks 变化时
//      防抖写入 chrome.storage.local 的 'bili-agent-conversation' key
//   2) HISTORY_SAVE_EVENT 监听——面板关闭等显式保存信号
//   3) beforeunload 监听——页面卸载时保存
//   4) 首次启用历史迁移——历史索引为空且存在已存储对话时，迁移到历史索引
//
// 设计依据 3.4 §6。
import { useEffect, useRef } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import type { ChatState, ChatAction } from '../../content/chat-context.js'
import { saveConversation, getHistoryIndex } from './store.js'
import type {
  ChatMessage,
  BilibiliVideoCard,
  SlangUnderstandResult,
  QueryExpandResult,
  RerankResult,
} from '../shared-types/index.js'

// ============ 对外常量（逐字契约）============

/** 显式保存事件名：面板关闭等场景 dispatch 此事件触发保存 */
export const HISTORY_SAVE_EVENT = 'biliagent:history-save'
/** 历史索引变脏事件名：保存/迁移完成后派发，通知 HistoryDropdown 刷新 */
export const HISTORY_INDEX_DIRTY_EVENT = 'biliagent:history-index-dirty'

/** 本地缓存防抖时长（毫秒） */
const PERSIST_DEBOUNCE_MS = 300
/** 持久化消息上限：保存时 messages.slice(-200) */
const MAX_PERSISTED_MESSAGES = 200
/** 当前活动会话缓存的 chrome.storage.local key */
const CONVERSATION_STORAGE_KEY = 'bili-agent-conversation'

// ============ 类型定义 ============

/** 保存编排所需的回调集合：调用方（ChatProvider）注入实现 */
export interface ConversationSaverCallbacks {
  /** 保存当前会话到历史索引（由 ChatProvider 实现内部处理 conversationId 守卫与标题生成） */
  saveCurrentConversation: () => Promise<void>
  /** 派发历史索引变脏事件（通知 UI 刷新历史列表） */
  dispatchHistoryIndexDirty: () => void
}

/** useConversationSaver 的入参：所有依赖显式注入，禁止隐藏依赖（Critic C2 / FR-004 AC5） */
export interface UseConversationSaverParams {
  state: ChatState
  dispatch: Dispatch<ChatAction>
  hydrated: boolean
  stateRef: MutableRefObject<ChatState>
  callbacks: ConversationSaverCallbacks
}

// ============ 纯辅助函数（导出以便单测，无需渲染组件）============

/**
 * 判断 state 是否存在"AI 活动"——含 assistant 实质内容或视频结果。
 * 用于 isLoading true->false 转换时的保存守卫：空对话不触发保存。
 */
export function hasAiActivity(state: ChatState): boolean {
  const hasAssistantContent = state.messages.some(
    (m) =>
      m.role === 'assistant' &&
      (m.content.trim().length > 0 || (m.steps?.length ?? 0) > 0),
  )
  return hasAssistantContent || state.videos.length > 0
}

/**
 * 构造写入 chrome.storage.local 'bili-agent-conversation' 的 payload（纯函数，不落盘）。
 * - 过滤掉空 assistant 占位消息（无 content/reasoning/steps）
 * - 截断到 MAX_PERSISTED_MESSAGES=200（取最后 200 条）
 * - messages 为空时返回 null，调用方应 remove 该 key
 */
export function buildStoredConversationPayload(
  state: ChatState,
): PersistedConversationCache | null {
  const messages = state.messages
    .filter(
      (message) =>
        message.role !== 'assistant' ||
        message.content ||
        message.reasoning ||
        message.steps?.length,
    )
    .slice(-MAX_PERSISTED_MESSAGES)
  if (messages.length === 0) {
    return null
  }
  return {
    version: 1,
    conversationId: state.conversationId,
    messages,
    videos: state.videos,
    understandings: state.understandings,
    expansions: state.expansions,
    reranks: state.reranks,
    updatedAt: Date.now(),
  }
}

/** 本地缓存 payload 的结构（version=1，与 store.ts 的 PersistedConversation 同构但本地声明以避免循环依赖） */
export interface PersistedConversationCache {
  version: 1
  conversationId: string
  messages: ChatMessage[]
  videos: BilibiliVideoCard[]
  understandings: Array<SlangUnderstandResult & { receivedAt: number }>
  expansions: Array<QueryExpandResult & { receivedAt: number }>
  reranks: Array<RerankResult & { receivedAt: number }>
  updatedAt: number
}

/**
 * 将当前会话防抖写入 chrome.storage.local 的 'bili-agent-conversation' key。
 * messages 为空时移除该 key；存储不可用时静默失败以保持聊天可用。
 */
export async function writeStoredConversation(
  state: ChatState,
): Promise<void> {
  try {
    const payload = buildStoredConversationPayload(state)
    if (payload === null) {
      await chrome.storage.local.remove(CONVERSATION_STORAGE_KEY)
      return
    }
    await chrome.storage.local.set({ [CONVERSATION_STORAGE_KEY]: payload })
  } catch {
    // 存储不可用——保持聊天可用，不阻塞主流程
  }
}

/**
 * 构造首次启用历史迁移所需的 SaveableConversation 入参（纯函数）。
 * 返回 null 表示不满足迁移条件（无 assistant 实质内容且无视频）。
 */
export function buildMigrationPayload(
  state: ChatState,
): MigrationPayload | null {
  if (state.messages.length === 0) return null
  const hasAssistant = state.messages.some(
    (m) =>
      m.role === 'assistant' &&
      (m.content.trim().length > 0 || (m.steps?.length ?? 0) > 0),
  )
  const hasVideos = (state.videos?.length ?? 0) > 0
  if (!hasAssistant && !hasVideos) return null
  const firstUserMsg = state.messages.find((m) => m.role === 'user')
  const tempTitle = firstUserMsg?.content.trim().slice(0, 15) || '历史对话'
  return {
    conversationId: state.conversationId,
    messages: state.messages,
    videos: state.videos ?? [],
    understandings: state.understandings ?? [],
    expansions: state.expansions ?? [],
    reranks: state.reranks ?? [],
    tempTitle,
  }
}

/** 迁移入参（内部结构，saveConversation 调用所需） */
export interface MigrationPayload {
  conversationId: string
  messages: ChatMessage[]
  videos: BilibiliVideoCard[]
  understandings: Array<SlangUnderstandResult & { receivedAt: number }>
  expansions: Array<QueryExpandResult & { receivedAt: number }>
  reranks: Array<RerankResult & { receivedAt: number }>
  tempTitle: string
}

// ============ 主 hook ============

/**
 * 集中编排所有会话保存触发点。
 *
 * 形参对象签名固定——所有依赖显式注入，禁止添加隐藏依赖（Critic C2 / FR-004 AC5）。
 */
export function useConversationSaver(
  params: UseConversationSaverParams,
): void {
  const { state, hydrated, stateRef, callbacks } = params

  // 触发点 1：本地缓存防抖——state 变化后 300ms 写入 chrome.storage.local
  useEffect(() => {
    if (!hydrated) return
    const timer = setTimeout(() => {
      void writeStoredConversation(stateRef.current)
    }, PERSIST_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [
    hydrated,
    state.messages,
    state.videos,
    state.understandings,
    state.expansions,
    state.reranks,
    stateRef,
  ])

  // 触发点 2 + 3：HISTORY_SAVE_EVENT 与 beforeunload——保存到历史索引
  useEffect(() => {
    const onSave = (): void => {
      void callbacks.saveCurrentConversation()
    }
    const onBeforeUnload = (): void => {
      void callbacks.saveCurrentConversation()
    }
    window.addEventListener(HISTORY_SAVE_EVENT, onSave)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener(HISTORY_SAVE_EVENT, onSave)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [callbacks])

  // 触发点 4：首次启用历史迁移——hydration 后历史索引为空且存在已存储对话时迁移
  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    void (async () => {
      const stored = stateRef.current
      const migration = buildMigrationPayload(stored)
      if (migration === null) return
      try {
        const index = await getHistoryIndex()
        if (index.length > 0) return
        await saveConversation(
          {
            conversationId: migration.conversationId,
            messages: migration.messages,
            videos: migration.videos,
            understandings: migration.understandings,
            expansions: migration.expansions,
            reranks: migration.reranks,
          },
          migration.tempTitle,
        )
        if (!cancelled) {
          callbacks.dispatchHistoryIndexDirty()
        }
      } catch {
        // 迁移失败不得阻塞主流程
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hydrated, stateRef, callbacks])

  // 触发点 5：isLoading true->false 转换——AI 响应结束时自动保存
  // 落实 FR-004 AC1-AC5：
  //   AC1: state.isLoading 由 true->false 转换且 hasAiActivity=true 时调用 saveCurrentConversation
  //   AC2: 初始化时 isLoading=false 不误触发（wasLoadingRef 初值 false）
  //   AC3: hydrated=false 期间不触发保存
  //   AC4: 保存后由本 hook 显式派发 HISTORY_INDEX_DIRTY_EVENT（saveCurrentConversation 回调自身不派发）
  //   AC5: 对话立刻被新建/切走时由 saveCurrentConversation 内部 conversationId 守卫处理
  const wasLoadingRef = useRef<boolean>(false)
  useEffect(() => {
    if (!hydrated) {
      wasLoadingRef.current = state.isLoading
      return
    }
    const wasLoading = wasLoadingRef.current
    wasLoadingRef.current = state.isLoading
    // 仅在 true -> false 转换时触发
    if (!(wasLoading && !state.isLoading)) return
    if (!hasAiActivity(state)) return
    // TODO-31：触发点 5 卸载保护。
    // saveCurrentConversation 为异步，组件在 await 期间卸载/重渲染时回调仍会执行，
    // 可能对已卸载组件调用 dispatchHistoryIndexDirty 导致空操作或告警。
    // 用 cancelled 标志在 cleanup 时短路异步回调，避免卸载后副作用。
    let cancelled = false
    void (async () => {
      try {
        await callbacks.saveCurrentConversation()
        if (cancelled) return
        callbacks.dispatchHistoryIndexDirty()
      } catch {
        // 自动保存失败不得阻塞聊天 UI
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hydrated, state, callbacks])
}

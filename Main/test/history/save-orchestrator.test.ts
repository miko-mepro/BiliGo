import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import {
  useConversationSaver,
  HISTORY_SAVE_EVENT,
  HISTORY_INDEX_DIRTY_EVENT,
} from '../../src/lib/history/save-orchestrator.js'
import type { ChatState, ChatAction } from '../../src/content/chat-context.js'

const INDEX_KEY = 'bili-agent-history-index'
const DATA_PREFIX = 'bili-agent-history:'
const CONVERSATION_STORAGE_KEY = 'bili-agent-conversation'

/**
 * 构造一个可读写的 backing store，覆写 setup.ts 中默认的 chrome.storage.local mock。
 * 这样每个用例的 storage 状态相互隔离。
 */
function createBackingStore(): Record<string, unknown> {
  const store: Record<string, unknown> = {}
  ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
    (keys: unknown) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] })
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {}
        keys.forEach((k) => {
          if (k in store) out[k] = store[k]
        })
        return Promise.resolve(out)
      }
      return Promise.resolve({ ...store })
    },
  )
  ;(chrome.storage.local.set as ReturnType<typeof vi.fn>).mockImplementation(
    (items: Record<string, unknown>) => {
      Object.assign(store, items)
      return Promise.resolve()
    },
  )
  ;(chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockImplementation(
    (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys]
      arr.forEach((k) => {
        delete store[k]
      })
      return Promise.resolve()
    },
  )
  return store
}

/**
 * 构造一个最小可用的 ChatState。所有字段默认值与 createInitialChatState 对齐。
 */
function createState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    messages: [],
    videos: [],
    isLoading: false,
    error: null,
    streamingContent: '',
    streamingReasoning: '',
    activity: null,
    hydrated: true,
    conversationId: 'conv_test',
    understandings: [],
    expansions: [],
    reranks: [],
    clarification: null,
    ...overrides,
  }
}

describe('useConversationSaver', () => {
  let store: Record<string, unknown>
  let saveSpy: ReturnType<typeof vi.fn>
  let dirtySpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    store = createBackingStore()
    saveSpy = vi.fn().mockResolvedValue(undefined)
    dirtySpy = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function setup(state: ChatState) {
    const stateRef = { current: state }
    const dispatch = vi.fn() as unknown as React.Dispatch<ChatAction>
    return renderHook(() =>
      useConversationSaver({
        state,
        dispatch,
        hydrated: state.hydrated,
        stateRef,
        callbacks: {
          saveCurrentConversation:
            saveSpy as unknown as () => Promise<void>,
          dispatchHistoryIndexDirty:
            dirtySpy as unknown as () => void,
        },
      }),
    )
  }

  function setupRerender(initialState: ChatState) {
    const stateRef = { current: initialState }
    const dispatch = vi.fn() as unknown as React.Dispatch<ChatAction>
    const currentCallbacks = {
      saveCurrentConversation: saveSpy as unknown as () => Promise<void>,
      dispatchHistoryIndexDirty: dirtySpy as unknown as () => void,
    }
    const result = renderHook(
      ({ state }: { state: ChatState }) => {
        stateRef.current = state
        return useConversationSaver({
          state,
          dispatch,
          hydrated: state.hydrated,
          stateRef,
          callbacks: currentCallbacks,
        })
      },
      { initialProps: { state: initialState } },
    )
    return {
      ...result,
      rerender: (state: ChatState) => result.rerender({ state }),
    }
  }

  // C-1: API 形参签名固化
  it('C-1: 接收 { state, dispatch, hydrated, stateRef, callbacks } 参数', () => {
    const state = createState({
      messages: [{ role: 'user', content: 'hi', timestamp: 1 }],
    })
    expect(() => setup(state)).not.toThrow()
  })

  // C-2: 300ms debounce 后写入 chrome.storage.local
  it('C-2: 300ms debounce 后将本地缓存写入 chrome.storage.local', async () => {
    const state = createState({
      messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
    })
    setup(state)
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [CONVERSATION_STORAGE_KEY]: expect.any(Object),
      }),
    )
  })

  // C-3: HISTORY_SAVE_EVENT 触发 saveCurrentConversation
  it('C-3: HISTORY_SAVE_EVENT 触发 callbacks.saveCurrentConversation', () => {
    setup(createState())
    window.dispatchEvent(new CustomEvent(HISTORY_SAVE_EVENT))
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  // C-4: beforeunload 触发 saveCurrentConversation
  it('C-4: beforeunload 触发 callbacks.saveCurrentConversation', () => {
    setup(createState())
    window.dispatchEvent(new Event('beforeunload'))
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  // C-5: 首次启用历史时数据迁移
  it('C-5: 首次启用历史 + stored 含 AI 活动时自动迁移', async () => {
    const state = createState({
      messages: [
        { role: 'user', content: 'q', timestamp: 1 },
        { role: 'assistant', content: 'a', timestamp: 2 },
      ],
    })
    setup(state)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ [INDEX_KEY]: expect.any(Array) }),
    )
    expect(dirtySpy).toHaveBeenCalled()
  })

  // C-6: 保存后派发 HISTORY_INDEX_DIRTY_EVENT
  it('C-6: 迁移完成后派发 HISTORY_INDEX_DIRTY_EVENT（通过 dispatchHistoryIndexDirty 回调）', async () => {
    const state = createState({
      messages: [
        { role: 'user', content: 'q', timestamp: 1 },
        { role: 'assistant', content: 'a', timestamp: 2 },
      ],
    })
    setup(state)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(dirtySpy).toHaveBeenCalledTimes(1)
  })

  // C-7: hook 卸载时清理所有监听器
  it('C-7: 卸载时移除 HISTORY_SAVE_EVENT 与 beforeunload 监听器', () => {
    const { unmount } = setup(createState())
    unmount()
    saveSpy.mockClear()
    window.dispatchEvent(new CustomEvent(HISTORY_SAVE_EVENT))
    window.dispatchEvent(new Event('beforeunload'))
    expect(saveSpy).not.toHaveBeenCalled()
  })

  // ===== Task 4.3: isLoading 转换监听测试 =====

  // C-8: isLoading true->false 转换 + hasAiActivity=true 触发保存
  it('C-8: isLoading true->false 且 hasAiActivity=true 时调用 saveCurrentConversation', async () => {
    const stateLoading = createState({
      isLoading: true,
      messages: [
        { role: 'user', content: 'q', timestamp: 1 },
        { role: 'assistant', content: 'partial', timestamp: 2 },
      ],
    })
    const { rerender } = setupRerender(stateLoading)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    saveSpy.mockClear()
    dirtySpy.mockClear()
    const stateDone = createState({
      ...stateLoading,
      isLoading: false,
    })
    rerender(stateDone)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(dirtySpy).toHaveBeenCalledTimes(1)
  })

  // C-9: 初始化 isLoading=false 不误触发（wasLoadingRef 初值 false）
  it('C-9: 初始化时 isLoading=false 不触发保存', async () => {
    const state = createState({
      isLoading: false,
      messages: [
        { role: 'user', content: 'q', timestamp: 1 },
        { role: 'assistant', content: 'a', timestamp: 2 },
      ],
    })
    setup(state)
    await act(async () => {
      await Promise.resolve()
    })
    // 注意：迁移逻辑可能调用 saveSpy 之外的 chrome.storage.local.set，但不应调用 saveSpy
    expect(saveSpy).not.toHaveBeenCalled()
  })

  // C-10: hydrated=false 期间不触发自动保存
  it('C-10: hydrated=false 时 isLoading true->false 不触发保存', async () => {
    const stateLoading = createState({
      hydrated: false,
      isLoading: true,
      messages: [{ role: 'user', content: 'q', timestamp: 1 }],
    })
    const { rerender } = setupRerender(stateLoading)
    saveSpy.mockClear()
    rerender(createState({ ...stateLoading, isLoading: false }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  // C-11: conversationId 守卫由 saveCurrentConversation 内部处理（这里只验证调用契约）
  it('C-11: 不同 conversationId 仍触发一次保存（守卫在 saveCurrentConversation 内部）', async () => {
    const stateLoading = createState({
      isLoading: true,
      conversationId: 'conv_A',
      messages: [
        { role: 'user', content: 'q', timestamp: 1 },
        { role: 'assistant', content: 'a', timestamp: 2 },
      ],
    })
    const { rerender } = setupRerender(stateLoading)
    saveSpy.mockClear()
    rerender(
      createState({
        ...stateLoading,
        conversationId: 'conv_B',
        isLoading: false,
      }),
    )
    await act(async () => {
      await Promise.resolve()
    })
    // hook 不做 conversationId 守卫；只做 hasAiActivity 守卫
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  // C-12: hasAiActivity=false（无 assistant 内容、无视频）不触发保存
  it('C-12: hasAiActivity=false 时 isLoading 转换不触发保存', async () => {
    const stateLoading = createState({
      isLoading: true,
      messages: [{ role: 'user', content: 'q', timestamp: 1 }], // 仅 user，无 assistant
      videos: [],
    })
    const { rerender } = setupRerender(stateLoading)
    saveSpy.mockClear()
    rerender(createState({ ...stateLoading, isLoading: false }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  // C-13: saveCurrentConversation 抛错时不阻塞 UI
  it('C-13: saveCurrentConversation reject 时不抛出到 React', async () => {
    saveSpy.mockRejectedValueOnce(new Error('save failed'))
    const stateLoading = createState({
      isLoading: true,
      messages: [
        { role: 'user', content: 'q', timestamp: 1 },
        { role: 'assistant', content: 'a', timestamp: 2 },
      ],
    })
    const { rerender } = setupRerender(stateLoading)
    expect(() => {
      rerender(createState({ ...stateLoading, isLoading: false }))
    }).not.toThrow()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    // hook 内 await 失败但不应让 React 崩溃
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  // C-14（额外）: callbacks 稳定时多次 rerender 不重复迁移（防 reviewer 提示的 useEffect 重建回归）
  it('C-14: 稳定 callbacks 下多次 rerender 仅迁移 1 次', async () => {
    const state = createState({
      messages: [
        { role: 'user', content: 'q', timestamp: 1 },
        { role: 'assistant', content: 'a', timestamp: 2 },
      ],
    })
    const { rerender } = setupRerender(state)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const setCalls1 = (chrome.storage.local.set as ReturnType<typeof vi.fn>)
      .mock.calls.length
    // 模拟流式响应期间频繁 rerender（state 引用变化但 callbacks 稳定）
    for (let i = 0; i < 5; i += 1) {
      rerender({ ...state })
      await act(async () => {
        await Promise.resolve()
      })
    }
    const setCalls2 = (chrome.storage.local.set as ReturnType<typeof vi.fn>)
      .mock.calls.length
    // 仅允许 debounce 触发的写入（每次 rerender 重置 timer，最终 ≤1 次额外 set）
    expect(setCalls2 - setCalls1).toBeLessThanOrEqual(2)
  })
})

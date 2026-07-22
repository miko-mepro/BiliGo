import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, act } from '@testing-library/react'
import {
  ChatProvider,
  useChat,
  HISTORY_LOAD_EVENT,
  type UseChatResult,
} from '../../src/content/chat-context.js'
import type { SWMessage, CSMessage } from '../../src/background/port-protocol.js'
import type {
  ChatMessage,
  ConversationRecord,
  ConversationData,
} from '../../src/lib/shared-types/index.js'

// ============ 模块 mock ============

// Port 连接：返回可控的 fake connection，暴露 handlers 供测试驱动 SW 消息
let capturedHandlers: {
  onMessage: (msg: SWMessage) => void
  onDisconnect: () => void
} | null = null

const fakeConnection = {
  postMessage: vi.fn((_msg: CSMessage) => {}),
  onMessage: vi.fn(() => () => {}),
  disconnect: vi.fn(),
  isDisconnected: vi.fn(() => false),
}

vi.mock('../../src/content/port-connection.js', () => ({
  connectChatPort: vi.fn((handlers: {
    onMessage: (msg: SWMessage) => void
    onDisconnect: () => void
  }) => {
    capturedHandlers = handlers
    return fakeConnection
  }),
  PORT_NAME: 'bili-agent-chat',
  PING_INTERVAL_MS: 25_000,
  PONG_TIMEOUT_MS: 60_000,
}))

// 存储：用内存 backing store 模拟，让 getHistoryIndex/updateTitle 等可观测
const INDEX_KEY = 'bili-agent-history-index'
const DATA_PREFIX = 'bili-agent-history:'
let backingStore: Record<string, unknown>

function resetBackingStore(): void {
  backingStore = {}
  ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
    (keys: unknown) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: backingStore[keys] })
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {}
        keys.forEach((k) => {
          if (k in backingStore) out[k] = backingStore[k]
        })
        return Promise.resolve(out)
      }
      return Promise.resolve({ ...backingStore })
    },
  )
  ;(chrome.storage.local.set as ReturnType<typeof vi.fn>).mockImplementation(
    (items: Record<string, unknown>) => {
      Object.assign(backingStore, items)
      return Promise.resolve()
    },
  )
  ;(chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockImplementation(
    (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys]
      arr.forEach((k) => {
        delete backingStore[k]
      })
      return Promise.resolve()
    },
  )
}

// ============ 辅助 ============

function userMsg(content: string): ChatMessage {
  return { role: 'user', content, timestamp: Date.now() }
}

function assistantMsg(content: string): ChatMessage {
  return { role: 'assistant', content, timestamp: Date.now() }
}

/** 测试消费组件：通过 ref 暴露最新 useChat 返回值 */
function Consumer({
  apiRef,
}: {
  apiRef: React.MutableRefObject<UseChatResult | null>
}): React.ReactElement {
  const chat = useChat()
  apiRef.current = chat
  return React.createElement('div', { 'data-testid': 'consumer' })
}

/**
 * 排空微任务队列 + 推进 React 渲染。
 * 注意：fake timers 下不能用 waitFor（其内部轮询用 setTimeout 不会触发）。
 */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ============ 测试 ============

describe('SB-9 fix #1: REHYDRATE resets assistantPlaceholderCreated', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    resetBackingStore()
    capturedHandlers = null
    fakeConnection.postMessage.mockClear()
    fakeConnection.isDisconnected.mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('加载历史后 send() 能正常创建 assistant 占位', async () => {
    // 准备：一个已有历史对话存储在 backingStore
    const historicalConvId = 'conv_history_1'
    const historicalData: ConversationData = {
      version: 2,
      id: historicalConvId,
      messages: [userMsg('历史问题'), assistantMsg('历史回答')],
      videos: [],
      understandings: [],
      expansions: [],
      reranks: [],
      createdAt: 1000,
      lastActiveAt: 2000,
    }
    backingStore[DATA_PREFIX + historicalConvId] = historicalData
    backingStore[INDEX_KEY] = [
      {
        id: historicalConvId,
        title: '历史标题',
        titleFinal: true,
        createdAt: 1000,
        lastActiveAt: 2000,
        messageCount: 2,
      } as ConversationRecord,
    ]

    const apiRef: React.MutableRefObject<UseChatResult | null> = {
      current: null,
    }

    const { unmount } = render(
      React.createElement(
        ChatProvider,
        null,
        React.createElement(Consumer, { apiRef }),
      ),
    )

    // 等待 hydration（loadLocalCache 返回 null，HYDRATE payload=null）
    await flushMicrotasks()

    expect(apiRef.current).not.toBeNull()
    const initialConvId = apiRef.current!.state.conversationId

    // 步骤 1：send 一条消息 + 推 chunk 创建 assistant 占位
    expect(capturedHandlers).not.toBeNull()

    act(() => {
      apiRef.current!.send('第一条消息')
    })

    act(() => {
      capturedHandlers!.onMessage({ type: 'chunk', delta: '流式片段' })
    })

    // 此时应有 assistant 占位消息
    const hasPlaceholder = apiRef.current!.state.messages.some(
      (m) => m.role === 'assistant',
    )
    expect(hasPlaceholder).toBe(true)

    // 完成 streaming
    act(() => {
      capturedHandlers!.onMessage({ type: 'done' })
    })
    await flushMicrotasks()

    // 步骤 2：触发 HISTORY_LOAD_EVENT 加载历史
    act(() => {
      window.dispatchEvent(
        new CustomEvent(HISTORY_LOAD_EVENT, {
          detail: { conversationId: historicalConvId },
        }),
      )
    })

    // 等待 loadConversation 异步完成 + REHYDRATE
    await flushMicrotasks()

    expect(apiRef.current!.state.conversationId).toBe(historicalConvId)
    expect(apiRef.current!.state.messages).toHaveLength(2)

    // 步骤 3：加载历史后 send() 新消息，断言能创建新 assistant 占位
    const messagesBeforeSend = apiRef.current!.state.messages.length

    act(() => {
      apiRef.current!.send('加载历史后的新消息')
    })

    // 推 chunk -- 关键断言：必须能创建新的 assistant 占位
    act(() => {
      capturedHandlers!.onMessage({ type: 'chunk', delta: '新流式片段' })
    })

    const messagesAfterSend = apiRef.current!.state.messages.length
    expect(messagesAfterSend).toBeGreaterThan(messagesBeforeSend)

    const lastMessage =
      apiRef.current!.state.messages[apiRef.current!.state.messages.length - 1]
    expect(lastMessage.role).toBe('assistant')

    expect(apiRef.current!.state.conversationId).toBe(historicalConvId)
    expect(initialConvId).not.toBe(historicalConvId)

    unmount()
  })
})

describe('SB-9 fix #2: title fallback timeout degradation', () => {
  let dirtyEventSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    resetBackingStore()
    capturedHandlers = null
    fakeConnection.postMessage.mockClear()
    fakeConnection.isDisconnected.mockReturnValue(false)
    dirtyEventSpy = vi.fn()
    window.addEventListener('biliagent:history-index-dirty', dirtyEventSpy)
  })

  afterEach(() => {
    vi.useRealTimers()
    window.removeEventListener('biliagent:history-index-dirty', dirtyEventSpy)
    vi.clearAllMocks()
  })

  it('12s 内无 title 响应时用临时标题降级并置 titleFinal=true', async () => {
    const apiRef: React.MutableRefObject<UseChatResult | null> = {
      current: null,
    }

    const { unmount } = render(
      React.createElement(
        ChatProvider,
        null,
        React.createElement(Consumer, { apiRef }),
      ),
    )

    await flushMicrotasks()

    expect(apiRef.current).not.toBeNull()
    const convId = apiRef.current!.state.conversationId

    // send 一条消息 + 模拟 SW 流式响应完成（触发 saveCurrentConversation）
    act(() => {
      apiRef.current!.send('这是一条超过二十字的消息用于测试标题降级逻辑')
    })

    act(() => {
      capturedHandlers!.onMessage({ type: 'chunk', delta: '回答内容' })
    })

    act(() => {
      capturedHandlers!.onMessage({ type: 'done' })
    })

    // 等待 saveCurrentConversation 异步完成（saveConversation 写入 backingStore）
    await flushMicrotasks()

    // 验证 generate_title 已请求
    const titleRequested = fakeConnection.postMessage.mock.calls.some(
      (call) => call[0]?.type === 'generate_title',
    )
    expect(titleRequested).toBe(true)

    // 验证历史索引已写入，titleFinal 仍为 false
    const indexBefore = backingStore[INDEX_KEY] as ConversationRecord[]
    const recordBefore = indexBefore.find((r) => r.id === convId)
    expect(recordBefore).toBeDefined()
    expect(recordBefore!.titleFinal).toBe(false)

    // 不推送 title 响应，快进 12s+ 触发兜底定时器
    dirtyEventSpy.mockClear()
    await act(async () => {
      vi.advanceTimersByTime(12_001)
    })
    await flushMicrotasks()

    // 断言：titleFinal 置位
    const indexAfter = backingStore[INDEX_KEY] as ConversationRecord[]
    const recordAfter = indexAfter.find((r) => r.id === convId)
    expect(recordAfter).toBeDefined()
    expect(recordAfter!.titleFinal).toBe(true)
    // 临时标题为首条 user 消息前 20 字
    const expectedTempTitle = '这是一条超过二十字的消息用于测试标题降级逻辑'.slice(0, 20)
    expect(recordAfter!.title).toBe(expectedTempTitle)

    // 断言：dirty 事件已派发
    expect(dirtyEventSpy).toHaveBeenCalled()

    unmount()
  })

  it('12s 内收到 title 响应则兜底定时器不触发降级', async () => {
    const apiRef: React.MutableRefObject<UseChatResult | null> = {
      current: null,
    }

    const { unmount } = render(
      React.createElement(
        ChatProvider,
        null,
        React.createElement(Consumer, { apiRef }),
      ),
    )

    await flushMicrotasks()

    expect(apiRef.current).not.toBeNull()
    const convId = apiRef.current!.state.conversationId

    act(() => {
      apiRef.current!.send('第二条测试消息用于验证定时器清除')
    })

    act(() => {
      capturedHandlers!.onMessage({ type: 'chunk', delta: '回答' })
    })

    act(() => {
      capturedHandlers!.onMessage({ type: 'done' })
    })

    await flushMicrotasks()

    // SW 在 12s 内回推 title 成功响应
    act(() => {
      capturedHandlers!.onMessage({
        type: 'title',
        conversationId: convId,
        title: 'SW生成的正式标题',
      })
    })
    await flushMicrotasks()

    // 快进超过 12s，兜底定时器不应再触发降级
    dirtyEventSpy.mockClear()
    await act(async () => {
      vi.advanceTimersByTime(13_000)
    })
    await flushMicrotasks()

    // 断言：titleFinal 已由 SW title 响应置位，标题为 SW 正式标题
    const index = backingStore[INDEX_KEY] as ConversationRecord[]
    const record = index.find((r) => r.id === convId)
    expect(record).toBeDefined()
    expect(record!.titleFinal).toBe(true)
    expect(record!.title).toBe('SW生成的正式标题')

    // 兜底定时器已被清除，不应再派发 dirty 事件
    expect(dirtyEventSpy).not.toHaveBeenCalled()

    unmount()
  })
})

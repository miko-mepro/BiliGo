import {
  useReducer,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  type RefObject,
  type Dispatch,
  type ReactNode,
  type ReactElement,
} from 'react'
import type {
  ChatMessage,
  AgentStep,
  BilibiliVideoCard,
  SlangUnderstandResult,
  QueryExpandResult,
  RerankResult,
  ClarificationRequest,
  ErrorPayload,
} from '../lib/shared-types/index.js'
import type { SWMessage } from '../background/port-protocol.js'
import {
  connectChatPort,
  type PortConnection,
  type ConnectHandlers,
} from './port-connection.js'
import {
  loadLocalCache,
  clearLocalCache,
  saveConversation,
  loadConversation,
  updateTitle,
} from '../lib/history/store.js'
import {
  useConversationSaver,
  HISTORY_INDEX_DIRTY_EVENT,
  type ConversationSaverCallbacks,
} from '../lib/history/save-orchestrator.js'

export type AgentActivity = { kind: 'thinking' | 'responding' | 'tool'; label?: string }

/**
 * 历史加载事件名：HistoryDropdown 点击某条历史时 dispatch 此 CustomEvent，
 * ChatContext 监听后 loadConversation 并 REHYDRATE。
 * 沿用旧仓库事件名约定，payload.detail.conversationId 携带目标会话 ID。
 */
export const HISTORY_LOAD_EVENT = 'biliagent:history-load'

/**
 * 标题生成纯函数：用首条 user 消息前 20 字作为临时标题（降级用）。
 * 无 user 消息或空内容时返回"新对话"。
 * 设计依据 3.4 §8：SW 标题请求失败时本地降级。
 */
export function generateTempTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  const content = firstUser?.content.trim()
  if (!content) return '新对话'
  return content.slice(0, 20)
}

export interface TimedUnderstanding extends SlangUnderstandResult {
  receivedAt: number
}
export interface TimedExpansion extends QueryExpandResult {
  receivedAt: number
}
export interface TimedRerank extends RerankResult {
  receivedAt: number
}

export interface PersistedConversation {
  version: 1
  conversationId: string
  messages: ChatMessage[]
  videos: BilibiliVideoCard[]
  understandings: TimedUnderstanding[]
  expansions: TimedExpansion[]
  reranks: TimedRerank[]
  updatedAt: number
}

export interface ChatState {
  messages: ChatMessage[]
  conversationId: string
  isLoading: boolean
  streamingContent: string
  streamingReasoning: string
  error: ErrorPayload | null
  videos: BilibiliVideoCard[]
  activity: AgentActivity | null
  understandings: TimedUnderstanding[]
  expansions: TimedExpansion[]
  reranks: TimedRerank[]
  clarification: ClarificationRequest | null
  hydrated: boolean
}

export type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: ErrorPayload | null }
  | { type: 'SET_VIDEOS'; payload: BilibiliVideoCard[] }
  | { type: 'APPEND_STREAMING'; payload: string }
  | { type: 'APPEND_REASONING'; payload: string }
  | { type: 'SET_ACTIVITY'; payload: AgentActivity | null }
  | { type: 'ADD_STEP'; payload: AgentStep }
  | { type: 'COMPLETE_STEP'; payload: { toolCallId: string; completedAt: number } }
  | { type: 'CLEAR_STREAMING' }
  | { type: 'UPDATE_LAST_MESSAGE'; payload: { content: string; reasoning?: string } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'HYDRATE'; payload: PersistedConversation | null }
  | { type: 'REHYDRATE'; payload: PersistedConversation }
  | { type: 'ADD_UNDERSTANDING'; payload: SlangUnderstandResult }
  | { type: 'ADD_EXPANSION'; payload: QueryExpandResult }
  | { type: 'ADD_RERANK'; payload: RerankResult }
  | { type: 'SET_CLARIFICATION'; payload: ClarificationRequest }
  | { type: 'CLEAR_CLARIFICATION' }

export interface ConsumerState extends ChatState {
  assistantPlaceholderCreated: boolean
}

export type ConsumerStateRef = RefObject<ConsumerState>

export function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createInitialChatState(): ChatState {
  return {
    messages: [],
    videos: [],
    conversationId: generateConversationId(),
    streamingContent: '',
    streamingReasoning: '',
    isLoading: false,
    error: null,
    activity: null,
    hydrated: false,
    understandings: [],
    expansions: [],
    reranks: [],
    clarification: null,
  }
}

export function createInitialConsumerState(): ConsumerState {
  return {
    ...createInitialChatState(),
    assistantPlaceholderCreated: false,
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload }

    case 'SET_VIDEOS':
      return { ...state, videos: action.payload }

    case 'APPEND_STREAMING':
      return { ...state, streamingContent: state.streamingContent + action.payload }

    case 'APPEND_REASONING':
      return { ...state, streamingReasoning: state.streamingReasoning + action.payload }

    case 'SET_ACTIVITY':
      return { ...state, activity: action.payload }

    case 'ADD_STEP': {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = {
          ...last,
          steps: [...(last.steps ?? []), action.payload],
        }
      }
      return { ...state, messages }
    }

    case 'COMPLETE_STEP': {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (!last || last.role !== 'assistant') return state

      const steps = last.steps?.map((step) =>
        step.id === action.payload.toolCallId
          ? {
              ...step,
              status: 'completed' as const,
              completedAt: action.payload.completedAt,
            }
          : step,
      )

      if (!steps?.some((step) => step.id === action.payload.toolCallId)) return state
      messages[messages.length - 1] = { ...last, steps }
      return { ...state, messages }
    }

    case 'CLEAR_STREAMING':
      return { ...state, streamingContent: '', streamingReasoning: '' }

    case 'UPDATE_LAST_MESSAGE': {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = {
          ...last,
          content: action.payload.content,
          reasoning: action.payload.reasoning ?? last.reasoning,
        }
      }
      return { ...state, messages }
    }

    case 'CLEAR_MESSAGES':
      return {
        ...createInitialChatState(),
        hydrated: true,
      }

    case 'HYDRATE': {
      if (
        !action.payload ||
        state.hydrated ||
        state.isLoading ||
        state.messages.length > 0 ||
        state.streamingContent.length > 0
      ) {
        return { ...state, hydrated: true }
      }
      return {
        ...state,
        messages: action.payload.messages,
        videos: action.payload.videos,
        conversationId: action.payload.conversationId,
        understandings: action.payload.understandings,
        expansions: action.payload.expansions,
        reranks: action.payload.reranks,
        hydrated: true,
      }
    }

    case 'REHYDRATE':
      return {
        ...state,
        messages: action.payload.messages,
        videos: action.payload.videos,
        conversationId: action.payload.conversationId,
        understandings: action.payload.understandings,
        expansions: action.payload.expansions,
        reranks: action.payload.reranks,
        hydrated: true,
        streamingContent: '',
        streamingReasoning: '',
        isLoading: false,
        error: null,
        activity: null,
        clarification: null,
      }

    case 'ADD_UNDERSTANDING':
      return {
        ...state,
        understandings: [
          ...state.understandings,
          { ...action.payload, receivedAt: Date.now() },
        ],
      }

    case 'ADD_EXPANSION':
      return {
        ...state,
        expansions: [
          ...state.expansions,
          { ...action.payload, receivedAt: Date.now() },
        ],
      }

    case 'ADD_RERANK':
      return {
        ...state,
        reranks: [
          ...state.reranks,
          { ...action.payload, receivedAt: Date.now() },
        ],
      }

    case 'SET_CLARIFICATION':
      if (state.clarification) return state
      return { ...state, clarification: action.payload }

    case 'CLEAR_CLARIFICATION':
      return { ...state, clarification: null }

    default:
      return state
  }
}

// ===== 修复 #4：insight 数据运行时最小字段守卫 =====
// SW 推送的 insight.data 之前只做 TypeScript 断言，残缺数据会在卡片展开时崩溃；
// 这里按 kind 校验必备字段，数组字段必须是数组，非法数据整条丢弃

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** understanding：original/normalized/explanation 必须是字符串 */
function isValidUnderstanding(data: unknown): data is SlangUnderstandResult {
  return (
    isRecord(data) &&
    typeof data.original === 'string' &&
    typeof data.normalized === 'string' &&
    typeof data.explanation === 'string'
  )
}

/** expansion：三个数组字段必须是数组，rationale 必须是字符串 */
function isValidExpansion(data: unknown): data is QueryExpandResult {
  return (
    isRecord(data) &&
    Array.isArray(data.keywords) &&
    Array.isArray(data.tags) &&
    Array.isArray(data.categories) &&
    typeof data.rationale === 'string'
  )
}

/** rerank：items 必须是数组，trimmed 必须是数字 */
function isValidRerank(data: unknown): data is RerankResult {
  return (
    isRecord(data) &&
    Array.isArray(data.items) &&
    typeof data.trimmed === 'number'
  )
}

/** clarification：question/reason 必须是字符串，options 缺省或为数组 */
function isValidClarification(data: unknown): data is ClarificationRequest {
  return (
    isRecord(data) &&
    typeof data.question === 'string' &&
    typeof data.reason === 'string' &&
    (data.options === undefined || Array.isArray(data.options))
  )
}

function ensureAssistantPlaceholder(
  stateRef: ConsumerStateRef,
  dispatch: Dispatch<ChatAction>,
): void {
  if (stateRef.current.assistantPlaceholderCreated) return
  dispatch({
    type: 'ADD_MESSAGE',
    payload: {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    },
  })
  stateRef.current = {
    ...stateRef.current,
    assistantPlaceholderCreated: true,
  }
}

export function consumeSWMessage(
  msg: SWMessage,
  stateRef: ConsumerStateRef,
  dispatch: Dispatch<ChatAction>,
): void {
  switch (msg.type) {
    case 'chunk':
      ensureAssistantPlaceholder(stateRef, dispatch)
      dispatch({ type: 'APPEND_STREAMING', payload: msg.delta })
      break

    case 'reasoning':
      ensureAssistantPlaceholder(stateRef, dispatch)
      dispatch({ type: 'APPEND_REASONING', payload: msg.delta })
      break

    case 'tool_start':
      ensureAssistantPlaceholder(stateRef, dispatch)
      dispatch({ type: 'SET_ACTIVITY', payload: { kind: 'tool', label: msg.toolName } })
      dispatch({
        type: 'ADD_STEP',
        payload: {
          id: msg.toolCallId,
          type: 'tool_call',
          name: msg.toolName,
          summary: '',
          status: 'running',
          timestamp: Date.now(),
        },
      })
      break

    case 'tool_result':
      dispatch({
        type: 'COMPLETE_STEP',
        payload: { toolCallId: msg.toolCallId, completedAt: Date.now() },
      })
      break

    case 'videos':
      // 修复 #2：双保险——即使 Port 层校验被绕过（如测试直接调用），也保证 videos 是数组
      if (!Array.isArray(msg.videos)) break
      dispatch({ type: 'SET_VIDEOS', payload: msg.videos })
      break

    case 'insight': {
      // 修复 #4：按 kind 做运行时字段守卫，残缺数据整条丢弃，不进入 state
      switch (msg.kind) {
        case 'understanding':
          if (isValidUnderstanding(msg.data)) {
            dispatch({ type: 'ADD_UNDERSTANDING', payload: msg.data })
          }
          break
        case 'expansion':
          if (isValidExpansion(msg.data)) {
            dispatch({ type: 'ADD_EXPANSION', payload: msg.data })
          }
          break
        case 'rerank':
          if (isValidRerank(msg.data)) {
            dispatch({ type: 'ADD_RERANK', payload: msg.data })
          }
          break
        case 'clarification':
          if (isValidClarification(msg.data)) {
            dispatch({ type: 'SET_CLARIFICATION', payload: msg.data })
          }
          break
      }
      break
    }

    case 'done': {
      const current = stateRef.current
      dispatch({
        type: 'UPDATE_LAST_MESSAGE',
        payload: {
          content: current.streamingContent,
          reasoning: current.streamingReasoning || undefined,
        },
      })
      dispatch({ type: 'CLEAR_STREAMING' })
      dispatch({ type: 'SET_LOADING', payload: false })
      dispatch({ type: 'SET_ACTIVITY', payload: null })
      stateRef.current = {
        ...stateRef.current,
        assistantPlaceholderCreated: false,
      }
      break
    }

    case 'error':
      dispatch({
        type: 'SET_ERROR',
        payload: { message: msg.message, ...(msg.code ? { code: msg.code } : {}) },
      })
      dispatch({ type: 'SET_LOADING', payload: false })
      dispatch({ type: 'SET_ACTIVITY', payload: null })
      // 修复 #6：错误终止路径清空流式缓冲，避免旧半句串入下一次回答
      dispatch({ type: 'CLEAR_STREAMING' })
      stateRef.current = {
        ...stateRef.current,
        assistantPlaceholderCreated: false,
      }
      break

    case 'pong':
      // handled by port-connection heartbeat
      break

    case 'title': {
      // SW 标题生成回推：仅当 conversationId 匹配当前会话时更新标题
      // 标题更新失败不阻塞主流程；成功后派发索引变脏事件通知 HistoryDropdown 刷新
      const currentConv = stateRef.current.conversationId
      if (msg.conversationId === currentConv) {
        void (async () => {
          try {
            await updateTitle(msg.conversationId, msg.title)
            window.dispatchEvent(new Event(HISTORY_INDEX_DIRTY_EVENT))
          } catch {
            // 标题更新失败不阻塞聊天
          }
        })()
      }
      break
    }
  }
}

export interface UseChatResult {
  state: ChatState
  dispatch: Dispatch<ChatAction>
  send: (text: string) => void
  stop: () => void
  /** Alias used by transplanted UI components */
  sendMessage: (text: string) => void | Promise<void>
  /** Alias used by transplanted UI components */
  stopGeneration: () => void
  clearChat: () => void
  connection: PortConnection | null
}

const ChatContext = createContext<UseChatResult | null>(null)

function useChatController(): UseChatResult {
  const [state, dispatch] = useReducer(chatReducer, undefined, createInitialChatState)
  const stateRef = useRef<ConsumerState>({
    ...state,
    assistantPlaceholderCreated: false,
  })
  const connectionRef = useRef<PortConnection | null>(null)
  // 标题请求去重：同一 conversationId 只请求一次 generate_title
  const titleRequestedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    stateRef.current = {
      ...state,
      assistantPlaceholderCreated: stateRef.current.assistantPlaceholderCreated,
    }
  }, [state])

  useEffect(() => {
    // 修复 #5：把建连逻辑抽成可重复调用的函数，断线后自动重连（单实例、指数退避），
    // 避免 Port 断开后 postMessage 静默失败、用户永久卡在 loading
    let unmounted = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0

    const scheduleReconnect = (): void => {
      if (unmounted || reconnectTimer !== null) return
      // 指数退避：1s、2s、4s……上限 30s
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 30_000)
      reconnectAttempts += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        if (unmounted) return
        connect()
      }, delay)
    }

    const connect = (): void => {
      const handlers: ConnectHandlers = {
        onMessage: (msg: SWMessage) => {
          // 收到任意消息说明链路健康，重置退避计数
          reconnectAttempts = 0
          consumeSWMessage(msg, stateRef, dispatch)
        },
        onDisconnect: () => {
          dispatch({
            type: 'SET_ERROR',
            payload: { message: '连接已断开，请重试' },
          })
          dispatch({ type: 'SET_LOADING', payload: false })
          dispatch({ type: 'SET_ACTIVITY', payload: null })
          // 修复 #6：断线终止路径同样清空流式缓冲，防止旧内容串入下一次回答
          dispatch({ type: 'CLEAR_STREAMING' })
          stateRef.current = {
            ...stateRef.current,
            assistantPlaceholderCreated: false,
          }
          // 修复 #5：断线后调度单实例重连
          scheduleReconnect()
        },
      }
      connectionRef.current = connectChatPort(handlers)
    }

    connect()
    return () => {
      unmounted = true
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      connectionRef.current?.disconnect()
      connectionRef.current = null
    }
  }, [])

  // 启动时从本地缓存恢复会话（HYDRATE）：防覆盖逻辑已在 reducer，
  // 有消息/loading/streaming/hydrated 时只置 hydrated=true
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cached = await loadLocalCache()
        if (cancelled) return
        dispatch({ type: 'HYDRATE', payload: cached })
      } catch {
        // 缓存读取失败不阻塞，置 hydrated=true 让 saver 正常工作
        if (!cancelled) dispatch({ type: 'HYDRATE', payload: null })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // useConversationSaver 接线：所有依赖显式注入（Critic C2 / FR-004 AC5）
  const saveCurrentConversation = useCallback(async (): Promise<void> => {
    const current = stateRef.current
    // 空对话不保存（无 messages）
    if (current.messages.length === 0) return
    // 过滤掉空 assistant 占位（无 content/reasoning/steps），避免存噪声
    const messages = current.messages.filter(
      (m) =>
        m.role !== 'assistant' ||
        m.content ||
        m.reasoning ||
        m.steps?.length,
    )
    if (messages.length === 0) return

    // 临时标题：用首条 user 消息前 20 字
    const tempTitle = generateTempTitle(messages)
    try {
      await saveConversation(
        {
          conversationId: current.conversationId,
          messages,
          videos: current.videos,
          understandings: current.understandings,
          expansions: current.expansions,
          reranks: current.reranks,
        },
        tempTitle,
      )
      // 标题生成编排：首次保存后（消息≥2），经单 Port 请求 SW 生成标题
      // 每个 conversationId 只请求一次，避免重复请求
      if (
        messages.length >= 2 &&
        !titleRequestedRef.current.has(current.conversationId)
      ) {
        titleRequestedRef.current.add(current.conversationId)
        const connection = connectionRef.current
        if (connection && !connection.isDisconnected()) {
          // 取前 2 条消息请求生成标题
          connection.postMessage({
            type: 'generate_title',
            conversationId: current.conversationId,
            messages: messages.slice(0, 2),
          })
        }
      }
    } catch {
      // 保存失败不阻塞聊天
    }
    // 注意：saveCurrentConversation 内部不派发 dirty 事件，
    // dirty 派发由 useConversationSaver hook 统一负责
  }, [])

  const dispatchHistoryIndexDirty = useCallback((): void => {
    window.dispatchEvent(new Event(HISTORY_INDEX_DIRTY_EVENT))
  }, [])

  const saverCallbacks: ConversationSaverCallbacks = useMemo(
    () => ({ saveCurrentConversation, dispatchHistoryIndexDirty }),
    [saveCurrentConversation, dispatchHistoryIndexDirty],
  )

  useConversationSaver({
    state,
    dispatch,
    hydrated: state.hydrated,
    stateRef,
    callbacks: saverCallbacks,
  })

  // 监听历史加载事件：HistoryDropdown 点击加载 -> loadConversation -> REHYDRATE
  useEffect(() => {
    const onLoadHistory = (event: Event): void => {
      const customEvent = event as CustomEvent<{ conversationId: string }>
      const conversationId = customEvent.detail?.conversationId
      if (!conversationId) return
      void (async () => {
        try {
          const data = await loadConversation(conversationId)
          if (!data) return
          dispatch({
            type: 'REHYDRATE',
            payload: {
              version: 1,
              conversationId: data.id,
              messages: data.messages,
              videos: data.videos,
              understandings: data.understandings,
              expansions: data.expansions,
              reranks: data.reranks,
              updatedAt: data.lastActiveAt,
            },
          })
        } catch {
          // 加载失败不阻塞
        }
      })()
    }
    window.addEventListener(HISTORY_LOAD_EVENT, onLoadHistory)
    return () => {
      window.removeEventListener(HISTORY_LOAD_EVENT, onLoadHistory)
    }
  }, [])

  // 标题生成的超时降级：SW 若完全不响应（既无 title 也无 error），
  // CS 侧不做额外超时降级，因为 tempTitle 已落盘，标题为非关键功能，
  // 用户可双击重命名。SW 返回 error 时由 consumeSWMessage 的 title 分支已知
  // （error 走通用 error 分支，不覆盖 tempTitle）。

  const send = (text: string): void => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (stateRef.current.isLoading) return

    // 修复 #5：发送前确认连接可用；连接不可用时立即报错，不进入 loading，
    // 避免消息静默丢失后按钮永久卡在 loading 状态
    const connection = connectionRef.current
    if (!connection || connection.isDisconnected()) {
      dispatch({
        type: 'SET_ERROR',
        payload: { message: '连接已断开，正在重连，请稍后重试' },
      })
      return
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    }
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage })
    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })
    dispatch({ type: 'CLEAR_CLARIFICATION' })
    dispatch({ type: 'SET_ACTIVITY', payload: { kind: 'thinking' } })
    stateRef.current = {
      ...stateRef.current,
      assistantPlaceholderCreated: false,
    }

    const committedMessages = [...stateRef.current.messages, userMessage].filter(
      (m) => !(m.role === 'assistant' && m.content === '' && !(m.steps && m.steps.length > 0)),
    )
    connection.postMessage({
      type: 'chat',
      messages: committedMessages,
      conversationId: stateRef.current.conversationId,
    })
    // 修复 #5：postMessage 内部失败会触发 fireDisconnect，此处再次确认；
    // 若发送后连接已断开，立即恢复 loading 状态（onDisconnect 也会兜底处理）
    if (connection.isDisconnected()) {
      dispatch({ type: 'SET_LOADING', payload: false })
      dispatch({ type: 'SET_ACTIVITY', payload: null })
    }
  }

  const stop = (): void => {
    connectionRef.current?.postMessage({ type: 'stop' })
  }

  const clearChat = (): void => {
    // CLEAR_MESSAGES 时清空本地缓存（reducer 无法做副作用，在此动作 creator 里做）
    void clearLocalCache()
    dispatch({ type: 'CLEAR_MESSAGES' })
  }

  return {
    state,
    dispatch,
    send,
    stop,
    sendMessage: send,
    stopGeneration: stop,
    clearChat,
    connection: connectionRef.current,
  }
}

export function ChatProvider({ children }: { children: ReactNode }): ReactElement {
  const value = useChatController()
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): UseChatResult {
  const ctx = useContext(ChatContext)
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return ctx
}

export function useAgentInsights() {
  const { state } = useChat()
  return useMemo(
    () => ({
      understandings: state.understandings,
      expansions: state.expansions,
      reranks: state.reranks,
      clarification: state.clarification,
    }),
    [state.understandings, state.expansions, state.reranks, state.clarification],
  )
}

export { connectChatPort }
export type { PortConnection, ConnectHandlers }

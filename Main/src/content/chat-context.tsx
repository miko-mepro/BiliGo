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
  VideoBatch,
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
  getHistoryIndex,
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
 * 标题兜底超时阈值（毫秒）。
 * 设计依据 3.4 §8：SW 标题请求发出后 ~12s 内既无 title 也无 error 响应时，
 * CS 用临时标题（首条 user 消息前 20 字）置 titleFinal=true 并派发 dirty 事件。
 * 取 12s：略大于 SW 侧 generateText 的 10s AbortSignal.timeout + 回推网络余量。
 */
const TITLE_FALLBACK_TIMEOUT_MS = 12_000

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
  /**
   * 视频批次（S-3）。可选字段，采用向后兼容策略：
   * 旧缓存只有扁平 videos 时，由 migrateVideoBatches 迁移为单批次。
   */
  videoBatches?: VideoBatch[]
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
  /**
   * 当前活跃视频（= 最新批次的 videos）。
   * S-3 之后 videoBatches 才是真实数据源，本字段作为派生镜像保留，
   * 供只关心「当前这组视频」的调用方（如 save-orchestrator 的活动判定）继续使用，
   * 由 reducer 在每次批次变更时同步，不单独写入。
   */
  videos: BilibiliVideoCard[]
  /** 视频批次列表（S-3）：按到达顺序累积，新搜索追加而非替换，旧批次留在旧输出下 */
  videoBatches: VideoBatch[]
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
  /** 按 batchId upsert 视频批次（S-3）：批次已存在则更新，不存在则追加 */
  | { type: 'UPSERT_VIDEO_BATCH'; payload: VideoBatch }
  /** 清空全部视频批次（S-3） */
  | { type: 'CLEAR_VIDEO_BATCHES' }
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
    videoBatches: [],
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

/**
 * 取当前活跃视频（S-3）：最新批次的 videos。
 * 保持与 S-3 之前「全局只展示一组视频」相同的语义，供派生镜像和外部调用方使用。
 */
export function selectCurrentVideos(state: Pick<ChatState, 'videoBatches'>): BilibiliVideoCard[] {
  return state.videoBatches.at(-1)?.videos ?? []
}

/**
 * 旧数据迁移（S-3）：把持久化中的扁平 videos 数组迁移为单个批次。
 *
 * 三条持久化入口（loadLocalCache / loadConversation / HYDRATE-REHYDRATE）共用本函数，
 * 避免各自实现迁移逻辑造成不一致（参考 R-1 的 sanitizeHistoryIndex 模式）。
 * 同时对批次字段做运行时校验：batchId 非法时降级为临时值，videos 非数组时丢弃该批次，
 * 防止脏数据进入状态层引发 render crash。
 *
 * @param batches 新版持久化的 videoBatches 字段（可能不存在）
 * @param legacyVideos 旧版持久化的扁平 videos 字段
 * @param conversationId 用于生成 legacy 批次标识，保证同一会话迁移结果稳定
 */
export function migrateVideoBatches(
  batches: unknown,
  legacyVideos: unknown,
  conversationId: string,
): VideoBatch[] {
  // 新版数据：逐条校验批次字段
  if (Array.isArray(batches)) {
    const result: VideoBatch[] = []
    for (const raw of batches) {
      if (!raw || typeof raw !== 'object') continue
      const candidate = raw as Record<string, unknown>
      // videos 非数组的批次无法渲染，整条丢弃
      if (!Array.isArray(candidate.videos)) continue
      result.push({
        batchId:
          typeof candidate.batchId === 'string' && candidate.batchId.length > 0
            ? candidate.batchId
            : `legacy_${conversationId}_${result.length}`,
        videos: candidate.videos as BilibiliVideoCard[],
        anchorTimestamp:
          typeof candidate.anchorTimestamp === 'number' && Number.isFinite(candidate.anchorTimestamp)
            ? candidate.anchorTimestamp
            : 0,
        receivedAt:
          typeof candidate.receivedAt === 'number' && Number.isFinite(candidate.receivedAt)
            ? candidate.receivedAt
            : 0,
        reranked: candidate.reranked === true,
      })
    }
    return result
  }

  // 旧版数据：非空扁平 videos 迁移为单批次，anchorTimestamp=0 使其排在消息流最前
  if (Array.isArray(legacyVideos) && legacyVideos.length > 0) {
    return [
      {
        batchId: `legacy_${conversationId}`,
        videos: legacyVideos as BilibiliVideoCard[],
        anchorTimestamp: 0,
        receivedAt: 0,
        reranked: false,
      },
    ]
  }

  return []
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

    case 'UPSERT_VIDEO_BATCH': {
      // 按 batchId 定位：已存在则原地更新（video_rerank 的重排推送走这条路径），
      // 不存在则追加（新搜索产生新批次）。旧批次始终保留，不再被新搜索顶掉。
      const index = state.videoBatches.findIndex((b) => b.batchId === action.payload.batchId)
      const videoBatches =
        index >= 0
          ? state.videoBatches.map((b, i) => (i === index ? action.payload : b))
          : [...state.videoBatches, action.payload]
      // videos 是派生镜像，随批次变更同步为最新批次的视频
      return { ...state, videoBatches, videos: selectCurrentVideos({ videoBatches }) }
    }

    case 'CLEAR_VIDEO_BATCHES':
      return { ...state, videoBatches: [], videos: [] }

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
      // 恢复视频批次（S-3）：旧缓存只有扁平 videos 时迁移为单批次
      const videoBatches = migrateVideoBatches(
        action.payload.videoBatches,
        action.payload.videos,
        action.payload.conversationId,
      )
      return {
        ...state,
        messages: action.payload.messages,
        videos: selectCurrentVideos({ videoBatches }),
        videoBatches,
        conversationId: action.payload.conversationId,
        understandings: action.payload.understandings,
        expansions: action.payload.expansions,
        reranks: action.payload.reranks,
        hydrated: true,
      }
    }

    case 'REHYDRATE': {
      // 加载历史会话（S-3）：同样经过迁移，保证旧会话的视频挂回批次结构
      const videoBatches = migrateVideoBatches(
        action.payload.videoBatches,
        action.payload.videos,
        action.payload.conversationId,
      )
      return {
        ...state,
        messages: action.payload.messages,
        videos: selectCurrentVideos({ videoBatches }),
        videoBatches,
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

    case 'videos': {
      // 修复 #2：双保险——即使 Port 层校验被绕过（如测试直接调用），也保证 videos 是数组
      if (!Array.isArray(msg.videos)) break
      // 批次归属（S-3）：batchId 缺失或非法时降级生成临时标识，
      // 保证旧版本 SW 推送的无批次消息仍能显示（向后兼容方案B）
      const batchId =
        typeof msg.batchId === 'string' && msg.batchId.length > 0
          ? msg.batchId
          : `legacy_${Date.now()}`
      const existing = stateRef.current.videoBatches.find((b) => b.batchId === batchId)
      // 锚点推导：批次首次到达时取当前最后一条 assistant 消息的时间戳；
      // 同批次更新（rerank）时保持原锚点，避免重排把视频块挪到消息流末尾
      const anchorTimestamp =
        existing?.anchorTimestamp
        ?? stateRef.current.messages.filter((m) => m.role === 'assistant').at(-1)?.timestamp
        ?? Date.now()
      dispatch({
        type: 'UPSERT_VIDEO_BATCH',
        payload: {
          batchId,
          videos: msg.videos,
          anchorTimestamp,
          receivedAt: existing?.receivedAt ?? Date.now(),
          reranked: msg.reranked === true,
          rerankPending: msg.rerankPending === true,
        },
      })
      break
    }

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
  // 修复 #8（reviewer SB-9 Important #2）：标题兜底超时定时器 Map。
  // SW 崩溃或 Port 异常时既无 {type:'title'} 也无 {type:'error'} 回推，
  // 临时标题永久残留、titleFinal 永不置位，违反 3.4 §8。
  // 发送 generate_title 时同时启动 12s 兜底定时器；到期后若该 conversationId
  // 的标题仍未最终化（getHistoryIndex 查 titleFinal 仍 false），调 updateTitle
  // 写入临时标题并派发 HISTORY_INDEX_DIRTY_EVENT。收到 title 成功响应时清除。
  const titleTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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
          // 修复 #8（reviewer SB-9 Important #2）：收到 title 成功响应时清除兜底定时器。
          // 注意：即使 conversationId 与当前会话不匹配（用户已切换会话），也要清除
          // 该 conversationId 的兜底定时器，避免定时器到期误降级覆盖 SW 已返回的正式标题。
          // 放在 consumeSWMessage 之后，保持 consumeSWMessage 作为独立纯函数不变。
          if (msg.type === 'title') {
            const timer = titleTimeoutsRef.current.get(msg.conversationId)
            if (timer !== undefined) {
              clearTimeout(timer)
              titleTimeoutsRef.current.delete(msg.conversationId)
            }
          }
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
      // 修复 #8（reviewer SB-9 Important #2）：组件卸载时清理所有标题兜底定时器，
      // 避免卸载后定时器仍触发 updateTitle/dirty 事件造成泄漏
      for (const timer of titleTimeoutsRef.current.values()) {
        clearTimeout(timer)
      }
      titleTimeoutsRef.current.clear()
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
          // 保存批次（S-3）：历史对话加载后旧视频仍挂在旧输出下
          videoBatches: current.videoBatches,
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
        const connection = connectionRef.current
        if (connection && !connection.isDisconnected()) {
          // TODO-22：titleRequestedRef.add 移到"连接可用"判定块内部、紧邻 postMessage。
          // 原实现在外层判定后立即 add，若连接已断开则 add 了却未真正发请求，
          // 后续同一 conversationId 永不重试（标题生成卡死）。现仅在确认能 postMessage 时
          // 才标记已请求，断连场景下次保存仍可重试。
          titleRequestedRef.current.add(current.conversationId)
          // 取前 2 条消息请求生成标题
          connection.postMessage({
            type: 'generate_title',
            conversationId: current.conversationId,
            messages: messages.slice(0, 2),
          })
          // 修复 #8（reviewer SB-9 Important #2）：启动 12s 兜底定时器。
          // SW 无响应（既无 title 也无 error）时，到期后用临时标题降级：
          // 查 getHistoryIndex 该记录 titleFinal 仍 false 才写 updateTitle
          // 并派发 HISTORY_INDEX_DIRTY_EVENT。以历史索引记录为准操作，
          // 不依赖当前 state（竞态：定时器触发时 conversationId 可能已切换）。
          const convIdForTitle = current.conversationId
          const fallbackTimer = setTimeout(() => {
            titleTimeoutsRef.current.delete(convIdForTitle)
            void (async () => {
              try {
                const index = await getHistoryIndex()
                const record = index.find((r) => r.id === convIdForTitle)
                // 仍 false 才降级；已由 SW title 响应置位则跳过
                if (!record || record.titleFinal) return
                await updateTitle(convIdForTitle, tempTitle)
                window.dispatchEvent(new Event(HISTORY_INDEX_DIRTY_EVENT))
              } catch {
                // 降级失败不阻塞聊天
              }
            })()
          }, TITLE_FALLBACK_TIMEOUT_MS)
          titleTimeoutsRef.current.set(convIdForTitle, fallbackTimer)
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
              // 透传批次（S-3）：REHYDRATE reducer 内会调用 migrateVideoBatches，
              // 旧对话没有该字段时按扁平 videos 迁移为单批次
              videoBatches: data.videoBatches,
              understandings: data.understandings,
              expansions: data.expansions,
              reranks: data.reranks,
              updatedAt: data.lastActiveAt,
            },
          })
          // 修复 #7（reviewer SB-9 Important #1）：REHYDRATE 后显式重置
          // assistantPlaceholderCreated=false。reducer 只管 ChatState 字段，
          // 不触及 ConsumerStateRef 的 assistantPlaceholderCreated；若上一会话
          // 已创建占位（=true），加载历史后下一次 send() 时 ensureAssistantPlaceholder
          // 会提前 return，首条 assistant 占位不创建，流式 chunk 无处挂载。
          // 与 done/error/onDisconnect 路径的既有写法一致（见 466/482/578 行）。
          stateRef.current = {
            ...stateRef.current,
            assistantPlaceholderCreated: false,
          }
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

  // 标题兜底超时降级说明（修复 #8 / reviewer SB-9 Important #2）：
  // SW 标题请求发出后 12s 内若无响应（既无 title 也无 error），由
  // saveCurrentConversation 内的兜底定时器用临时标题降级并置 titleFinal=true。
  // 收到 {type:'title'} 成功响应时在 onMessage 回调里清除对应定时器。
  // SW 返回 error 时走通用 error 分支，不覆盖 tempTitle，但定时器到期后
  // 仍会用 tempTitle 降级置位 titleFinal（符合 3.4 §8：失败用首条 user 前 20 字）。

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

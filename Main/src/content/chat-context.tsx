import {
  useReducer,
  useRef,
  useEffect,
  createContext,
  useContext,
  useMemo,
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

export type AgentActivity = { kind: 'thinking' | 'responding' | 'tool'; label?: string }

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
      dispatch({ type: 'SET_VIDEOS', payload: msg.videos })
      break

    case 'insight': {
      const data = msg.data as
        | SlangUnderstandResult
        | QueryExpandResult
        | RerankResult
        | ClarificationRequest
      switch (msg.kind) {
        case 'understanding':
          dispatch({ type: 'ADD_UNDERSTANDING', payload: data as SlangUnderstandResult })
          break
        case 'expansion':
          dispatch({ type: 'ADD_EXPANSION', payload: data as QueryExpandResult })
          break
        case 'rerank':
          dispatch({ type: 'ADD_RERANK', payload: data as RerankResult })
          break
        case 'clarification':
          dispatch({ type: 'SET_CLARIFICATION', payload: data as ClarificationRequest })
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
      stateRef.current = {
        ...stateRef.current,
        assistantPlaceholderCreated: false,
      }
      break

    case 'pong':
      // handled by port-connection heartbeat
      break
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

  useEffect(() => {
    stateRef.current = {
      ...state,
      assistantPlaceholderCreated: stateRef.current.assistantPlaceholderCreated,
    }
  }, [state])

  useEffect(() => {
    const handlers: ConnectHandlers = {
      onMessage: (msg: SWMessage) => {
        consumeSWMessage(msg, stateRef, dispatch)
      },
      onDisconnect: () => {
        dispatch({
          type: 'SET_ERROR',
          payload: { message: '连接已断开，请重试' },
        })
        dispatch({ type: 'SET_LOADING', payload: false })
        dispatch({ type: 'SET_ACTIVITY', payload: null })
        stateRef.current = {
          ...stateRef.current,
          assistantPlaceholderCreated: false,
        }
      },
    }
    connectionRef.current = connectChatPort(handlers)
    return () => {
      connectionRef.current?.disconnect()
      connectionRef.current = null
    }
  }, [])

  const send = (text: string): void => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (stateRef.current.isLoading) return

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
    connectionRef.current?.postMessage({
      type: 'chat',
      messages: committedMessages,
      conversationId: stateRef.current.conversationId,
    })
  }

  const stop = (): void => {
    connectionRef.current?.postMessage({ type: 'stop' })
  }

  const clearChat = (): void => {
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

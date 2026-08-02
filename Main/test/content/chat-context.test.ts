import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  chatReducer,
  createInitialChatState,
  type ChatState,
  type ChatAction,
  type PersistedConversation,
} from '../../src/content/chat-context.js'
import type {
  ChatMessage,
  AgentStep,
  BilibiliVideoCard,
  SlangUnderstandResult,
  QueryExpandResult,
  RerankResult,
  ClarificationRequest,
  ErrorPayload,
} from '../../src/lib/shared-types/index.js'

const FIXED_NOW = 1704067200000

function state(overrides: Partial<ChatState> = {}): ChatState {
  return { ...createInitialChatState(), ...overrides }
}

function message(
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return { role, content, timestamp: Date.now(), ...overrides }
}

function reduceSequence(initial: ChatState, actions: ChatAction[]): ChatState {
  return actions.reduce(chatReducer, initial)
}

function assistantWithSteps(steps: AgentStep[], content = ''): ChatMessage {
  return message('assistant', content, { steps })
}

function step(id: string, overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    id,
    type: 'tool_call',
    name: `tool-${id}`,
    summary: '',
    status: 'running',
    timestamp: Date.now(),
    ...overrides,
  }
}

function video(overrides: Partial<BilibiliVideoCard> = {}): BilibiliVideoCard {
  return {
    bvid: 'BV1xx',
    aid: 1,
    title: 'title',
    author: 'author',
    pic: 'pic',
    play: 0,
    videoReview: 0,
    favorites: 0,
    duration: '10:00',
    pubdate: 0,
    tag: '',
    description: '',
    ...overrides,
  }
}

function persistedConversation(
  overrides: {
    version?: 1
    conversationId?: string
    messages?: ChatMessage[]
    videos?: BilibiliVideoCard[]
    understandings?: SlangUnderstandResult[]
    expansions?: QueryExpandResult[]
    reranks?: RerankResult[]
    updatedAt?: number
  } = {},
): PersistedConversation {
  const understandings = (overrides.understandings ?? []).map((u) => ({
    ...u,
    receivedAt: FIXED_NOW,
  }))
  const expansions = (overrides.expansions ?? []).map((e) => ({
    ...e,
    receivedAt: FIXED_NOW,
  }))
  const reranks = (overrides.reranks ?? []).map((r) => ({
    ...r,
    receivedAt: FIXED_NOW,
  }))
  return {
    version: 1,
    conversationId: overrides.conversationId ?? 'conv_persisted',
    messages: overrides.messages ?? [message('user', '历史消息')],
    videos: overrides.videos ?? [video({ bvid: 'BVpersist' })],
    understandings,
    expansions,
    reranks,
    updatedAt: overrides.updatedAt ?? FIXED_NOW,
  }
}

function understanding(
  overrides: Partial<SlangUnderstandResult> = {},
): SlangUnderstandResult {
  return {
    original: '梗',
    normalized: '梗',
    explanation: '解释',
    matchedDict: false,
    ...overrides,
  }
}

function expansion(overrides: Partial<QueryExpandResult> = {}): QueryExpandResult {
  return {
    keywords: ['k'],
    tags: ['t'],
    categories: ['c'],
    rationale: '理由',
    ...overrides,
  }
}

function rerank(overrides: Partial<RerankResult> = {}): RerankResult {
  return {
    items: [{ bvid: 'BV1', score: 0.5, reason: 'r' }],
    strategy: 'llm',
    trimmed: 0,
    ...overrides,
  }
}

function clarification(
  overrides: Partial<ClarificationRequest> = {},
): ClarificationRequest {
  return {
    question: '需要澄清吗？',
    options: ['是', '否'],
    reason: '不确定',
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('reducer basics', () => {
  it('handles ADD_MESSAGE SET_LOADING SET_ERROR SET_VIDEOS and SET_ACTIVITY immutably', () => {
    const initial = state()
    const initialStateRef = initial
    const initialMessages = initial.messages

    const addMsgAction: ChatAction = {
      type: 'ADD_MESSAGE',
      payload: message('user', 'hello'),
    }
    const afterAdd = chatReducer(initial, addMsgAction)
    expect(afterAdd).not.toBe(initial)
    expect(afterAdd.messages).not.toBe(initialMessages)
    expect(afterAdd.messages).toHaveLength(1)
    expect(afterAdd.messages[0].content).toBe('hello')
    expect(initial.messages).toHaveLength(0)

    const setLoadingAction: ChatAction = { type: 'SET_LOADING', payload: true }
    const afterLoading = chatReducer(afterAdd, setLoadingAction)
    expect(afterLoading).not.toBe(afterAdd)
    expect(afterLoading.isLoading).toBe(true)
    expect(afterAdd.isLoading).toBe(false)

    const errPayload: ErrorPayload = { message: '出错了', code: 'NETWORK_ERROR' }
    const setErrorAction: ChatAction = { type: 'SET_ERROR', payload: errPayload }
    const afterError = chatReducer(afterLoading, setErrorAction)
    expect(afterError).not.toBe(afterLoading)
    expect(afterError.error).toEqual(errPayload)
    expect(afterLoading.error).toBeNull()

    const vids = [video({ bvid: 'BV001' })]
    const setVideosAction: ChatAction = { type: 'SET_VIDEOS', payload: vids }
    const afterVideos = chatReducer(afterError, setVideosAction)
    expect(afterVideos).not.toBe(afterError)
    expect(afterVideos.videos).toBe(vids)
    expect(afterError.videos).toEqual([])

    const activity = { kind: 'thinking' as const, label: '思考中' }
    const setActivityAction: ChatAction = { type: 'SET_ACTIVITY', payload: activity }
    const afterActivity = chatReducer(afterVideos, setActivityAction)
    expect(afterActivity).not.toBe(afterVideos)
    expect(afterActivity.activity).toEqual(activity)
    expect(afterVideos.activity).toBeNull()

    expect(initial).toBe(initialStateRef)
    expect(initial.messages).toBe(initialMessages)
  })
})

describe('reducer streaming', () => {
  it('appends streaming and reasoning independently', () => {
    const initial = state({ streamingContent: 'abc' })
    const afterStream = chatReducer(initial, {
      type: 'APPEND_STREAMING',
      payload: 'def',
    })
    expect(afterStream.streamingContent).toBe('abcdef')
    expect(afterStream.streamingReasoning).toBe('')

    const afterReason = chatReducer(afterStream, {
      type: 'APPEND_REASONING',
      payload: 'x',
    })
    expect(afterReason.streamingContent).toBe('abcdef')
    expect(afterReason.streamingReasoning).toBe('x')
  })

  it('clears both streaming fields', () => {
    const initial = state({ streamingContent: 'abc', streamingReasoning: 'xyz' })
    const cleared = chatReducer(initial, { type: 'CLEAR_STREAMING' })
    expect(cleared.streamingContent).toBe('')
    expect(cleared.streamingReasoning).toBe('')
  })
})

describe('reducer steps', () => {
  it('adds a running step to the trailing assistant message', () => {
    const initial = state({
      messages: [message('assistant', '你好')],
    })
    const newStep = step('s1', { name: 'search', summary: '' })
    const after = chatReducer(initial, { type: 'ADD_STEP', payload: newStep })
    const last = after.messages[after.messages.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.steps).toHaveLength(1)
    expect(last.steps![0].id).toBe('s1')
    expect(last.steps![0].status).toBe('running')
  })

  it('completes the matching step by toolCallId', () => {
    const initial = state({
      messages: [
        assistantWithSteps([
          step('s1', { name: 'search' }),
          step('s2', { name: 'rerank' }),
        ]),
      ],
    })
    const after = chatReducer(initial, {
      type: 'COMPLETE_STEP',
      payload: { toolCallId: 's1', completedAt: FIXED_NOW },
    })
    const last = after.messages[after.messages.length - 1]
    const steps = last.steps!
    const s1 = steps.find((s) => s.id === 's1')!
    const s2 = steps.find((s) => s.id === 's2')!
    expect(s1.status).toBe('completed')
    expect(s1.completedAt).toBe(FIXED_NOW)
    expect(s2.status).toBe('running')
    expect(s2.completedAt).toBeUndefined()
  })

  it('ignores step actions when the last message is not assistant', () => {
    const initial = state({
      messages: [message('user', '问题')],
    })
    const afterAdd = chatReducer(initial, {
      type: 'ADD_STEP',
      payload: step('s1'),
    })
    expect(afterAdd).toEqual(initial)

    const afterComplete = chatReducer(initial, {
      type: 'COMPLETE_STEP',
      payload: { toolCallId: 's1', completedAt: FIXED_NOW },
    })
    expect(afterComplete).toBe(initial)
  })
})

// ===== 过程文字自动归类（PROMOTE_STREAMING_TO_NOTE）=====
// 工具调用前累积的流式正文应转为 note 步骤收进思维栏，并清空 streamingContent
describe('reducer promote streaming to note', () => {
  it('promotes accumulated streaming content into a note step and clears streaming', () => {
    const initial = state({
      messages: [message('user', '找视频'), message('assistant', '')],
      streamingContent: '这个需求很明确，我直接搜索。',
    })
    const after = chatReducer(initial, { type: 'PROMOTE_STREAMING_TO_NOTE' })
    const last = after.messages[after.messages.length - 1]
    expect(last.steps).toHaveLength(1)
    expect(last.steps![0].type).toBe('note')
    expect(last.steps![0].summary).toBe('这个需求很明确，我直接搜索。')
    expect(last.steps![0].status).toBe('completed')
    expect(after.streamingContent).toBe('')
  })

  it('does nothing when streaming content is empty or whitespace', () => {
    const initial = state({
      messages: [message('assistant', '')],
      streamingContent: '   ',
    })
    const after = chatReducer(initial, { type: 'PROMOTE_STREAMING_TO_NOTE' })
    expect(after).toBe(initial)
    const last = after.messages[after.messages.length - 1]
    expect(last.steps).toBeUndefined()
  })

  it('does nothing when the last message is not assistant', () => {
    const initial = state({
      messages: [message('user', '问题')],
      streamingContent: '有内容',
    })
    const after = chatReducer(initial, { type: 'PROMOTE_STREAMING_TO_NOTE' })
    expect(after).toBe(initial)
  })

  it('appends note after existing tool_call steps preserving timeline order', () => {
    const initial = state({
      messages: [
        assistantWithSteps([step('s1', { name: 'bilibili_search', status: 'completed' })]),
      ],
      streamingContent: '结果超过 3 条，我重排一下。',
    })
    const after = chatReducer(initial, { type: 'PROMOTE_STREAMING_TO_NOTE' })
    const steps = after.messages[0].steps!
    expect(steps).toHaveLength(2)
    expect(steps[0].type).toBe('tool_call')
    expect(steps[1].type).toBe('note')
    expect(steps[1].summary).toBe('结果超过 3 条，我重排一下。')
  })
})

describe('reducer message', () => {
  it('updates only the trailing assistant message', () => {
    const userMsg = message('user', '用户问题')
    const assistant1 = message('assistant', '旧回答', {
      reasoning: '旧推理',
      steps: [step('s_old')],
    })
    const assistant2 = message('assistant', '旧回答2', {
      reasoning: '旧推理2',
      steps: [step('s_trail')],
    })
    const initial = state({
      messages: [userMsg, assistant1, assistant2],
    })
    const after = chatReducer(initial, {
      type: 'UPDATE_LAST_MESSAGE',
      payload: { content: 'new', reasoning: 'r' },
    })
    expect(after.messages[0]).toBe(userMsg)
    expect(after.messages[1]).toBe(assistant1)
    const last = after.messages[2]
    expect(last.content).toBe('new')
    expect(last.reasoning).toBe('r')
    expect(last.steps).toEqual([step('s_trail')])
  })
})

describe('reducer reset', () => {
  it('clears the conversation and generates a new id', () => {
    const oldId = 'conv_old'
    const initial = state({
      messages: [message('user', 'a'), message('assistant', 'b'), message('user', 'c')],
      conversationId: oldId,
    })
    const after = chatReducer(initial, { type: 'CLEAR_MESSAGES' })
    expect(after.messages).toEqual([])
    expect(after.conversationId).not.toBe(oldId)
    expect(after.conversationId.startsWith('conv_')).toBe(true)
    expect(after.hydrated).toBe(true)
  })
})

describe('reducer hydration', () => {
  it('marks hydration complete for a null payload', () => {
    const initial = state({ hydrated: false, messages: [], isLoading: false })
    const other = { ...initial }
    const after = chatReducer(initial, { type: 'HYDRATE', payload: null })
    expect(after.hydrated).toBe(true)
    expect(after.messages).toEqual([])
    expect(after.conversationId).toBe(initial.conversationId)
    expect(after.isLoading).toBe(false)
    expect(after.streamingContent).toBe('')
    expect(after).not.toBe(initial)
    expect(initial).toEqual(other)
  })

  it('hydrates a pristine conversation', () => {
    const initial = state({ hydrated: false })
    const payload = persistedConversation({
      messages: [message('user', '历史1'), message('assistant', '历史2')],
      videos: [video({ bvid: 'BV_h' })],
      conversationId: 'conv_from_payload',
      understandings: [understanding({ normalized: '历史理解' })],
      expansions: [expansion({ keywords: ['历史关键词'] })],
      reranks: [rerank({ strategy: 'fallback' })],
    })
    const after = chatReducer(initial, { type: 'HYDRATE', payload })
    expect(after.hydrated).toBe(true)
    expect(after.conversationId).toBe('conv_from_payload')
    expect(after.messages).toBe(payload.messages)
    expect(after.videos).toBe(payload.videos)
    expect(after.understandings).toBe(payload.understandings)
    expect(after.expansions).toBe(payload.expansions)
    expect(after.reranks).toBe(payload.reranks)
  })

  it('does not clobber a started conversation', () => {
    const currentMessages = [message('user', '当前'), message('assistant', '当前回答')]
    const initial = state({
      hydrated: false,
      messages: currentMessages,
      isLoading: true,
      streamingContent: '流式中',
    })
    const originalConversationId = initial.conversationId
    const payload = persistedConversation({
      messages: [message('user', '历史')],
      conversationId: 'conv_payload',
    })
    const after = chatReducer(initial, { type: 'HYDRATE', payload })
    expect(after.hydrated).toBe(true)
    expect(after.messages).toBe(currentMessages)
    expect(after.conversationId).toBe(originalConversationId)
    expect(after.isLoading).toBe(true)
    expect(after.streamingContent).toBe('流式中')
  })

  it('rehydrates selected history and clears transient state', () => {
    const initial = state({
      streamingContent: '残留流式',
      streamingReasoning: '残留推理',
      error: { message: '旧错误', code: 'NETWORK_ERROR' },
      activity: { kind: 'tool', label: '工具' },
      isLoading: true,
      clarification: clarification({ question: '旧问题' }),
    })
    const payload = persistedConversation({
      messages: [message('user', '再水合历史')],
      conversationId: 'conv_rehyd',
      videos: [video({ bvid: 'BV_rehyd' })],
    })
    const after = chatReducer(initial, { type: 'REHYDRATE', payload })
    expect(after.messages).toBe(payload.messages)
    expect(after.videos).toBe(payload.videos)
    expect(after.conversationId).toBe('conv_rehyd')
    expect(after.streamingContent).toBe('')
    expect(after.streamingReasoning).toBe('')
    expect(after.error).toBeNull()
    expect(after.activity).toBeNull()
    expect(after.isLoading).toBe(false)
    expect(after.clarification).toBeNull()
    expect(after.hydrated).toBe(true)
  })
})

describe('reducer insights', () => {
  it('appends timestamped understanding expansion and rerank data', () => {
    const initial = state({
      understandings: [],
      expansions: [],
      reranks: [],
    })
    const u = understanding({ original: '梗A', normalized: 'A' })
    const e = expansion({ keywords: ['k1'] })
    const r = rerank({ strategy: 'llm' })

    const afterU = chatReducer(initial, { type: 'ADD_UNDERSTANDING', payload: u })
    const afterE = chatReducer(afterU, { type: 'ADD_EXPANSION', payload: e })
    const afterR = chatReducer(afterE, { type: 'ADD_RERANK', payload: r })

    expect(afterU.understandings).toHaveLength(1)
    expect(afterU.understandings[0]).toEqual({ ...u, receivedAt: FIXED_NOW })
    expect(afterE.expansions).toHaveLength(1)
    expect(afterE.expansions[0]).toEqual({ ...e, receivedAt: FIXED_NOW })
    expect(afterR.reranks).toHaveLength(1)
    expect(afterR.reranks[0]).toEqual({ ...r, receivedAt: FIXED_NOW })

    expect(afterE.understandings).toBe(afterU.understandings)
    expect(afterR.understandings).toBe(afterU.understandings)
    expect(afterR.expansions).toBe(afterE.expansions)
  })
})

describe('reducer clarification', () => {
  it('accepts one clarification and rejects a second pending one', () => {
    const initial = state({ clarification: null })
    const first = clarification({ question: '第一次', options: ['A'] })
    const afterFirst = chatReducer(initial, {
      type: 'SET_CLARIFICATION',
      payload: first,
    })
    expect(afterFirst.clarification).toEqual(first)

    const second = clarification({ question: '第二次', options: ['B'] })
    const afterSecond = chatReducer(afterFirst, {
      type: 'SET_CLARIFICATION',
      payload: second,
    })
    expect(afterSecond.clarification).toEqual(first)
    expect(afterSecond).toBe(afterFirst)
  })

  it('clears the pending clarification', () => {
    const existing = clarification({ question: '已有' })
    const initial = state({ clarification: existing })
    const after = chatReducer(initial, { type: 'CLEAR_CLARIFICATION' })
    expect(after.clarification).toBeNull()
  })
})

describe('invariants', () => {
  it('I5 changes conversationId only on valid HYDRATE REHYDRATE or CLEAR_MESSAGES', () => {
    const initial = state({ conversationId: 'conv_stable', hydrated: true })
    const originalId = initial.conversationId

    const afterAdd = chatReducer(initial, {
      type: 'ADD_MESSAGE',
      payload: message('user', 'x'),
    })
    expect(afterAdd.conversationId).toBe(originalId)

    const afterLoading = chatReducer(afterAdd, { type: 'SET_LOADING', payload: true })
    expect(afterLoading.conversationId).toBe(originalId)

    const afterStream = chatReducer(afterLoading, {
      type: 'APPEND_STREAMING',
      payload: 'abc',
    })
    expect(afterStream.conversationId).toBe(originalId)

    const afterError = chatReducer(afterStream, {
      type: 'SET_ERROR',
      payload: { message: 'e' },
    })
    expect(afterError.conversationId).toBe(originalId)

    const afterVideos = chatReducer(afterError, {
      type: 'SET_VIDEOS',
      payload: [video()],
    })
    expect(afterVideos.conversationId).toBe(originalId)

    const afterActivity = chatReducer(afterVideos, {
      type: 'SET_ACTIVITY',
      payload: { kind: 'thinking' },
    })
    expect(afterActivity.conversationId).toBe(originalId)

    const afterReason = chatReducer(afterActivity, {
      type: 'APPEND_REASONING',
      payload: 'r',
    })
    expect(afterReason.conversationId).toBe(originalId)

    const afterClearStream = chatReducer(afterReason, { type: 'CLEAR_STREAMING' })
    expect(afterClearStream.conversationId).toBe(originalId)

    const afterAddStep = chatReducer(afterClearStream, {
      type: 'ADD_STEP',
      payload: step('sx'),
    })
    expect(afterAddStep.conversationId).toBe(originalId)

    const afterUpdate = chatReducer(afterAddStep, {
      type: 'UPDATE_LAST_MESSAGE',
      payload: { content: 'y' },
    })
    expect(afterUpdate.conversationId).toBe(originalId)

    const afterU = chatReducer(afterUpdate, {
      type: 'ADD_UNDERSTANDING',
      payload: understanding(),
    })
    expect(afterU.conversationId).toBe(originalId)

    const afterClear = chatReducer(afterU, { type: 'CLEAR_CLARIFICATION' })
    expect(afterClear.conversationId).toBe(originalId)

    const afterClearMessages = chatReducer(afterClear, { type: 'CLEAR_MESSAGES' })
    expect(afterClearMessages.conversationId).not.toBe(originalId)
  })

  it('I6 never removes prior understanding expansion or rerank entries', () => {
    const initial = state({
      understandings: [
        { original: '梗', normalized: '旧', explanation: '解释', matchedDict: false, receivedAt: 1 },
      ],
      expansions: [
        { keywords: ['旧k'], tags: [], categories: [], rationale: '理由', receivedAt: 1 },
      ],
      reranks: [
        { items: [], strategy: 'fallback', trimmed: 0, receivedAt: 1 },
      ],
    })

    const newU = understanding({ normalized: '新' })
    const newE = expansion({ keywords: ['新k'] })
    const newR = rerank({ strategy: 'llm' })

    const after = reduceSequence(initial, [
      { type: 'ADD_UNDERSTANDING', payload: newU },
      { type: 'ADD_EXPANSION', payload: newE },
      { type: 'ADD_RERANK', payload: newR },
    ])

    expect(after.understandings).toHaveLength(2)
    expect(after.understandings[0].normalized).toBe('旧')
    expect(after.understandings[1].normalized).toBe('新')
    expect(after.expansions).toHaveLength(2)
    expect(after.expansions[0].keywords).toEqual(['旧k'])
    expect(after.expansions[1].keywords).toEqual(['新k'])
    expect(after.reranks).toHaveLength(2)
    expect(after.reranks[0].strategy).toBe('fallback')
    expect(after.reranks[1].strategy).toBe('llm')
  })

  it('I7 keeps at most one pending clarification', () => {
    const first = clarification({ question: '第一个', reason: 'r1' })
    const initial = state({ clarification: first })

    const second = clarification({ question: '第二个', reason: 'r2' })
    const after = chatReducer(initial, {
      type: 'SET_CLARIFICATION',
      payload: second,
    })

    expect(after.clarification).toBe(first)
    expect(after).toBe(initial)
  })

  it('I8 applies step actions only to a trailing assistant', () => {
    const userOnly = state({ messages: [message('user', '问题')] })
    const afterAdd = chatReducer(userOnly, {
      type: 'ADD_STEP',
      payload: step('s1'),
    })
    expect(afterAdd.messages[0].steps).toBeUndefined()

    const afterComplete = chatReducer(userOnly, {
      type: 'COMPLETE_STEP',
      payload: { toolCallId: 's1', completedAt: FIXED_NOW },
    })
    expect(afterComplete).toBe(userOnly)
  })
})

// ===== P4 hydration 组 + 标题降级纯函数 =====

describe('hydration guard', () => {
  it('does not clobber when messages already exist even without loading/streaming', () => {
    // 防覆盖：已有消息（无 loading/streaming）时 HYDRATE 只置 hydrated=true
    const existing = [message('user', '当前'), message('assistant', '回答')]
    const initial = state({ hydrated: false, messages: existing })
    const originalId = initial.conversationId
    const payload = persistedConversation({
      messages: [message('user', '历史覆盖')],
      conversationId: 'conv_should_not_apply',
    })
    const after = chatReducer(initial, { type: 'HYDRATE', payload })
    expect(after.hydrated).toBe(true)
    // 消息不被覆盖
    expect(after.messages).toBe(existing)
    expect(after.conversationId).toBe(originalId)
  })

  it('does not clobber when hydrated already true', () => {
    const initial = state({ hydrated: true, messages: [] })
    const payload = persistedConversation({
      messages: [message('user', '历史')],
      conversationId: 'conv_x',
    })
    const after = chatReducer(initial, { type: 'HYDRATE', payload })
    expect(after.hydrated).toBe(true)
    expect(after.conversationId).toBe(initial.conversationId)
  })

  it('does not clobber when isLoading true', () => {
    const initial = state({ hydrated: false, isLoading: true })
    const payload = persistedConversation({ conversationId: 'conv_y' })
    const after = chatReducer(initial, { type: 'HYDRATE', payload })
    expect(after.hydrated).toBe(true)
    expect(after.conversationId).toBe(initial.conversationId)
  })

  it('does not clobber when streamingContent non-empty', () => {
    const initial = state({ hydrated: false, streamingContent: '流式中' })
    const payload = persistedConversation({ conversationId: 'conv_z' })
    const after = chatReducer(initial, { type: 'HYDRATE', payload })
    expect(after.hydrated).toBe(true)
    expect(after.conversationId).toBe(initial.conversationId)
  })

  it('restores empty state normally from null payload', () => {
    const initial = state({ hydrated: false })
    const after = chatReducer(initial, { type: 'HYDRATE', payload: null })
    expect(after.hydrated).toBe(true)
    expect(after.messages).toEqual([])
  })

  it('I5 keeps conversationId stable through hydration guard paths', () => {
    const initial = state({ conversationId: 'conv_stable', hydrated: false, messages: [message('user', 'x')] })
    const originalId = initial.conversationId
    // HYDRATE 防覆盖路径不改变 conversationId
    const afterHydrate = chatReducer(initial, {
      type: 'HYDRATE',
      payload: persistedConversation({ conversationId: 'conv_other' }),
    })
    expect(afterHydrate.conversationId).toBe(originalId)
    // REHYDRATE 路径改变 conversationId（加载历史）
    const afterRehydrate = chatReducer(initial, {
      type: 'REHYDRATE',
      payload: persistedConversation({ conversationId: 'conv_loaded' }),
    })
    expect(afterRehydrate.conversationId).toBe('conv_loaded')
    // CLEAR_MESSAGES 路径生成新 conversationId
    const afterClear = chatReducer(initial, { type: 'CLEAR_MESSAGES' })
    expect(afterClear.conversationId).not.toBe(originalId)
  })
})

describe('generateTempTitle', () => {
  it('uses first 20 chars of first user message', async () => {
    const { generateTempTitle } = await import('../../src/content/chat-context.js')
    const msgs = [
      message('user', '这是一段超过二十个字的历史消息需要被截断到二十字以内'),
      message('assistant', '回复'),
    ]
    expect(generateTempTitle(msgs)).toBe('这是一段超过二十个字的历史消息需要被截断')
  })

  it('falls back to 新对话 when no user message', async () => {
    const { generateTempTitle } = await import('../../src/content/chat-context.js')
    expect(generateTempTitle([message('assistant', '回复')])).toBe('新对话')
  })

  it('falls back to 新对话 when first user content is empty', async () => {
    const { generateTempTitle } = await import('../../src/content/chat-context.js')
    expect(generateTempTitle([message('user', '   ')])).toBe('新对话')
  })
})

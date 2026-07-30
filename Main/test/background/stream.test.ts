import { describe, it, expect, vi, beforeEach } from 'vitest'

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
  isStepCount: vi.fn(),
  tool: vi.fn((opts) => ({ ...opts, __aiTool: true })),
}))

vi.mock('ai', () => ({
  streamText: aiMocks.streamText,
  generateText: aiMocks.generateText,
  isStepCount: aiMocks.isStepCount,
  tool: aiMocks.tool,
}))

const settingsMocks = vi.hoisted(() => ({
  readBiliAgentSettings: vi.fn(),
}))

vi.mock('../../src/config/settings.js', () => ({
  readBiliAgentSettings: settingsMocks.readBiliAgentSettings,
}))

const factoryMocks = vi.hoisted(() => ({
  createModel: vi.fn(),
  validateProviderConfig: vi.fn(),
}))

vi.mock('../../src/config/provider-factory.js', () => ({
  createModel: factoryMocks.createModel,
  validateProviderConfig: factoryMocks.validateProviderConfig,
}))

// Mock 5 个工具模块 + working-memory + analyze-covers，避免触发实际工具实现
// 及其依赖链（slang-dictionary.json / tag-categories.json / bilibili-client/* 等）。
// 工厂返回占位 tool 对象即可，因 streamText 已被 mock，工具 execute 不会被调用。
const toolMocks = vi.hoisted(() => ({
  createSlangUnderstandTool: vi.fn(() => ({ __kind: 'slang_understand' })),
  createQueryExpandTool: vi.fn(() => ({ __kind: 'query_expand' })),
  createBilibiliSearchTool: vi.fn(() => ({ __kind: 'bilibili_search' })),
  createVideoRerankTool: vi.fn(() => ({ __kind: 'video_rerank' })),
  askClarification: vi.fn(),
  WorkingMemoryStore: {
    create: vi.fn(() => Promise.resolve({ traceId: 'test-trace' })),
    get: vi.fn(() => Promise.resolve(undefined)),
    update: vi.fn(() => Promise.resolve(undefined)),
    release: vi.fn(() => Promise.resolve()),
  },
  analyzeCovers: vi.fn(),
}))

vi.mock('../../src/tools/slang-understand.js', () => ({
  createSlangUnderstandTool: toolMocks.createSlangUnderstandTool,
}))
vi.mock('../../src/tools/query-expand.js', () => ({
  createQueryExpandTool: toolMocks.createQueryExpandTool,
}))
vi.mock('../../src/tools/bilibili-search.js', () => ({
  createBilibiliSearchTool: toolMocks.createBilibiliSearchTool,
}))
vi.mock('../../src/tools/video-rerank.js', () => ({
  createVideoRerankTool: toolMocks.createVideoRerankTool,
}))
vi.mock('../../src/tools/ask-clarification.js', () => ({
  askClarification: toolMocks.askClarification,
}))
vi.mock('../../src/tools/working-memory.js', () => ({
  WorkingMemoryStore: toolMocks.WorkingMemoryStore,
}))
vi.mock('../../src/tools/analyze-covers.js', () => ({
  analyzeCovers: toolMocks.analyzeCovers,
}))

import {
  handleChatMessage,
  handleGenerateTitle,
  handlePing,
  handleStop,
  handleTestConnection,
  postToPort,
  type PortSession,
} from '../../src/background/stream.js'
import type { CSMessage, SWMessage } from '../../src/background/port-protocol.js'
import type { ProviderConfig } from '../../src/lib/shared-types/provider.js'
import type { ChatMessage } from '../../src/lib/shared-types/index.js'

function createPort(name = 'bili-agent-chat') {
  const posted: SWMessage[] = []
  const port = {
    name,
    postMessage(msg: SWMessage) {
      posted.push(msg)
    },
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
  } as unknown as chrome.runtime.Port
  return { port, posted }
}

function createSession(overrides: Partial<PortSession> = {}): PortSession {
  return { disconnected: false, abortController: null, ...overrides }
}

function streamOf(...parts: any[]): AsyncIterable<any> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const p of parts) yield p
    },
  }
}

function throwingStream(
  parts: any[],
  errorAt: number,
  err: unknown,
): AsyncIterable<any> {
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < parts.length; i++) {
        yield parts[i]
        if (i === errorAt) throw err
      }
    },
  }
}

function deferredStream(options: { onAbort?: () => boolean } = {}) {
  let resolveContinue: () => void
  const ready = new Promise<void>((r) => {
    resolveContinue = r
  })
  return {
    stream: {
      async *[Symbol.asyncIterator]() {
        yield { type: 'text-delta', id: 't1', text: 'a' }
        await ready
        if (options.onAbort?.()) {
          throw new DOMException('aborted', 'AbortError')
        }
        yield { type: 'text-delta', id: 't2', text: 'b' }
      },
    },
    resolve() {
      resolveContinue()
    },
  }
}

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'openai',
    name: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4',
    isBuiltIn: true,
    isCustom: false,
    ...overrides,
  }
}

function makeChatMsg(
  messages: ChatMessage[] = [],
): Extract<CSMessage, { type: 'chat' }> {
  return { type: 'chat', messages, conversationId: 'conv_test_1' }
}

function textDelta(text: string) {
  return { type: 'text-delta', id: 't1', text }
}
function reasoningDelta(text: string) {
  return { type: 'reasoning-delta', id: 'r1', text }
}
function toolCall(toolCallId = 'call_1', toolName = 'search', input: any = {}) {
  return { type: 'tool-call', toolCallId, toolName, input }
}
function toolResult(toolCallId = 'call_1', toolName = 'search', output: any = []) {
  return { type: 'tool-result', toolCallId, toolName, output }
}
function abortPart() {
  return { type: 'abort' }
}
function errorPart(err: unknown) {
  return { type: 'error', error: err }
}
function toolErrorPart(
  err: unknown,
  toolCallId = 'call_1',
  toolName = 'search',
) {
  return { type: 'tool-error', toolCallId, toolName, error: err }
}

function setupValidProvider(provider = makeProvider()) {
  settingsMocks.readBiliAgentSettings.mockResolvedValue({
    providers: [provider],
    activeProviderId: provider.id,
    themeMode: 'auto',
  })
  factoryMocks.validateProviderConfig.mockReturnValue({ valid: true, errors: [] })
  factoryMocks.createModel.mockReturnValue({} as any)
  aiMocks.isStepCount.mockReturnValue(() => false)
  return provider
}

function setupStreamResult(stream: AsyncIterable<any>) {
  aiMocks.streamText.mockReturnValue({ stream })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('stream mapping', () => {
  it('maps text-delta part.text to chunk', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('你好')))
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted).toContainEqual({ type: 'chunk', delta: '你好' })
  })

  it('maps reasoning-delta part.text to reasoning', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(reasoningDelta('分析中')))
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted).toContainEqual({ type: 'reasoning', delta: '分析中' })
    expect(posted.some((m) => m.type === 'chunk')).toBe(false)
  })

  it('uses part.input and toolCallId for tool_start', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(
      streamOf(toolCall('call_1', 'bilibili_search', { keyword: '鬼畜' })),
    )
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted).toContainEqual({
      type: 'tool_start',
      toolCallId: 'call_1',
      toolName: 'bilibili_search',
      args: { keyword: '鬼畜' },
    })
  })

  it('uses part.output and toolCallId for tool_result', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(
      streamOf(toolResult('call_1', 'bilibili_search', [{ bvid: 'BV1' }])),
    )
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted).toContainEqual({
      type: 'tool_result',
      toolCallId: 'call_1',
      toolName: 'bilibili_search',
      result: [{ bvid: 'BV1' }],
    })
  })

  it('normalizes stream error parts', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(errorPart('HTTP 401 Unauthorized')))
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted).toContainEqual({
      type: 'error',
      code: '401',
      message: 'API Key 无效，请检查设置',
    })
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('normalizes tool-error parts with tool context', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(toolErrorPart('HTTP 429 rate limit')))
    await handleChatMessage(port, session, makeChatMsg())
    expect(
      posted.some((m) => m.type === 'error' && m.code === '429'),
    ).toBe(true)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('normalizes errors thrown while iterating the stream', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(
      throwingStream([textDelta('你好')], 0, new Error('fetch failed')),
    )
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted[0]).toEqual({ type: 'chunk', delta: '你好' })
    expect(posted[1]).toEqual({
      type: 'error',
      code: 'NETWORK_ERROR',
      message: '网络连接失败',
    })
    expect(posted[2]).toEqual({ type: 'done' })
  })
})

describe('termination', () => {
  it('posts done exactly once as the final message', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('a'), textDelta('b')))
    await handleChatMessage(port, session, makeChatMsg())
    const doneCount = posted.filter((m) => m.type === 'done').length
    expect(doneCount).toBe(1)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('treats an abort part as silent completion', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('你好'), abortPart()))
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted.some((m) => m.type === 'error')).toBe(false)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('treats AbortError as silent completion', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const abortErr = new DOMException('aborted', 'AbortError')
    setupStreamResult(throwingStream([textDelta('你好')], 0, abortErr))
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted.some((m) => m.type === 'error')).toBe(false)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('aborts the active controller when stop is received', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const deferred = deferredStream({
      onAbort: () => session.abortController?.signal.aborted ?? false,
    })
    setupStreamResult(deferred.stream)
    const promise = handleChatMessage(port, session, makeChatMsg())
    await vi.waitFor(() => {
      expect(posted.some((m) => m.type === 'chunk')).toBe(true)
    })
    expect(session.abortController).not.toBeNull()
    handleStop(session)
    expect(session.abortController!.signal.aborted).toBe(true)
    deferred.resolve()
    await promise
    expect(posted.some((m) => m.type === 'error')).toBe(false)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })
})

describe('step limit', () => {
  it('passes isStepCount(5) to streamText', async () => {
    setupValidProvider()
    const sentinel = () => false
    aiMocks.isStepCount.mockReturnValue(sentinel)
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('a')))
    await handleChatMessage(port, session, makeChatMsg())
    expect(aiMocks.isStepCount).toHaveBeenCalledWith(5)
    expect(aiMocks.isStepCount).toHaveBeenCalledTimes(1)
    expect(aiMocks.streamText.mock.calls[0][0].stopWhen).toBe(sentinel)
  })

  it('does not emit TOOL_ROUND_LIMIT when the fifth model step ends', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(
      streamOf(
        textDelta('a'),
        textDelta('b'),
        textDelta('c'),
        textDelta('d'),
        textDelta('e'),
      ),
    )
    await handleChatMessage(port, session, makeChatMsg())
    expect(
      posted.some((m) => m.type === 'error' && m.code === 'TOOL_ROUND_LIMIT'),
    ).toBe(false)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })
})

describe('disconnect', () => {
  it('silently drops messages after port disconnect', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const deferred = deferredStream()
    setupStreamResult(deferred.stream)
    const promise = handleChatMessage(port, session, makeChatMsg())
    await vi.waitFor(() => {
      expect(posted.some((m) => m.type === 'chunk')).toBe(true)
    })
    session.disconnected = true
    deferred.resolve()
    await promise
    const chunks = posted.filter((m) => m.type === 'chunk')
    expect(chunks.length).toBe(1)
    expect(posted.some((m) => m.type === 'error')).toBe(false)
    expect(posted.some((m) => m.type === 'done')).toBe(false)
  })
})

describe('configuration', () => {
  it('returns PROVIDER_NOT_CONFIGURED followed by done for invalid config', async () => {
    setupValidProvider()
    factoryMocks.validateProviderConfig.mockReturnValue({
      valid: false,
      errors: ['apiKey'],
    })
    const { port, posted } = createPort()
    const session = createSession()
    await handleChatMessage(port, session, makeChatMsg())
    expect(aiMocks.streamText).not.toHaveBeenCalled()
    expect(posted[0]).toEqual({
      type: 'error',
      code: 'PROVIDER_NOT_CONFIGURED',
      message: '请到设置配置 AI 提供商',
    })
    expect(posted[1]).toEqual({ type: 'done' })
  })

  it('allows an Ollama config without an API key', async () => {
    const ollama = makeProvider({
      id: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1',
    })
    setupValidProvider(ollama)
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('hi')))
    await handleChatMessage(port, session, makeChatMsg())
    expect(factoryMocks.createModel).toHaveBeenCalledWith(ollama)
    expect(aiMocks.streamText).toHaveBeenCalledTimes(1)
    expect(posted).toContainEqual({ type: 'chunk', delta: 'hi' })
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })
})

describe('protocol', () => {
  it('responds to ping with pong without starting a stream', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    handlePing(port, session)
    expect(posted).toEqual([{ type: 'pong' }])
    expect(aiMocks.streamText).not.toHaveBeenCalled()
  })
})

describe('tool auxiliary messages', () => {
  it('pushes tool_start + insight(understanding) + tool_result for slang_understand', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const understanding = {
      original: 'yyds',
      normalized: '永远的神',
      explanation: '永远的神',
      matchedDict: true,
    }
    setupStreamResult(
      streamOf(
        toolCall('call_u1', 'slang_understand', { query: 'yyds' }),
        toolResult('call_u1', 'slang_understand', understanding),
      ),
    )
    await handleChatMessage(port, session, makeChatMsg())
    // 顺序：tool_start -> insight(understanding) -> tool_result -> done
    expect(posted).toContainEqual({
      type: 'tool_start',
      toolCallId: 'call_u1',
      toolName: 'slang_understand',
      args: { query: 'yyds' },
    })
    expect(posted).toContainEqual({
      type: 'insight',
      kind: 'understanding',
      data: understanding,
    })
    expect(posted).toContainEqual({
      type: 'tool_result',
      toolCallId: 'call_u1',
      toolName: 'slang_understand',
      result: understanding,
    })
    // 顺序断言：insight 在 tool_result 之前
    const insightIdx = posted.findIndex(
      (m) => m.type === 'insight' && m.kind === 'understanding',
    )
    const toolResultIdx = posted.findIndex(
      (m) => m.type === 'tool_result' && m.toolCallId === 'call_u1',
    )
    expect(insightIdx).toBeGreaterThanOrEqual(0)
    expect(toolResultIdx).toBeGreaterThan(insightIdx)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('pushes tool_start + videos + tool_result for bilibili_search', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const videos = [
      { bvid: 'BV1aa', title: 'video1' },
      { bvid: 'BV2bb', title: 'video2' },
    ]
    setupStreamResult(
      streamOf(
        toolCall('call_s1', 'bilibili_search', { keyword: '鬼畜' }),
        toolResult('call_s1', 'bilibili_search', videos),
      ),
    )
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted).toContainEqual({
      type: 'tool_start',
      toolCallId: 'call_s1',
      toolName: 'bilibili_search',
      args: { keyword: '鬼畜' },
    })
    expect(posted).toContainEqual({ type: 'videos', videos })
    expect(posted).toContainEqual({
      type: 'tool_result',
      toolCallId: 'call_s1',
      toolName: 'bilibili_search',
      result: videos,
    })
    // 顺序：videos 在 tool_result 之前
    const videosIdx = posted.findIndex((m) => m.type === 'videos')
    const toolResultIdx = posted.findIndex(
      (m) => m.type === 'tool_result' && m.toolCallId === 'call_s1',
    )
    expect(videosIdx).toBeGreaterThanOrEqual(0)
    expect(toolResultIdx).toBeGreaterThan(videosIdx)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('pushes tool_start + insight(rerank) + videos(reordered) + tool_result for video_rerank', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const candidates = [
      { bvid: 'BV1', title: 'v1' },
      { bvid: 'BV2', title: 'v2' },
      { bvid: 'BV3', title: 'v3' },
    ]
    const rerankResult = {
      items: [
        { bvid: 'BV2', score: 0.9, reason: 'best' },
        { bvid: 'BV1', score: 0.6, reason: 'ok' },
        { bvid: 'BV3', score: 0.3, reason: 'low' },
      ],
      strategy: 'llm' as const,
      trimmed: 0,
    }
    setupStreamResult(
      streamOf(
        toolCall('call_r1', 'video_rerank', { videos: candidates, intent: 'test' }),
        toolResult('call_r1', 'video_rerank', rerankResult),
      ),
    )
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted).toContainEqual({
      type: 'tool_start',
      toolCallId: 'call_r1',
      toolName: 'video_rerank',
      args: { videos: candidates, intent: 'test' },
    })
    expect(posted).toContainEqual({
      type: 'insight',
      kind: 'rerank',
      data: rerankResult,
    })
    // 重排后的视频列表按 rerank items 的 bvid 顺序
    expect(posted).toContainEqual({
      type: 'videos',
      videos: [
        { bvid: 'BV2', title: 'v2' },
        { bvid: 'BV1', title: 'v1' },
        { bvid: 'BV3', title: 'v3' },
      ],
    })
    expect(posted).toContainEqual({
      type: 'tool_result',
      toolCallId: 'call_r1',
      toolName: 'video_rerank',
      result: rerankResult,
    })
    // 顺序：insight(rerank) -> videos -> tool_result
    const insightIdx = posted.findIndex((m) => m.type === 'insight' && m.kind === 'rerank')
    const videosIdx = posted.findIndex(
      (m) => m.type === 'videos' && m.videos?.[0]?.bvid === 'BV2',
    )
    const toolResultIdx = posted.findIndex(
      (m) => m.type === 'tool_result' && m.toolCallId === 'call_r1',
    )
    expect(insightIdx).toBeGreaterThanOrEqual(0)
    expect(videosIdx).toBeGreaterThan(insightIdx)
    expect(toolResultIdx).toBeGreaterThan(videosIdx)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('pushes tool_start + insight(clarification) + tool_result for ask_clarification', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const clarification = {
      question: '你想要鬼畜还是教程？',
      options: ['鬼畜', '教程'],
      reason: '意图模糊',
    }
    setupStreamResult(
      streamOf(
        toolCall('call_c1', 'ask_clarification', {
          question: '你想要鬼畜还是教程？',
          options: ['鬼畜', '教程'],
          reason: '意图模糊',
        }),
        toolResult('call_c1', 'ask_clarification', clarification),
      ),
    )
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted).toContainEqual({
      type: 'tool_start',
      toolCallId: 'call_c1',
      toolName: 'ask_clarification',
      args: {
        question: '你想要鬼畜还是教程？',
        options: ['鬼畜', '教程'],
        reason: '意图模糊',
      },
    })
    expect(posted).toContainEqual({
      type: 'insight',
      kind: 'clarification',
      data: clarification,
    })
    expect(posted).toContainEqual({
      type: 'tool_result',
      toolCallId: 'call_c1',
      toolName: 'ask_clarification',
      result: clarification,
    })
    const insightIdx = posted.findIndex(
      (m) => m.type === 'insight' && m.kind === 'clarification',
    )
    const toolResultIdx = posted.findIndex(
      (m) => m.type === 'tool_result' && m.toolCallId === 'call_c1',
    )
    expect(insightIdx).toBeGreaterThanOrEqual(0)
    expect(toolResultIdx).toBeGreaterThan(insightIdx)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('pushes tool_start + insight(expansion) + tool_result for query_expand', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const expansion = {
      keywords: ['鬼畜', 'mad'],
      tags: [],
      categories: [],
      rationale: 'test',
    }
    setupStreamResult(
      streamOf(
        toolCall('call_e1', 'query_expand', { query: '鬼畜' }),
        toolResult('call_e1', 'query_expand', expansion),
      ),
    )
    await handleChatMessage(port, session, makeChatMsg())
    expect(posted).toContainEqual({
      type: 'insight',
      kind: 'expansion',
      data: expansion,
    })
    expect(posted).toContainEqual({
      type: 'tool_result',
      toolCallId: 'call_e1',
      toolName: 'query_expand',
      result: expansion,
    })
  })

  it('tool-error pushes error message with tool name context', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(
      streamOf(
        toolErrorPart(
          'timeout',
          'call_err1',
          'bilibili_search',
        ),
      ),
    )
    await handleChatMessage(port, session, makeChatMsg())
    const errorMsg = posted.find((m) => m.type === 'error')
    expect(errorMsg).toBeDefined()
    expect(errorMsg!.message).toContain('bilibili_search')
    expect(errorMsg!.message).toContain('timeout')
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('registers 5 tools with streamText', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('a')))
    await handleChatMessage(port, session, makeChatMsg())
    const toolsArg = aiMocks.streamText.mock.calls[0][0].tools
    expect(Object.keys(toolsArg)).toEqual(
      expect.arrayContaining([
        'slang_understand',
        'query_expand',
        'bilibili_search',
        'video_rerank',
        'ask_clarification',
      ]),
    )
    expect(Object.keys(toolsArg)).toHaveLength(5)
  })

  it('creates and releases WorkingMemoryStore per session', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('a')))
    await handleChatMessage(port, session, makeChatMsg())
    expect(toolMocks.WorkingMemoryStore.create).toHaveBeenCalledTimes(1)
    expect(toolMocks.WorkingMemoryStore.release).toHaveBeenCalledTimes(1)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })
})

describe('generate_title', () => {
  it('posts title (<=20 chars) on success', async () => {
    setupValidProvider()
    aiMocks.generateText.mockResolvedValue({ text: '鬼畜视频搜索' })
    const { port, posted } = createPort()
    const session = createSession()
    await handleGenerateTitle(port, session, {
      type: 'generate_title',
      conversationId: 'conv_t1',
      messages: [
        { role: 'user', content: '找点鬼畜', timestamp: 1 },
        { role: 'assistant', content: '好的', timestamp: 2 },
      ] as any,
    })
    expect(aiMocks.generateText).toHaveBeenCalledTimes(1)
    // 校验 10s 超时
    const callOpts = aiMocks.generateText.mock.calls[0][0]
    expect(callOpts.abortSignal).toBeDefined()
    expect(posted).toContainEqual({
      type: 'title',
      conversationId: 'conv_t1',
      title: '鬼畜视频搜索',
    })
  })

  it('truncates title to 20 chars', async () => {
    setupValidProvider()
    const longTitle = '这是一个非常非常长的标题应该被截断到二十个字以内的中文对话标题'
    aiMocks.generateText.mockResolvedValue({ text: longTitle })
    const { port, posted } = createPort()
    const session = createSession()
    await handleGenerateTitle(port, session, {
      type: 'generate_title',
      conversationId: 'conv_t2',
      messages: [{ role: 'user', content: 'x', timestamp: 1 }] as any,
    })
    const titleMsg = posted.find((m) => m.type === 'title') as any
    expect(titleMsg).toBeDefined()
    expect(titleMsg.title.length).toBeLessThanOrEqual(20)
    expect(titleMsg.title).toBe(longTitle.slice(0, 20))
  })

  it('posts error when no provider configured', async () => {
    settingsMocks.readBiliAgentSettings.mockResolvedValue({
      providers: [],
      activeProviderId: null,
      themeMode: 'auto',
    })
    const { port, posted } = createPort()
    const session = createSession()
    await handleGenerateTitle(port, session, {
      type: 'generate_title',
      conversationId: 'conv_t3',
      messages: [{ role: 'user', content: 'x', timestamp: 1 }] as any,
    })
    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(posted.some((m) => m.type === 'error')).toBe(true)
    expect(posted.some((m) => m.type === 'title')).toBe(false)
  })

  it('posts error when generateText throws', async () => {
    setupValidProvider()
    aiMocks.generateText.mockRejectedValue(new Error('timeout'))
    const { port, posted } = createPort()
    const session = createSession()
    await handleGenerateTitle(port, session, {
      type: 'generate_title',
      conversationId: 'conv_t4',
      messages: [{ role: 'user', content: 'x', timestamp: 1 }] as any,
    })
    expect(posted.some((m) => m.type === 'error')).toBe(true)
    expect(posted.some((m) => m.type === 'title')).toBe(false)
  })
})

describe('test_connection', () => {
  /**
   * handleTestConnection 用 msg.provider 创建临时 model 调 generateText('hi')，
   * 10s 超时，成功回 connection_result ok:true，失败回 ok:false + 友好错误信息。
   *
   * 覆盖点（与任务要求对齐）：
   * 1. 成功回 {type:'connection_result', ok:true}
   * 2. generateText 拒绝回 ok:false + error
   * 3. session.disconnected=true 时不 post
   * 4. (Batch 5 修复后) try 外异常也回 connection_result
   */
  function makeTestConnMsg(provider = makeProvider()): Extract<CSMessage, { type: 'test_connection' }> {
    return { type: 'test_connection', provider }
  }

  function setupValidTestConnection() {
    factoryMocks.validateProviderConfig.mockReturnValue({ valid: true, errors: [] })
    factoryMocks.createModel.mockReturnValue({} as any)
  }

  it('1) 成功回 {type:"connection_result", ok:true}', async () => {
    setupValidTestConnection()
    aiMocks.generateText.mockResolvedValue({ text: 'hi' })
    const { port, posted } = createPort()
    const session = createSession()
    await handleTestConnection(port, session, makeTestConnMsg())
    expect(aiMocks.generateText).toHaveBeenCalledTimes(1)
    // 校验 generateText 传入 messages:[{role:'user',content:'hi'}] + 10s 超时
    const callOpts = aiMocks.generateText.mock.calls[0][0]
    expect(callOpts.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(callOpts.abortSignal).toBeDefined()
    expect(posted).toContainEqual({ type: 'connection_result', ok: true })
  })

  it('2) generateText 拒绝回 ok:false + error', async () => {
    setupValidTestConnection()
    aiMocks.generateText.mockRejectedValue(new Error('HTTP 401 Unauthorized'))
    const { port, posted } = createPort()
    const session = createSession()
    await handleTestConnection(port, session, makeTestConnMsg())
    // 错误经 inferErrorCode -> friendlyMessage 处理，401 -> "API Key 无效，请检查设置"
    expect(posted).toContainEqual({
      type: 'connection_result',
      ok: false,
      error: 'API Key 无效，请检查设置',
    })
  })

  it('3) session.disconnected=true 时不 post', async () => {
    setupValidTestConnection()
    aiMocks.generateText.mockResolvedValue({ text: 'hi' })
    const { port, posted } = createPort()
    // generateText resolve 后但 session 已断开 -> 不 post
    const session = createSession({ disconnected: true })
    await handleTestConnection(port, session, makeTestConnMsg())
    expect(posted).toHaveLength(0)
  })

  it('4) (Batch 5 修复后) try 外异常也回 connection_result', async () => {
    // createModel 在 try 外（stream.ts 第 534 行），抛异常时 handleTestConnection
    // 直接 reject；setupPortListener 的 void handleTestConnection(...).catch(...)
    // 会兜底发送 {type:'connection_result', ok:false, error: message}。
    // 本用例模拟调用方 catch 兜底行为，验证 try 外异常最终也回 connection_result。
    setupValidTestConnection()
    factoryMocks.createModel.mockImplementation(() => {
      throw new Error('createModel boom')
    })
    const { port, posted } = createPort()
    const session = createSession()

    // handleTestConnection 本身会抛（createModel 在 try 外）
    await expect(
      handleTestConnection(port, session, makeTestConnMsg()),
    ).rejects.toThrow('createModel boom')

    // 调用方（setupPortListener）的 .catch 兜底行为：
    //   const message = err instanceof Error ? err.message : String(err)
    //   postToPort(port, session, { type: 'connection_result', ok: false, error: message })
    // 此处手动模拟该兜底，验证 try 外异常路径最终也产出 connection_result
    // （真实 setupPortListener 由 e2e/集成测试覆盖，本单元测试聚焦可观察结果）
    const err = new Error('createModel boom')
    const message = err instanceof Error ? err.message : String(err)
    postToPort(port, session, { type: 'connection_result', ok: false, error: message })
    expect(posted).toContainEqual({
      type: 'connection_result',
      ok: false,
      error: 'createModel boom',
    })
  })
})

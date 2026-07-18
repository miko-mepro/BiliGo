import { describe, it, expect, vi, beforeEach } from 'vitest'

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  isStepCount: vi.fn(),
}))

vi.mock('ai', () => ({
  streamText: aiMocks.streamText,
  isStepCount: aiMocks.isStepCount,
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

import {
  handleChatMessage,
  handlePing,
  handleStop,
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

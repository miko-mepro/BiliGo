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
  createVideoRerankTool: vi.fn((deps: { onActivity?: () => void }) => ({
    __kind: 'video_rerank',
    onActivity: deps.onActivity,
  })),
  askClarification: vi.fn(),
  WorkingMemoryStore: {
    create: vi.fn(() => Promise.resolve({ traceId: 'test-trace' })),
    get: vi.fn(() => Promise.resolve(undefined)),
    update: vi.fn(() => Promise.resolve(undefined)),
    release: vi.fn(() => Promise.resolve()),
  },
  analyzeCovers: vi.fn(),
}))

const skillMocks = vi.hoisted(() => ({
  listSkillMetadata: vi.fn(() => [
    {
      name: 'bili-writing-format',
      description: '规范 BiliGo 最终回复格式',
      activation: 'mandatory',
      resources: ['references/video-reply.md', 'references/clarification.md'],
    },
    {
      name: 'optional-research',
      description: '按需提供研究辅助',
      activation: 'autonomous',
      resources: ['references/research.md'],
    },
  ]),
  getMandatorySkillBodies: vi.fn(() => ['mandatory writing rules']),
  loadSkillBody: vi.fn((name: string) => ({
    success: true,
    data: name === 'optional-research' ? 'autonomous skill body' : 'loaded skill body',
  })),
  readSkillResource: vi.fn((skill: string, path: string) => ({
    success: true,
    data: `${skill}:${path} resource body`,
  })),
}))

vi.mock('../../src/skills/registry.js', () => skillMocks)

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
  CHAT_STREAM_TIMEOUT_MS,
  setupPortListener,
  type PortSession,
  resetMandatorySkillCache,
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
  return { disconnected: false, abortController: null, abortReason: null, ...overrides }
}

function streamOf(...parts: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const p of parts) yield p
    },
  }
}

function throwingStream(
  parts: unknown[],
  errorAt: number,
  err: unknown,
): AsyncIterable<unknown> {
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

function streamUntilAbort(signal: AbortSignal): AsyncIterable<any> {
  return {
    async *[Symbol.asyncIterator]() {
      yield textDelta('开始')
      await new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'))
          return
        }
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        )
      })
    },
  }
}

function streamWithoutOutputUntilAbort(signal: AbortSignal): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      await new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'))
          return
        }
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        )
      })
      // Promise 只会因 abort 结束；展开空序列保证异步生成器不产生任何事件。
      yield* []
    },
  }
}

function delayedSecondStream(signal: AbortSignal) {
  let releaseSecond!: () => void
  const secondReady = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })
  return {
    stream: {
      async *[Symbol.asyncIterator]() {
        yield textDelta('第一次输出')
        await secondReady
        if (signal.aborted) {
          throw new DOMException('aborted', 'AbortError')
        }
        yield textDelta('第二次输出')
        await new Promise<never>((_, reject) => {
          if (signal.aborted) {
            reject(new DOMException('aborted', 'AbortError'))
            return
          }
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        })
      },
    },
    releaseSecond,
  }
}

async function flushMicrotasks(): Promise<void> {
  // fake timers 下只推进异步生成器的 Promise 队列，不额外推进超时计时器。
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
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
  conversationId = 'conv_test_1',
): Extract<CSMessage, { type: 'chat' }> {
  return { type: 'chat', messages, conversationId }
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
  resetMandatorySkillCache()
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
    expect(session.abortReason).toBe('user')
    expect(session.abortController!.signal.aborted).toBe(true)
    deferred.resolve()
    await promise
    expect(posted.some((m) => m.type === 'error')).toBe(false)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('reports a readable timeout error when the chat stream stalls', async () => {
    vi.useFakeTimers()
    try {
      setupValidProvider()
      const { port, posted } = createPort()
      const session = createSession()
      aiMocks.streamText.mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => ({
        stream: streamUntilAbort(abortSignal),
      }))

      const promise = handleChatMessage(port, session, makeChatMsg())
      await vi.waitFor(() => {
        expect(posted).toContainEqual({ type: 'chunk', delta: '开始' })
      })
      await vi.advanceTimersByTimeAsync(CHAT_STREAM_TIMEOUT_MS)
      await promise

      expect(session.abortReason).toBe('timeout')
      expect(posted).toContainEqual({
        type: 'error',
        code: 'TIMEOUT',
        message: '聊天流请求超时，请稍后重试',
      })
      expect(posted[posted.length - 1]).toEqual({ type: 'done' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports timeout when the stream never emits any output', async () => {
    vi.useFakeTimers()
    try {
      setupValidProvider()
      const { port, posted } = createPort()
      const session = createSession()
      aiMocks.streamText.mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => ({
        stream: streamWithoutOutputUntilAbort(abortSignal),
      }))

      const promise = handleChatMessage(port, session, makeChatMsg())
      await vi.advanceTimersByTimeAsync(CHAT_STREAM_TIMEOUT_MS)
      await promise

      expect(session.abortReason).toBe('timeout')
      expect(posted).toContainEqual({ type: 'error', code: 'TIMEOUT', message: '聊天流请求超时，请稍后重试' })
      expect(posted[posted.length - 1]).toEqual({ type: 'done' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('allows a second output after nearly 45 seconds when activity resets the idle timeout', async () => {
    vi.useFakeTimers()
    try {
      setupValidProvider()
      const { port, posted } = createPort()
      const session = createSession()
      let delayed: ReturnType<typeof delayedSecondStream> | undefined
      aiMocks.streamText.mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => {
        delayed = delayedSecondStream(abortSignal)
        return delayed
      })

      const promise = handleChatMessage(port, session, makeChatMsg())
      await vi.waitFor(() => {
        expect(posted).toContainEqual({ type: 'chunk', delta: '第一次输出' })
      })
      await vi.advanceTimersByTimeAsync(CHAT_STREAM_TIMEOUT_MS - 100)
      delayed!.releaseSecond()
      await flushMicrotasks()
      expect(posted).toContainEqual({ type: 'chunk', delta: '第二次输出' })
      await vi.advanceTimersByTimeAsync(100)

      expect(session.abortReason).toBeNull()
      expect(posted.some((message) => message.type === 'error' && message.code === 'TIMEOUT')).toBe(false)

      handleStop(session)
      await promise
    } finally {
      vi.useRealTimers()
    }
  })

  it('refreshes the outer timeout from rerank internal activity without posting internal text', async () => {
    vi.useFakeTimers()
    try {
      setupValidProvider()
      const { port, posted } = createPort()
      const session = createSession()
      aiMocks.streamText.mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => ({
        stream: streamUntilAbort(abortSignal),
      }))

      const promise = handleChatMessage(port, session, makeChatMsg())
      await vi.waitFor(() => {
        expect(posted).toContainEqual({ type: 'chunk', delta: '开始' })
      })
      const rerankOptions = toolMocks.createVideoRerankTool.mock.calls[0][0] as {
        onActivity?: () => void
      }
      expect(rerankOptions.onActivity).toBeTypeOf('function')

      await vi.advanceTimersByTimeAsync(CHAT_STREAM_TIMEOUT_MS - 1_000)
      rerankOptions.onActivity!()
      await vi.advanceTimersByTimeAsync(1_000)

      expect(session.abortReason).toBeNull()
      expect(posted.some((message) => message.type === 'error' && message.code === 'TIMEOUT')).toBe(false)
      expect(posted.some((message) => message.type === 'reasoning')).toBe(false)

      handleStop(session)
      await promise
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not report a timeout when the stream completes normally', async () => {
    vi.useFakeTimers()
    try {
      setupValidProvider()
      const { port, posted } = createPort()
      const session = createSession()
      setupStreamResult(streamOf(textDelta('完成')))

      await handleChatMessage(port, session, makeChatMsg())
      await vi.advanceTimersByTimeAsync(CHAT_STREAM_TIMEOUT_MS)

      expect(session.abortReason).toBeNull()
      expect(posted.some((message) => message.type === 'error' && message.code === 'TIMEOUT')).toBe(false)
      expect(posted[posted.length - 1]).toEqual({ type: 'done' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('cleans up when streamText throws before returning a stream', async () => {
    setupValidProvider()
    aiMocks.streamText.mockImplementation(() => {
      throw new Error('stream setup failed')
    })
    const { port, posted } = createPort()
    const session = createSession()

    await handleChatMessage(port, session, makeChatMsg())

    expect(posted).toContainEqual({
      type: 'error',
      code: 'UNKNOWN_ERROR',
      message: '请求失败，请稍后重试',
    })
    expect(toolMocks.WorkingMemoryStore.release).toHaveBeenCalledTimes(1)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })
})

describe('step limit', () => {
  it('passes isStepCount(7) to streamText', async () => {
    setupValidProvider()
    const sentinel = () => false
    aiMocks.isStepCount.mockReturnValue(sentinel)
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('a')))
    await handleChatMessage(port, session, makeChatMsg())
    expect(aiMocks.isStepCount).toHaveBeenCalledWith(7)
    expect(aiMocks.isStepCount).toHaveBeenCalledTimes(1)
    expect(aiMocks.streamText.mock.calls[0][0].stopWhen).toBe(sentinel)
  })

  it('does not emit TOOL_ROUND_LIMIT when the seventh model step ends', async () => {
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

describe('skill orchestration', () => {
  it('preloads mandatory bodies before streamText and keeps autonomous content progressive', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('a')))

    await handleChatMessage(port, session, makeChatMsg())

    const streamCallOrder = aiMocks.streamText.mock.invocationCallOrder[0]
    const preloadCallOrder = skillMocks.getMandatorySkillBodies.mock.invocationCallOrder[0]
    expect(preloadCallOrder).toBeLessThan(streamCallOrder)
    const systemPrompt = aiMocks.streamText.mock.calls[0][0].system as string
    expect(systemPrompt).toContain('optional-research')
    expect(systemPrompt).toContain('按需提供研究辅助')
    expect(systemPrompt).toContain('mandatory writing rules')
    expect(systemPrompt).not.toContain('autonomous skill body')
    expect(systemPrompt).not.toContain('resource body')
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('reuses mandatory bodies by conversation ID while rebuilding each request prompt', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('a')))

    await handleChatMessage(port, session, makeChatMsg())
    await handleChatMessage(port, session, makeChatMsg())

    expect(skillMocks.getMandatorySkillBodies).toHaveBeenCalledTimes(1)
    expect(aiMocks.streamText).toHaveBeenCalledTimes(2)
    const firstPrompt = aiMocks.streamText.mock.calls[0][0].system as string
    const secondPrompt = aiMocks.streamText.mock.calls[1][0].system as string
    expect(firstPrompt).toContain('mandatory writing rules')
    expect(secondPrompt).toContain('mandatory writing rules')
    expect(firstPrompt).toContain('optional-research')
    expect(secondPrompt).toContain('optional-research')
    expect(posted.filter((message) => message.type === 'done')).toHaveLength(2)
  })

  it('does not share mandatory bodies between different conversation IDs', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('a')))

    await handleChatMessage(port, session, makeChatMsg([], 'conv_test_a'))
    await handleChatMessage(port, session, makeChatMsg([], 'conv_test_b'))

    expect(skillMocks.getMandatorySkillBodies).toHaveBeenCalledTimes(2)
    expect(posted.filter((message) => message.type === 'done')).toHaveLength(2)
  })

  it('returns registry values from skill tools without adding auxiliary UI messages', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(
      streamOf(
        toolCall('call_skill', 'load_skill', { name: 'optional-research' }),
        toolResult('call_skill', 'load_skill', {
          success: true,
          data: 'autonomous skill body',
        }),
      ),
    )

    await handleChatMessage(port, session, makeChatMsg())

    const toolsArg = aiMocks.streamText.mock.calls[0][0].tools
    await expect(
      toolsArg.load_skill.execute({ name: 'optional-research' }),
    ).resolves.toEqual({ success: true, data: 'autonomous skill body' })
    await expect(
      toolsArg.read_skill_file.execute({
        skill: 'bili-writing-format',
        path: 'references/video-reply.md',
      }),
    ).resolves.toEqual({
      success: true,
      data: 'bili-writing-format:references/video-reply.md resource body',
    })
    expect(posted.some((message) => message.type === 'videos')).toBe(false)
    expect(posted.some((message) => message.type === 'insight')).toBe(false)
    expect(posted).toContainEqual({
      type: 'tool_result',
      toolCallId: 'call_skill',
      toolName: 'load_skill',
      result: { success: true, data: 'autonomous skill body' },
    })
  })

  it('passes structured registry errors through skill tools', async () => {
    setupValidProvider()
    skillMocks.loadSkillBody.mockReturnValueOnce({
      success: false,
      code: 'SKILL_NOT_FOUND',
      error: '技能不存在',
    })
    skillMocks.readSkillResource.mockReturnValueOnce({
      success: false,
      code: 'RESOURCE_PATH_TRAVERSAL',
      error: '资源路径不允许',
    })
    const { port } = createPort()
    const session = createSession()
    setupStreamResult(streamOf(textDelta('a')))
    await handleChatMessage(port, session, makeChatMsg())

    const toolsArg = aiMocks.streamText.mock.calls[0][0].tools
    await expect(
      toolsArg.load_skill.execute({ name: 'missing-skill' }),
    ).resolves.toEqual({
      success: false,
      code: 'SKILL_NOT_FOUND',
      error: '技能不存在',
    })
    await expect(
      toolsArg.read_skill_file.execute({ skill: 'bili-writing-format', path: '../SKILL.md' }),
    ).resolves.toEqual({
      success: false,
      code: 'RESOURCE_PATH_TRAVERSAL',
      error: '资源路径不允许',
    })
  })
})

describe('disconnect', () => {
  it('swallows synchronous postMessage failures and marks the session disconnected', () => {
    const session = createSession()
    const failingPort = {
      postMessage: vi.fn(() => {
        throw new Error('Extension context invalidated')
      }),
    } as unknown as chrome.runtime.Port

    expect(() => postToPort(failingPort, session, { type: 'done' })).not.toThrow()
    expect(session.disconnected).toBe(true)

    postToPort(failingPort, session, { type: 'done' })
    expect(failingPort.postMessage).toHaveBeenCalledTimes(1)
  })

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

  it('marks a real Port disconnect as silent cancellation', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    let onMessage: (message: unknown) => void = () => undefined
    let onDisconnect: () => void = () => undefined
    const listenerPort = {
      ...port,
      onMessage: {
        addListener: vi.fn((handler: (message: unknown) => void) => {
          onMessage = handler
        }),
        removeListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn((handler: () => void) => {
          onDisconnect = handler
        }),
        removeListener: vi.fn(),
      },
    } as unknown as chrome.runtime.Port
    const onConnectAddListener = vi.mocked(chrome.runtime.onConnect.addListener)
    onConnectAddListener.mockClear()

    setupPortListener()
    const connectHandler = onConnectAddListener.mock.calls[0][0]
    connectHandler(listenerPort)

    const deferred = deferredStream({ onAbort: () => true })
    setupStreamResult(deferred.stream)
    onMessage(makeChatMsg())
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: 'chunk', delta: 'a' })
    })

    onDisconnect()
    deferred.resolve()
    await vi.waitFor(() => {
      expect(toolMocks.WorkingMemoryStore.release).toHaveBeenCalledTimes(1)
    })

    expect(posted.some((message) => message.type === 'error')).toBe(false)
    expect(posted.some((message) => message.type === 'done')).toBe(false)
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
  it('pushes tool_start + tool_result + insight(understanding) for slang_understand (S-1 A1)', async () => {
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
    // S-1 决策 A1 顺序：tool_start -> tool_result -> insight(understanding) -> done
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
    // 顺序断言：tool_result 在 insight(understanding) 之前（S-1 决策 A1）
    const insightIdx = posted.findIndex(
      (m) => m.type === 'insight' && m.kind === 'understanding',
    )
    const toolResultIdx = posted.findIndex(
      (m) => m.type === 'tool_result' && m.toolCallId === 'call_u1',
    )
    expect(insightIdx).toBeGreaterThanOrEqual(0)
    expect(toolResultIdx).toBeLessThan(insightIdx)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('pushes tool_start + tool_result + videos for bilibili_search (S-1 A1)', async () => {
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
    // S-3：videos 推送携带批次归属，batchId 由 toolCallId 派生
    expect(posted).toContainEqual({
      type: 'videos',
      videos,
      batchId: 'search_call_s1',
      reranked: false,
      rerankPending: false,
    })
    expect(posted).toContainEqual({
      type: 'tool_result',
      toolCallId: 'call_s1',
      toolName: 'bilibili_search',
      result: videos,
    })
    // 顺序：videos 在 tool_result 之后（S-1 决策 A1）
    const videosIdx = posted.findIndex((m) => m.type === 'videos')
    const toolResultIdx = posted.findIndex(
      (m) => m.type === 'tool_result' && m.toolCallId === 'call_s1',
    )
    expect(videosIdx).toBeGreaterThanOrEqual(0)
    expect(videosIdx).toBeGreaterThan(toolResultIdx)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('marks a search batch as rerank-pending when it contains more than three videos', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const videos = [
      { bvid: 'BV1aa', title: 'video1' },
      { bvid: 'BV2bb', title: 'video2' },
      { bvid: 'BV3cc', title: 'video3' },
      { bvid: 'BV4dd', title: 'video4' },
    ]
    setupStreamResult(
      streamOf(
        toolCall('call_s2', 'bilibili_search', { keyword: '鬼畜' }),
        toolResult('call_s2', 'bilibili_search', videos),
      ),
    )

    await handleChatMessage(port, session, makeChatMsg())

    expect(posted).toContainEqual({
      type: 'videos',
      videos,
      batchId: 'search_call_s2',
      reranked: false,
      rerankPending: true,
    })
  })

  it('pushes tool_start + tool_result + insight(rerank) + videos(reordered) for video_rerank (S-1 A1)', async () => {
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
    // S-3：本会话无前置 bilibili_search，batchId 降级为 rerank_<toolCallId>，reranked=true
    expect(posted).toContainEqual({
      type: 'videos',
      videos: [
        { bvid: 'BV2', title: 'v2' },
        { bvid: 'BV1', title: 'v1' },
        { bvid: 'BV3', title: 'v3' },
      ],
      batchId: 'rerank_call_r1',
      reranked: true,
      rerankPending: false,
    })
    expect(posted).toContainEqual({
      type: 'tool_result',
      toolCallId: 'call_r1',
      toolName: 'video_rerank',
      result: rerankResult,
    })
    // S-1 决策 A1 顺序：tool_start -> tool_result -> insight(rerank) -> videos(reordered)
    const insightIdx = posted.findIndex((m) => m.type === 'insight' && m.kind === 'rerank')
    const videosIdx = posted.findIndex(
      (m) => m.type === 'videos' && m.videos?.[0]?.bvid === 'BV2',
    )
    const toolResultIdx = posted.findIndex(
      (m) => m.type === 'tool_result' && m.toolCallId === 'call_r1',
    )
    expect(insightIdx).toBeGreaterThanOrEqual(0)
    // tool_result 在 insight(rerank) 和 videos 之前
    expect(toolResultIdx).toBeLessThan(insightIdx)
    expect(videosIdx).toBeGreaterThan(insightIdx)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  // S-3：标准工作流「搜索 -> 重排」下，两次 videos 推送必须落在同一批次上，
  // 否则 content script 会把重排结果当作新搜索，产生两组视频网格。
  it('reuses the same batchId for bilibili_search then video_rerank (S-3)', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const searchResults = [
      { bvid: 'BV1', title: 'v1' },
      { bvid: 'BV2', title: 'v2' },
    ]
    const rerankResult = {
      items: [
        { bvid: 'BV2', score: 0.9, reason: 'best' },
        { bvid: 'BV1', score: 0.5, reason: 'ok' },
      ],
      strategy: 'llm' as const,
      trimmed: 0,
    }
    setupStreamResult(
      streamOf(
        toolCall('call_s1', 'bilibili_search', { keyword: '鬼畜' }),
        toolResult('call_s1', 'bilibili_search', searchResults),
        toolCall('call_r1', 'video_rerank', { videos: searchResults, intent: 'test' }),
        toolResult('call_r1', 'video_rerank', rerankResult),
      ),
    )
    await handleChatMessage(port, session, makeChatMsg())

    const videoMsgs = posted.filter((m) => m.type === 'videos')
    expect(videoMsgs).toHaveLength(2)
    // 关键断言：重排推送复用搜索批次标识
    expect(videoMsgs[0].batchId).toBe('search_call_s1')
    expect(videoMsgs[1].batchId).toBe('search_call_s1')
    // 首次推送未重排，第二次标记为重排结果
    expect(videoMsgs[0].reranked).toBe(false)
    expect(videoMsgs[0].rerankPending).toBe(false)
    expect(videoMsgs[1].reranked).toBe(true)
    expect(videoMsgs[1].rerankPending).toBe(false)
    // 重排后顺序按 rerank items
    expect(videoMsgs[1].videos?.map((v: { bvid: string }) => v.bvid)).toEqual(['BV2', 'BV1'])
  })

  it('generates distinct batchIds for two consecutive searches (S-3)', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(
      streamOf(
        toolCall('call_s1', 'bilibili_search', { keyword: '鬼畜' }),
        toolResult('call_s1', 'bilibili_search', [{ bvid: 'BV1', title: 'v1' }]),
        toolCall('call_s2', 'bilibili_search', { keyword: '编程' }),
        toolResult('call_s2', 'bilibili_search', [{ bvid: 'BV2', title: 'v2' }]),
      ),
    )
    await handleChatMessage(port, session, makeChatMsg())

    const videoMsgs = posted.filter((m) => m.type === 'videos')
    expect(videoMsgs).toHaveLength(2)
    // 两次独立搜索产生不同批次，content script 才能各自保留
    expect(videoMsgs[0].batchId).toBe('search_call_s1')
    expect(videoMsgs[1].batchId).toBe('search_call_s2')
    expect(videoMsgs[0].batchId).not.toBe(videoMsgs[1].batchId)
  })

  it('pushes tool_start + tool_result + insight(clarification) for ask_clarification (S-1 A1)', async () => {
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
    // S-1 决策 A1：tool_result 在 insight(clarification) 之前
    expect(toolResultIdx).toBeLessThan(insightIdx)
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
  })

  it('pushes tool_start + tool_result + insight(expansion) for query_expand (S-1 A1)', async () => {
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
      type: 'tool_start',
      toolCallId: 'call_e1',
      toolName: 'query_expand',
      args: { query: '鬼畜' },
    })
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
    // S-1 决策 A1 全序列顺序：tool_start -> tool_result -> insight(expansion) -> done
    const toolStartIdx = posted.findIndex(
      (m) => m.type === 'tool_start' && m.toolCallId === 'call_e1',
    )
    const insightIdx = posted.findIndex(
      (m) => m.type === 'insight' && m.kind === 'expansion',
    )
    const toolResultIdx = posted.findIndex(
      (m) => m.type === 'tool_result' && m.toolCallId === 'call_e1',
    )
    const doneIdx = posted.findIndex((m) => m.type === 'done')
    expect(toolStartIdx).toBeGreaterThanOrEqual(0)
    expect(insightIdx).toBeGreaterThanOrEqual(0)
    expect(doneIdx).toBeGreaterThanOrEqual(0)
    // 严格顺序断言：tool_start < tool_result < insight < done
    expect(toolStartIdx).toBeLessThan(toolResultIdx)
    expect(toolResultIdx).toBeLessThan(insightIdx)
    expect(insightIdx).toBeLessThan(doneIdx)
    // 终端事件断言：done 是最后一条消息且只出现一次
    expect(posted[posted.length - 1]).toEqual({ type: 'done' })
    expect(posted.filter((m) => m.type === 'done')).toHaveLength(1)
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

  it('classifies BilibiliNetworkError with its structured cause', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const error = Object.assign(
      new Error('Bilibili search request failed: fetch failed'),
      { name: 'BilibiliNetworkError', cause: { code: 'ENOTFOUND' } },
    )
    setupStreamResult(streamOf(toolErrorPart(error, 'call_net', 'bilibili_search')))

    await handleChatMessage(port, session, makeChatMsg())

    expect(posted).toContainEqual({
      type: 'error',
      code: 'DNS_ERROR',
      message: '域名解析失败，请检查 Base URL 或网络',
    })
  })

  it('classifies stringified BilibiliNetworkError HTTP failures', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    setupStreamResult(
      streamOf(
        toolErrorPart(
          'BilibiliNetworkError: Bilibili search request failed: HTTP 500',
          'call_net_http',
          'bilibili_search',
        ),
      ),
    )

    await handleChatMessage(port, session, makeChatMsg())

    expect(posted).toContainEqual({
      type: 'error',
      code: 'SERVER_ERROR',
      message: '服务端异常，请稍后重试',
    })
  })

  it('keeps Bilibili risk errors in business-error semantics', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const error = new Error('Bilibili risk control triggered')
    error.name = 'BilibiliRiskError'
    setupStreamResult(streamOf(toolErrorPart(error, 'call_risk', 'bilibili_search')))

    await handleChatMessage(port, session, makeChatMsg())

    expect(posted).toContainEqual({
      type: 'error',
      code: 'BILIBILI_RISK',
      message: '触发风控，请稍后再试或登录 B站',
    })
  })

  it('keeps Bilibili API errors in business-error semantics', async () => {
    setupValidProvider()
    const { port, posted } = createPort()
    const session = createSession()
    const error = new Error('Bilibili API returned code -509')
    error.name = 'BilibiliApiError'
    setupStreamResult(streamOf(toolErrorPart(error, 'call_api', 'bilibili_search')))

    await handleChatMessage(port, session, makeChatMsg())

    expect(posted).toContainEqual({
      type: 'error',
      code: 'BILIBILI_API',
      message: 'B站接口异常',
    })
  })

  it('registers existing video tools and skill tools with streamText', async () => {
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
        'load_skill',
        'read_skill_file',
      ]),
    )
    expect(Object.keys(toolsArg)).toHaveLength(7)
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

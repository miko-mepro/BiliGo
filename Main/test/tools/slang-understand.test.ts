import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createSlangUnderstandTool,
  executeUnderstand,
  findLongestDictionaryMatch,
  type UnderstandMemoryStore,
} from '../../src/tools/slang-understand.js'
import type { WorkingMemory } from '../../src/lib/shared-types/index.js'

// hoisted mock for ./llm-json.js (3.7 §4.1)
const llmMocks = vi.hoisted(() => ({
  callLlmForJson: vi.fn(),
}))

vi.mock('../../src/tools/llm-json.js', () => ({
  callLlmForJson: llmMocks.callLlmForJson,
}))

function createMemoryStore(
  existing?: Partial<WorkingMemory>,
): UnderstandMemoryStore {
  const store: WorkingMemory = {
    traceId: 'trace-1',
    triedKeywords: existing?.triedKeywords ?? [],
    rejectedBvids: existing?.rejectedBvids ?? [],
    failureReasons: existing?.failureReasons ?? [],
    clarificationCount: existing?.clarificationCount ?? 0,
  }
  return {
    get: vi.fn(async () => ({ ...store })),
    update: vi.fn(async (patch: Partial<WorkingMemory>) => {
      Object.assign(store, patch)
      return { ...store }
    }),
  }
}

function createToolWithMemory(store?: UnderstandMemoryStore) {
  const memoryStore = store ?? createMemoryStore()
  const toolDef = createSlangUnderstandTool({ memoryStore })
  return { memoryStore, toolDef }
}

/** 调用 tool().execute 并提供最小合法的执行 options。 */
async function runExecute(
  toolDef: ReturnType<typeof createSlangUnderstandTool>,
  query: string,
) {
  const execute = toolDef.execute
  if (!execute) throw new Error('tool.execute missing')
  return execute(
    { query },
    {
      toolCallId: 'tc',
      messages: [],
      abortSignal: undefined,
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  llmMocks.callLlmForJson.mockReset()
})

describe('slang_understand / dictionary', () => {
  it('returns a dictionary match without calling the LLM', async () => {
    const { memoryStore, toolDef } = createToolWithMemory()

    const result = await runExecute(toolDef, '我想看退退退的梗')

    expect(result.matchedDict).toBe(true)
    expect(result.normalized).toContain('退退退')
    expect(result.explanation).toBeTruthy()
    expect(llmMocks.callLlmForJson).not.toHaveBeenCalled()
    expect(memoryStore.update).toHaveBeenCalledWith({
      triedKeywords: [result.normalized],
    })
  })
})

describe('slang_understand / LLM', () => {
  it('uses the LLM result when the dictionary does not match', async () => {
    llmMocks.callLlmForJson.mockResolvedValue({
      normalized: '标准化关键词',
      explanation: 'LLM 给出的解释',
    })
    const { memoryStore, toolDef } = createToolWithMemory()

    // 输入刻意避开 slang-dictionary.json 中所有 term/alias 子串
    const result = await runExecute(toolDef, '查一下今天的天气')

    expect(result.matchedDict).toBe(false)
    expect(result.normalized).toBe('标准化关键词')
    expect(result.explanation).toBe('LLM 给出的解释')
    expect(llmMocks.callLlmForJson).toHaveBeenCalledTimes(1)
    expect(memoryStore.update).toHaveBeenCalledWith({
      triedKeywords: ['标准化关键词'],
    })
  })
})

describe('slang_understand / fallback', () => {
  it('falls back to the original text when LLM generation fails', async () => {
    llmMocks.callLlmForJson.mockResolvedValue(null)
    const { memoryStore, toolDef } = createToolWithMemory()

    const result = await runExecute(toolDef, '随机输入文本')

    expect(result.normalized).toBe('随机输入文本')
    expect(result.explanation).toBe('无法理解，按原文搜索')
    expect(result.matchedDict).toBe(false)
    expect(memoryStore.update).toHaveBeenCalledWith({
      triedKeywords: ['随机输入文本'],
    })
  })
})

describe('slang_understand / empty', () => {
  it('returns an empty passthrough and skips the LLM', async () => {
    const { memoryStore, toolDef } = createToolWithMemory()

    const whitespaceResult = await runExecute(toolDef, '   ')

    expect(whitespaceResult).toEqual({
      original: '   ',
      normalized: '   ',
      explanation: '输入为空',
      matchedDict: false,
    })
    expect(llmMocks.callLlmForJson).not.toHaveBeenCalled()
    // 空输入的 normalized 为空白字符串，safeUpdateMemory 会跳过写入
    expect(memoryStore.update).not.toHaveBeenCalled()

    // 空字符串同样不抛错、不调 LLM
    const emptyResult = await runExecute(toolDef, '')
    expect(emptyResult.normalized).toBe('')
    expect(emptyResult.explanation).toBe('输入为空')
  })
})

describe('slang_understand / matching', () => {
  it('prefers the longest matching term or alias', async () => {
    // “鬼畜视频” (alias of 鬼畜, 4 chars) 和 “神” (alias of 神中神, 1 char)
    // 同时命中时，应取较长的“鬼畜”条目。
    const dictHit = findLongestDictionaryMatch('鬼畜视频神')
    expect(dictHit).toBeDefined()
    expect(dictHit?.term).toBe('鬼畜')

    const { toolDef } = createToolWithMemory()

    const result = await runExecute(toolDef, '鬼畜视频神')

    expect(result.matchedDict).toBe(true)
    // 鬼畜 entry 的 searchHints[0] = "鬼畜全明星"
    expect(result.normalized).toBe('鬼畜全明星')
    // explanation 等于命中 entry 的 meaning 字段
    expect(result.explanation).toBe(dictHit?.meaning)
    expect(llmMocks.callLlmForJson).not.toHaveBeenCalled()
  })
})

describe('slang_understand / memory', () => {
  it('records the normalized keyword in triedKeywords', async () => {
    llmMocks.callLlmForJson.mockResolvedValue({
      normalized: '记忆关键词',
      explanation: '解释',
    })
    const memoryStore = createMemoryStore({
      triedKeywords: ['旧词'],
    })

    // LLM 路径：triedKeywords 合并本次 normalized 到已有列表（去重）
    await executeUnderstand(
      '触发 LLM 路径的输入',
      memoryStore,
      llmMocks.callLlmForJson,
    )

    expect(memoryStore.update).toHaveBeenCalledTimes(1)
    const llmCallArgs = (memoryStore.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0]
    expect(llmCallArgs).toEqual({ triedKeywords: ['旧词', '记忆关键词'] })

    // 字典命中路径：同样写入字典 normalized，且不调 LLM
    vi.clearAllMocks()
    llmMocks.callLlmForJson.mockReset()
    const dictMemoryStore = createMemoryStore()

    await executeUnderstand('yyds 的鬼畜视频', dictMemoryStore, llmMocks.callLlmForJson)

    expect(dictMemoryStore.update).toHaveBeenCalledTimes(1)
    expect(llmMocks.callLlmForJson).not.toHaveBeenCalled()
    const dictCallArgs = (dictMemoryStore.update as ReturnType<typeof vi.fn>)
      .mock.calls[0][0]
    expect(dictCallArgs.triedKeywords).toHaveLength(1)
    expect(dictCallArgs.triedKeywords[0]).toBeTruthy()
  })
})

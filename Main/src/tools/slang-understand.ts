import { tool } from 'ai'
import { z } from 'zod'
import type {
  ChatMessage,
  SlangUnderstandResult,
  WorkingMemory,
} from '../lib/shared-types/index.js'
import { callLlmForJson as defaultCallLlmForJson } from './llm-json.js'
import slangDictionary from './slang-dictionary.json'

interface SlangDictionaryEntry {
  term: string
  aliases: string[]
  meaning: string
  context: string
  searchHints: string[]
}

type SlangDictionaryFile = {
  entries: SlangDictionaryEntry[]
}

const dictionary = slangDictionary as unknown as SlangDictionaryFile

/**
 * LLM 标准化失败时的兜底解释（3.3 §3.2）。
 */
const FALLBACK_EXPLANATION = '无法理解，按原文搜索'

/**
 * 空输入时的解释。
 */
const EMPTY_EXPLANATION = '输入为空'

const SYSTEM_PROMPT = [
  '你是 Bilibili 网络流行语理解助手，仅负责把用户口语化/梗化的输入转成可用于视频搜索的语义。',
  '输出必须是单个 JSON 对象，形如 {"normalized":"...","explanation":"..."}，禁止任何 Markdown 代码块或额外文字。',
  'normalized 字段：尽量保留用户原始关键信息，把模糊的网络梗替换为更通用的搜索关键词。',
  'explanation 字段：用一句话解释这条网络梗或表达的含义，控制在 40 字以内。',
  '如果输入并非梗或网络用语，normalized 直接等于原文，explanation 简单描述用户想找什么。',
].join('\n')

/**
 * memoryStore 接口：traceId 已在工厂闭包中绑定（3.7 §4.1 仅 { get, update }）。
 * 测试中以 `{ get: vi.fn(), update: vi.fn() }` 形式注入。
 */
export interface UnderstandMemoryStore {
  get(): Promise<WorkingMemory | undefined>
  update(patch: Partial<WorkingMemory>): Promise<WorkingMemory | undefined>
}

/** LLM 调用器类型，便于在测试中注入模型/API 替身。 */
export type LlmJsonCaller = (
  messages: ChatMessage[],
) => Promise<{ normalized: string; explanation: string } | null>

/** slang_understand 工厂依赖：memoryStore 必填，callLlmForJson 可选（默认走 llm-json.js）。 */
export interface SlangUnderstandDeps {
  memoryStore: UnderstandMemoryStore
  callLlmForJson?: LlmJsonCaller
}

/** slang_understand 工具输入（AI SDK tool() inputSchema，3.1 §5）。 */
export const slangUnderstandInputSchema = z.object({
  query: z.string().describe('用户原始输入文本'),
})

/** slang_understand 工具工厂：返回 AI SDK tool() 对象。 */
export function createSlangUnderstandTool(deps: SlangUnderstandDeps) {
  const callLlm = deps.callLlmForJson ?? defaultCallLlmForJson

  return tool({
    description:
      '识别 Bilibili 网络流行语、缩写、梗文化，把口语化输入标准化为可用于视频搜索的通用关键词',
    inputSchema: slangUnderstandInputSchema,
    execute: async ({ query }) => {
      return executeUnderstand(query, deps.memoryStore, callLlm)
    },
  })
}

/**
 * slang_understand 执行逻辑（3.3 §3）：
 * 1. 空输入直通（不调 LLM）；
 * 2. 字典最长匹配优先，命中不调 LLM；
 * 3. 字典未命中调用 LLM 标准化，失败时 normalized=原文；
 * 4. 更新 WorkingMemory.triedKeywords（追加 normalized）。
 *
 * insight 推送由 SC-1 统一完成，本函数只返回结构化结果。
 */
export async function executeUnderstand(
  query: string,
  memoryStore: UnderstandMemoryStore,
  callLlm: LlmJsonCaller,
): Promise<SlangUnderstandResult> {
  const original = query ?? ''
  const trimmed = original.trim()

  if (!trimmed) {
    const result: SlangUnderstandResult = {
      original,
      normalized: original,
      explanation: EMPTY_EXPLANATION,
      matchedDict: false,
    }
    await safeUpdateMemory(memoryStore, result.normalized)
    return result
  }

  const dictHit = findLongestDictionaryMatch(trimmed)
  if (dictHit) {
    const normalized = pickNormalizedFromDictionary(dictHit)
    const result: SlangUnderstandResult = {
      original,
      normalized,
      explanation: dictHit.meaning,
      matchedDict: true,
    }
    await safeUpdateMemory(memoryStore, result.normalized)
    return result
  }

  const now = Date.now()
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT, timestamp: now },
    { role: 'user', content: trimmed, timestamp: now },
  ]

  const parsed = await callLlm(messages)

  if (!parsed || !parsed.normalized) {
    const result: SlangUnderstandResult = {
      original,
      normalized: original,
      explanation: FALLBACK_EXPLANATION,
      matchedDict: false,
    }
    await safeUpdateMemory(memoryStore, result.normalized)
    return result
  }

  const result: SlangUnderstandResult = {
    original,
    normalized: parsed.normalized || original,
    explanation: parsed.explanation || FALLBACK_EXPLANATION,
    matchedDict: false,
  }
  await safeUpdateMemory(memoryStore, result.normalized)
  return result
}

/**
 * 字典最长匹配（3.3 §3.1 / §3.3）：
 * 遍历 entries，对每个 entry 的 [term, ...aliases] 检查
 * `lower.includes(candidate.toLowerCase())`，取字符长度最长的命中 entry。
 */
export function findLongestDictionaryMatch(
  text: string,
): SlangDictionaryEntry | undefined {
  const lower = text.toLowerCase()
  let best: { entry: SlangDictionaryEntry; matchLen: number } | undefined

  for (const entry of dictionary.entries) {
    const candidates = [entry.term, ...entry.aliases]
    for (const candidate of candidates) {
      if (!candidate) continue
      if (lower.includes(candidate.toLowerCase())) {
        if (!best || candidate.length > best.matchLen) {
          best = { entry, matchLen: candidate.length }
        }
      }
    }
  }

  return best?.entry
}

function pickNormalizedFromDictionary(entry: SlangDictionaryEntry): string {
  const hint = entry.searchHints[0]
  if (hint && hint.trim()) return hint
  return entry.meaning
}

/**
 * 把 normalized 追加到 triedKeywords（3.3 §3.3 memoryStore 同步）。
 * 仅追加本次结果；合并去重逻辑在 query-expand 等后续工具里完成。
 * 失败静默吞掉，不阻断工具主流程（与旧仓库 understand.ts:121-132 一致）。
 */
async function safeUpdateMemory(
  memoryStore: UnderstandMemoryStore,
  normalized: string,
): Promise<void> {
  if (!normalized || normalized.trim().length === 0) return
  try {
    const existing = await memoryStore.get()
    const merged = existing
      ? Array.from(new Set([...existing.triedKeywords, normalized]))
      : [normalized]
    await memoryStore.update({ triedKeywords: merged })
  } catch {
    // memoryStore 写入失败不影响工具返回（旧仓库同款兜底）
  }
}

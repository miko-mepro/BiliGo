import { tool } from 'ai'
import { z } from 'zod'
import type {
  ChatMessage,
  QueryExpandResult,
  WorkingMemory,
} from '../lib/shared-types/index.js'
import { callLlmForJson as defaultCallLlmForJson } from './llm-json.js'
import {
  searchSuggest as defaultSearchSuggest,
  type SuggestItem,
} from '../lib/bilibili-client/suggest.js'
import {
  searchHot as defaultSearchHot,
  type HotKeyword,
} from '../lib/bilibili-client/hot.js'
import tagTable from './tag-categories.json'

const MAX_KEYWORDS = 8
const MAX_TAGS = 5
const MAX_CATEGORIES = 3
const HOT_LIMIT = 20

interface TagCategory {
  id: number
  name: string
  parentId: number | null
}

interface TagTable {
  categories: TagCategory[]
  popularTags: string[]
}

const tagData = tagTable as unknown as TagTable

/** memoryStore 接口：traceId 已在工厂闭包中绑定（3.7 §5.1 仅 { get, update }）。 */
export interface ExpandMemoryStore {
  get(): Promise<WorkingMemory | undefined>
  update(patch: Partial<WorkingMemory>): Promise<WorkingMemory | undefined>
}

/** LLM 调用器类型，便于在测试中注入模型/API 替身。 */
export type LlmJsonCaller = (
  messages: ChatMessage[],
) => Promise<QueryExpandResult | null>

/** searchSuggest 注入类型。 */
export type SuggestCaller = (term: string) => Promise<SuggestItem[]>

/** searchHot 注入类型。 */
export type HotCaller = (limit: number) => Promise<HotKeyword[]>

/** query_expand 工厂依赖：memoryStore 必填，其余可注入下层 API 替身。 */
export interface QueryExpandDeps {
  memoryStore: ExpandMemoryStore
  callLlmForJson?: LlmJsonCaller
  searchSuggest?: SuggestCaller
  searchHot?: HotCaller
}

/** query_expand 工具输入（AI SDK tool() inputSchema，3.1 §6）。 */
export const queryExpandInputSchema = z.object({
  query: z.string().describe('标准化后的搜索意图'),
})

/** query_expand 工具工厂：返回 AI SDK tool() 对象。 */
export function createQueryExpandTool(deps: QueryExpandDeps) {
  const callLlm = deps.callLlmForJson ?? defaultCallLlmForJson
  const suggest = deps.searchSuggest ?? defaultSearchSuggest
  const hot = deps.searchHot ?? defaultSearchHot

  return tool({
    description:
      '基于标准化后的搜索意图，结合 Bilibili 搜索建议/热门词与本地标签字典，扩展出多个候选关键词、标签与分类',
    inputSchema: queryExpandInputSchema,
    execute: async ({ query }) => {
      return executeExpand(query, deps.memoryStore, callLlm, suggest, hot)
    },
  })
}

/**
 * query_expand 执行逻辑（3.3 §4）：
 * 1. 并行获取辅助上下文（searchSuggest/searchHot），失败返回空数组；
 * 2. 本地标签字典匹配 popularTags 与 categories；
 * 3. 构建 prompt 调用 LLM 生成扩展；
 * 4. 解析失败回退 seed keywords；解析成功先去重再截断（8/5/3）；
 * 5. 合并 triedKeywords 到 WorkingMemory。
 *
 * insight 推送由 SC-1 统一完成，本函数只返回结构化结果。
 */
export async function executeExpand(
  query: string,
  memoryStore: ExpandMemoryStore,
  callLlm: LlmJsonCaller,
  searchSuggest: SuggestCaller,
  searchHot: HotCaller,
): Promise<QueryExpandResult> {
  const seed = [query]
    .map((kw) => kw.trim())
    .filter((kw) => kw.length > 0)

  const [suggest, hot] = await Promise.all([
    safeCall(async () => {
      if (!seed[0]) return []
      return searchSuggest(seed[0])
    }),
    safeCall(() => searchHot(HOT_LIMIT)),
  ])

  const matchedTags = matchTags(query, seed)
  const matchedCategories = matchCategories(query, seed)

  const now = Date.now()
  const suggestText = suggest
    .map((s: SuggestItem) => s.value)
    .filter(Boolean)
    .join(', ')
  const hotText = hot
    .map((h: HotKeyword) => h.keyword)
    .filter(Boolean)
    .join(', ')

  const prompt = [
    `User intent: ${query}`,
    `Seed keywords: ${seed.join(', ') || '(none)'}`,
    `Bilibili suggest: ${suggestText || '(none)'}`,
    `Bilibili hot: ${hotText || '(none)'}`,
    `Matched popular tags: ${matchedTags.join(', ') || '(none)'}`,
    `Matched categories: ${matchedCategories.join(', ') || '(none)'}`,
    'Return JSON only.',
  ].join('\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You expand Bilibili video search queries. Output strictly JSON with shape '
        + '{"keywords":string[],"tags":string[],"categories":string[],"rationale":string}. '
        + `Limits: keywords <= ${MAX_KEYWORDS}, tags <= ${MAX_TAGS}, categories <= ${MAX_CATEGORIES}. `
        + 'Do not include any prose outside the JSON object.',
      timestamp: now,
    },
    {
      role: 'user',
      content: prompt,
      timestamp: now,
    },
  ]

  const parsed = await callLlm(messages)

  const finalResult: QueryExpandResult =
    parsed && Array.isArray(parsed.keywords) && parsed.keywords.length > 0
      ? {
          keywords: dedupe(toStringArray(parsed.keywords)).slice(0, MAX_KEYWORDS),
          tags: dedupe(toStringArray(parsed.tags)).slice(0, MAX_TAGS),
          categories: dedupe(toStringArray(parsed.categories)).slice(
            0,
            MAX_CATEGORIES,
          ),
          rationale:
            typeof parsed.rationale === 'string' ? parsed.rationale : 'fallback',
        }
      : {
          keywords: dedupe(seed).slice(0, MAX_KEYWORDS),
          tags: [],
          categories: [],
          rationale: 'fallback',
        }

  await recordToMemory(memoryStore, finalResult.keywords)

  return finalResult
}

/** safeCall 容错：辅助 API 失败返回空数组，不阻断主流程（3.3 §4.3）。 */
async function safeCall<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn()
  } catch {
    return []
  }
}

function matchTags(query: string, seed: string[]): string[] {
  const haystack = [query, ...seed].join(' ').toLowerCase()
  return tagData.popularTags.filter(
    (tag) => tag.length > 0 && haystack.includes(tag.toLowerCase()),
  )
}

function matchCategories(query: string, seed: string[]): string[] {
  const haystack = [query, ...seed].join(' ').toLowerCase()
  return tagData.categories
    .filter((cat) => cat.name.length > 0 && haystack.includes(cat.name.toLowerCase()))
    .map((cat) => cat.name)
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim()
      if (trimmed.length > 0) out.push(trimmed)
    }
  }
  return out
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr))
}

/**
 * 合并 keywords 到 triedKeywords（3.3 §4.3 memoryStore 合并）：
 * `triedKeywords = [...existing, ...keywords]` 去重，保留已有词不丢失。
 * 失败静默吞掉，不阻断工具主流程（与旧仓库 expand.ts:138-151 一致）。
 */
async function recordToMemory(
  memoryStore: ExpandMemoryStore,
  keywords: string[],
): Promise<void> {
  try {
    const existing = await memoryStore.get()
    const merged = existing
      ? Array.from(new Set([...existing.triedKeywords, ...keywords]))
      : keywords.slice()
    await memoryStore.update({ triedKeywords: merged })
  } catch {
    // memoryStore 读写失败不影响工具返回（旧仓库同款兜底）
  }
}

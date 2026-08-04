import { tool } from 'ai'
import { z } from 'zod'
import type {
  BilibiliVideoCard,
  ChatMessage,
  RerankItem,
  RerankResult,
  WorkingMemory,
} from '../lib/shared-types/index.js'
import { fetchVideoTags, type VideoTag } from '../lib/bilibili-client/tags.js'
import {
  callLlmForJson as defaultCallLlmForJson,
  type LlmJsonOptions,
} from './llm-json.js'

/**
 * 重排候选硬上限（3.3 §6.3）。
 * 超过此值的输入会被截断到前 30 条，`trimmed` 记录截断数。
 */
const MAX_CANDIDATES = 30

/** rerank 文本流连续无新输出的超时阈值，与 llm-json 的默认策略保持一致。 */
export const RERANK_LLM_INACTIVITY_TIMEOUT_MS = 45_000

/** memoryStore 接口：traceId 已在工厂闭包中绑定（3.7 §6.1 仅 { get, update }）。 */
export interface RerankMemoryStore {
  get(): Promise<WorkingMemory | undefined>
  update(patch: Partial<WorkingMemory>): Promise<WorkingMemory | undefined>
}

/** LLM 调用器类型，便于在测试中注入模型/API 替身。 */
export type LlmJsonCaller = (
  messages: ChatMessage[],
  options?: LlmJsonOptions,
) => Promise<{ items: RerankItem[] } | null>

/** video_rerank 工厂依赖：memoryStore 必填，callLlmForJson 可选（默认走 llm-json.js）。 */
export interface VideoRerankDeps {
  memoryStore: RerankMemoryStore
  callLlmForJson?: LlmJsonCaller
}

/** video_rerank 工具输入（AI SDK tool() inputSchema，3.1 §6 / 3.3 §6）。 */
export const videoRerankInputSchema = z.object({
  videos: z
    .array(z.object({ bvid: z.string() }).passthrough())
    .describe('待重排的视频列表，至少包含 bvid 字段'),
  intent: z.string().describe('标准化后的搜索意图，用于 LLM 打分'),
})

/** video_rerank 工具工厂：返回 AI SDK tool() 对象。 */
export function createVideoRerankTool(deps: VideoRerankDeps) {
  const callLlm: LlmJsonCaller = deps.callLlmForJson
    ?? ((messages, options) => defaultCallLlmForJson(messages, undefined, options))

  return tool({
    description:
      '根据用户意图对搜索结果视频智能重排，结合标签和 LLM 打分把最相关的视频放最前面',
    inputSchema: videoRerankInputSchema,
    execute: async ({ videos, intent }) => {
      return executeVideoRerank(videos as unknown as BilibiliVideoCard[], intent, {
        memoryStore: deps.memoryStore,
        callLlmForJson: callLlm,
      })
    },
  })
}

/**
 * video_rerank 执行逻辑（3.3 §6）。
 *
 * 1. 截断到 MAX_CANDIDATES(30)，trimmed 记录截断数；
 * 2. Promise.allSettled 并行获取每个视频的标签，失败按空标签处理；
 * 3. 构建 prompt 调用 LLM 打分；
 * 4. 成功 -> 过滤未知 bvid + clamp[0,1] + 按 score 降序，strategy='llm'；
 * 5. 失败 -> 原序 + score=1-i*0.01 + reason='fallback'，strategy='fallback'，
 *    并将 rerank_fallback: 原因追加到 memoryStore.failureReasons。
 *
 * insight/videos 推送由 SC-1 统一完成，本函数只返回结构化结果。
 *
 * @param videos 候选视频列表（仅使用 bvid/title/author/pic 等字段）
 * @param intent 标准化后的搜索意图
 * @param deps 依赖注入（memoryStore 必填，callLlmForJson 可选；为空时使用默认 llm-json）
 * @returns RerankResult（items/strategy/trimmed）
 */
export async function executeVideoRerank(
  videos: BilibiliVideoCard[],
  intent: string,
  deps: VideoRerankDeps,
): Promise<RerankResult> {
  const callLlm: LlmJsonCaller = deps.callLlmForJson
    ?? ((messages, options) => defaultCallLlmForJson(messages, undefined, options))
  const truncated = videos.slice(0, MAX_CANDIDATES)
  const trimmed = Math.max(0, videos.length - MAX_CANDIDATES)

  if (truncated.length === 0) {
    await safeMemoryUpdate(deps.memoryStore, {})
    return { items: [], strategy: 'fallback', trimmed }
  }

  const BATCH_SIZE = 5
  const tagsByBvid = new Map<string, string[]>()
  for (let i = 0; i < truncated.length; i += BATCH_SIZE) {
    const batch = truncated.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map((card) => fetchVideoTags(card.bvid)),
    )
    batch.forEach((card, j) => {
      const result = results[j]
      if (result?.status === 'fulfilled') {
        const names = result.value
          .map((tag: VideoTag) => tag.tag_name)
          .filter((name: string): name is string => typeof name === 'string' && name.length > 0)
        tagsByBvid.set(card.bvid, names)
      } else {
        tagsByBvid.set(card.bvid, [])
      }
    })
  }

  try {
    const prompt = buildPrompt(intent, truncated, tagsByBvid)
    const now = Date.now()
    const message: ChatMessage = {
      role: 'user',
      content: prompt,
      timestamp: now,
    }

    const parsed = await callLlm([message], {
      inactivityTimeoutMs: RERANK_LLM_INACTIVITY_TIMEOUT_MS,
    })

    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      throw new Error('LLM returned empty rerank items')
    }

    const normalized = normalizeRerankItems(parsed.items, truncated)
    const sorted = [...normalized].sort((a, b) => b.score - a.score)
    await safeMemoryUpdate(deps.memoryStore, {})

    return { items: sorted, strategy: 'llm', trimmed }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'rerank_failed'
    const existing = await safeMemoryGet(deps.memoryStore)
    const previousReasons = existing?.failureReasons ?? []
    await safeMemoryUpdate(deps.memoryStore, {
      failureReasons: [...previousReasons, `rerank_fallback:${errorMessage}`],
    })

    return {
      items: truncated.map((card, index) => ({
        bvid: card.bvid,
        score: 1 - index * 0.01,
        reason: 'fallback',
      })),
      strategy: 'fallback',
      trimmed,
    }
  }
}

/**
 * 构建 LLM 重排 prompt（3.3 §6.1）。
 *
 * 格式：User intent + 候选数量说明 + 每个视频的 bvid/title/author/tags/cover
 * + 输出 JSON 约定。
 */
function buildPrompt(
  intent: string,
  candidates: BilibiliVideoCard[],
  tagsByBvid: Map<string, string[]>,
): string {
  const lines: string[] = [
    `User intent: ${intent}`,
    '',
    `Score the following ${candidates.length} Bilibili video candidates against the intent.`,
    'Each score must be a number in [0, 1] where 1 is a perfect match.',
    '',
    'Candidates:',
  ]

  candidates.forEach((card, index) => {
    const tags = tagsByBvid.get(card.bvid) ?? []
    lines.push(`${index + 1}. bvid=${card.bvid}`)
    lines.push(`   title: ${card.title}`)
    lines.push(`   author: ${card.author}`)
    if (tags.length > 0) {
      lines.push(`   tags: ${tags.join(', ')}`)
    }
  })

  lines.push('')
  lines.push('Respond with JSON only, no markdown fences, in the form:')
  lines.push('{"items":[{"bvid":"<bvid>","score":<0..1>,"reason":"<short reason>"}]}')

  return lines.join('\n')
}

/**
 * 规范化 LLM 返回的重排项（3.3 §6.3）：
 * - 过滤掉 bvid 不在 candidates 中的项（未知 bvid 丢弃）；
 * - score 非有限数或缺失 -> 0；
 * - score 限制在 [0, 1] 范围内（clamp）；
 * - reason 缺失 -> 空串。
 */
function normalizeRerankItems(
  items: unknown[],
  candidates: BilibiliVideoCard[],
): RerankItem[] {
  const knownBvids = new Set(candidates.map((card) => card.bvid))
  const normalized: RerankItem[] = []

  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as { bvid?: unknown; score?: unknown; reason?: unknown }
    if (typeof record.bvid !== 'string' || !knownBvids.has(record.bvid)) continue
    const score =
      typeof record.score === 'number' && Number.isFinite(record.score)
        ? clamp(record.score, 0, 1)
        : 0
    const reason = typeof record.reason === 'string' ? record.reason : ''
    normalized.push({ bvid: record.bvid, score, reason })
  }

  return normalized
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * 安全读取 memoryStore，失败时返回 undefined（不阻断重排主流程）。
 */
async function safeMemoryGet(
  memoryStore: RerankMemoryStore,
): Promise<WorkingMemory | undefined> {
  try {
    return await memoryStore.get()
  } catch {
    return undefined
  }
}

/**
 * 安全更新 memoryStore，失败时静默（不阻断重排主流程）。
 */
async function safeMemoryUpdate(
  memoryStore: RerankMemoryStore,
  patch: Partial<WorkingMemory>,
): Promise<void> {
  try {
    await memoryStore.update(patch)
  } catch {
    // memoryStore 读写失败不影响工具返回（与旧仓库 rerank.ts 同款兜底）
  }
}

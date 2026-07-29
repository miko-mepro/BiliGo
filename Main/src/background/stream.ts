/// <reference types="@types/chrome" />

import { streamText, generateText, isStepCount, tool } from 'ai'
import type { ModelMessage, LanguageModel, ToolSet, TextStreamPart } from 'ai'
import { z } from 'zod'
import type { ChatMessage, BilibiliVideoCard } from '../lib/shared-types/index.js'
import type { ProviderConfig } from '../lib/shared-types/provider.js'
import { readBiliAgentSettings } from '../config/settings.js'
import { createModel, validateProviderConfig } from '../config/provider-factory.js'
import {
  isCSMessage,
  inferErrorCode,
  friendlyMessage,
  type SWMessage,
  type CSMessage,
} from './port-protocol.js'
import { WorkingMemoryStore } from '../tools/working-memory.js'
import { createSlangUnderstandTool } from '../tools/slang-understand.js'
import { createQueryExpandTool } from '../tools/query-expand.js'
import { createBilibiliSearchTool } from '../tools/bilibili-search.js'
import { createVideoRerankTool } from '../tools/video-rerank.js'
import { askClarification } from '../tools/ask-clarification.js'
import { analyzeCovers } from '../tools/analyze-covers.js'
import type {
  SlangUnderstandResult,
  QueryExpandResult,
  RerankResult,
  ClarificationRequest,
  WorkingMemory,
} from '../lib/shared-types/index.js'

export const SYSTEM_PROMPT = `你是 Bilibili 视频搜索助手。请严格按以下工作流处理用户请求：

1. **理解黑话**：如果用户输入包含网络梗、俚语、缩写（如"退退退/绝绝子/yyds/破防"），先调用 slang_understand 把意图标准化。
2. **扩展查询**：调用 query_expand 把标准化后的意图扩展成多个候选关键词/标签。
3. **搜索视频**：调用 bilibili_search 执行搜索。仅在用户明确说"按封面搜/看封面"时才把 analyze_covers 设为 true。
4. **智能重排**：当 bilibili_search 返回多于 3 个结果时，调用 video_rerank 重排，把最相关的放最前面。
5. **展示或澄清**：如果你对结果有信心，直接用自然语言总结并展示；如果意图非常模糊或多义且本会话还没追问过，调用 ask_clarification 追问（每会话最多 1 次）。

硬性规则：
- 单次会话工具调用不超过 5 轮，超过就停止调用工具直接回答。
- 不要跳过第 1、2 步直接搜索；除非用户输入已经是非常具体、明确的标准中文关键词。
- 每次工具调用前先简短说明你的计划，再发起调用。
- 当用户只是闲聊或问与视频搜索无关的问题时，可以直接回答，不调用任何工具。`

export interface PortState {
  disconnected: boolean
}

export interface PortSession extends PortState {
  abortController: AbortController | null
}

export function postToPort(port: chrome.runtime.Port, state: PortState, msg: SWMessage): void {
  if (state.disconnected) return
  port.postMessage(msg)
}

export function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  const converted = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
      ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
    }))
  return converted as unknown as ModelMessage[]
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') return true
  return false
}

function resolveActiveProvider(
  providers: ProviderConfig[],
  activeProviderId: string | null,
): ProviderConfig | null {
  if (!activeProviderId) return null
  return providers.find((p) => p.id === activeProviderId) ?? null
}

/**
 * 生成会话级 traceId（3.3 §2.1）。
 *
 * 优先使用 crypto.randomUUID()；若运行环境不可用（如极少数 SW 启动竞态），
 * 回退到 conversationId + Date.now() 组合，保证唯一性即可。
 */
function createTraceId(conversationId: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${conversationId}-${crypto.randomUUID()}`
  }
  return `${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 为 slang_understand / query_expand / video_rerank 构造 memoryStore 适配器。
 *
 * 这三个工具的工厂接口要求 memoryStore.get()/update(patch) 不带 traceId 参数
 * （traceId 已在工厂闭包中绑定，见 slang-understand.ts:47 注释）。
 * 本适配器把 WorkingMemoryStore 的静态方法（需要 traceId 参数）桥接为
 * 工厂期望的无 traceId 接口。
 */
function bindMemoryStore(traceId: string) {
  return {
    get(): Promise<WorkingMemory | undefined> {
      return WorkingMemoryStore.get(traceId)
    },
    update(patch: Partial<WorkingMemory>): Promise<WorkingMemory | undefined> {
      return WorkingMemoryStore.update(traceId, patch)
    },
  }
}

/**
 * ask_clarification 的 memoryStore 接口要求显式传入 traceId（见 ask-clarification.ts:24-31）。
 * 直接使用 WorkingMemoryStore 静态方法即可，无需适配。
 */
const askClarificationMemoryStore = WorkingMemoryStore

/**
 * 构造 5 个 AI SDK tool，注入所需依赖（3.3 §2.1 第 4 步 / 3.2 §6）。
 *
 * - slang_understand / query_expand / video_rerank：使用 `createXxxTool` 工厂，
 *   注入 bindMemoryStore(traceId) 适配器。
 * - bilibili_search：使用 `createBilibiliSearchTool`，注入 analyzeCovers 函数
 *   （由 bilibili_search 参数 `analyze_covers` 触发，不注册为独立 tool）。
 * - ask_clarification：裸函数 `askClarification`，用 `tool()` 包装为 AI SDK tool。
 */
function buildTools(traceId: string): ToolSet {
  const boundMemory = bindMemoryStore(traceId)

  const slangUnderstand = createSlangUnderstandTool({ memoryStore: boundMemory })
  const queryExpand = createQueryExpandTool({ memoryStore: boundMemory })
  const bilibiliSearch = createBilibiliSearchTool({ analyzeCovers })
  const videoRerank = createVideoRerankTool({ memoryStore: boundMemory })

  const askClarificationTool = tool({
    description:
      '当用户意图模糊或多义、且本会话还没追问过时，向用户提出一个简短的澄清问题（每会话最多 1 次）',
    inputSchema: z.object({
      question: z.string().describe('向用户提出的澄清问题，简短聚焦'),
      options: z.array(z.string()).optional().describe('可选预设答案，UI 渲染为可点击按钮'),
      reason: z.string().describe('向 UI 解释为什么追问'),
    }),
    execute: async ({ question, options, reason }) => {
      return askClarification(
        { question, options, reason },
        { memoryStore: askClarificationMemoryStore },
        traceId,
      )
    },
  })

  return {
    slang_understand: slangUnderstand,
    query_expand: queryExpand,
    bilibili_search: bilibiliSearch,
    video_rerank: videoRerank,
    ask_clarification: askClarificationTool,
  } as ToolSet
}

/**
 * 在 tool-result 事件中按 toolName 推送附加的 videos/insight 消息（3.2 §6 / §9.2）。
 *
 * 顺序保证（3.2 §9.2）：tool_start -> videos/insight -> tool_result。
 * 本函数在 tool-result case 中先推送附加消息（videos/insight），
 * 再由调用方推送 tool_result，从而保证顺序为 tool_start -> videos/insight -> tool_result。
 *
 * @param toolInput 该 toolCallId 对应的 tool-call 事件 input（video_rerank 需要从中取原始候选视频列表）
 */
function postToolAuxiliaryMessages(
  port: chrome.runtime.Port,
  session: PortState,
  toolName: string,
  output: unknown,
  toolInput?: unknown,
): void {
  switch (toolName) {
    case 'bilibili_search':
      postToPort(port, session, { type: 'videos', videos: output as BilibiliVideoCard[] })
      break
    case 'slang_understand':
      postToPort(port, session, {
        type: 'insight',
        kind: 'understanding',
        data: output as SlangUnderstandResult,
      })
      break
    case 'query_expand':
      postToPort(port, session, {
        type: 'insight',
        kind: 'expansion',
        data: output as QueryExpandResult,
      })
      break
    case 'video_rerank': {
      const rerankResult = output as RerankResult
      // 先推送 insight(rerank)
      postToPort(port, session, { type: 'insight', kind: 'rerank', data: rerankResult })
      // video_rerank 的双重推送（3.2 §6.3）：insight 后再推送重排后的视频列表。
      // 从 toolInput（tool-call 事件的 input）中取出原始候选视频列表，
      // 按 rerankResult.items 的 bvid 顺序重新排列，过滤未知 bvid。
      const candidates = extractVideoCandidates(toolInput)
      if (candidates.length > 0) {
        const reordered = reorderVideosByRerank(candidates, rerankResult.items)
        postToPort(port, session, { type: 'videos', videos: reordered })
      }
      break
    }
    case 'ask_clarification':
      postToPort(port, session, {
        type: 'insight',
        kind: 'clarification',
        data: output as ClarificationRequest,
      })
      break
    default:
      // 未知工具名：不附加消息，仅推送 tool_result
      break
  }
}

/**
 * 从 video_rerank 的 tool input 中提取候选视频列表（3.2 §6.3）。
 *
 * tool input 形如 `{ videos: BilibiliVideoCard[], intent: string }`；
 * 防御性解析，任意形状异常返回空数组。
 */
function extractVideoCandidates(toolInput: unknown): BilibiliVideoCard[] {
  if (!toolInput || typeof toolInput !== 'object') return []
  const record = toolInput as { videos?: unknown }
  if (!Array.isArray(record.videos)) return []
  // 防御：video_rerank 的 inputSchema 只强制 bvid（模型可能省略 title/pic 等字段），
  // 残缺卡片直接推给 UI 会导致 VideoCard 渲染崩溃（title.replace on undefined）。
  // 只保留具备 UI 渲染必需字段（bvid + title）的完整卡片；全部残缺则返回空数组，
  // 由调用方跳过 videos 推送（UI 保留上一次 bilibili_search 的完整列表）。
  return (record.videos as BilibiliVideoCard[]).filter(
    (card) =>
      card &&
      typeof card === 'object' &&
      typeof card.bvid === 'string' &&
      typeof card.title === 'string',
  )
}

/**
 * 按 rerank items 的 bvid 顺序重排候选视频列表（3.2 §6.3）。
 *
 * - 遍历 rerankItems，按 bvid 从 candidates 中查找对应视频；
 * - 找到则放入结果，未找到则跳过（rerankItems 中的未知 bvid 不会出现在结果中）；
 * - rerankItems 中未涉及的 candidates 按原序追加到末尾（保证不丢失视频）。
 */
function reorderVideosByRerank(
  candidates: BilibiliVideoCard[],
  rerankItems: { bvid: string; score: number; reason: string }[],
): BilibiliVideoCard[] {
  const byBvid = new Map<string, BilibiliVideoCard>()
  for (const card of candidates) {
    if (card.bvid) {
      byBvid.set(card.bvid, card)
    }
  }

  const reordered: BilibiliVideoCard[] = []
  const usedBvids = new Set<string>()

  for (const item of rerankItems) {
    const card = byBvid.get(item.bvid)
    if (card && !usedBvids.has(item.bvid)) {
      reordered.push(card)
      usedBvids.add(item.bvid)
    }
  }

  // 把 rerankItems 未涉及的候选视频按原序追加到末尾
  for (const card of candidates) {
    if (card.bvid && !usedBvids.has(card.bvid)) {
      reordered.push(card)
      usedBvids.add(card.bvid)
    }
  }

  return reordered
}

export async function handleChatMessage(
  port: chrome.runtime.Port,
  session: PortSession,
  msg: Extract<CSMessage, { type: 'chat' }>,
): Promise<void> {
  const settings = await readBiliAgentSettings()
  const config = resolveActiveProvider(settings.providers, settings.activeProviderId)
  const validation = config ? validateProviderConfig(config) : { valid: false, errors: ['未配置活跃 Provider'] }

  if (!config || !validation.valid) {
    postToPort(port, session, {
      type: 'error',
      message: friendlyMessage('PROVIDER_NOT_CONFIGURED'),
      code: 'PROVIDER_NOT_CONFIGURED',
    })
    postToPort(port, session, { type: 'done' })
    return
  }

  const model: LanguageModel = createModel(config)
  const modelMessages = toModelMessages(msg.messages)
  const traceId = createTraceId(msg.conversationId)
  await WorkingMemoryStore.create(traceId)
  const tools = buildTools(traceId)

  const abortController = new AbortController()
  session.abortController = abortController

  // 维护 toolCallId -> tool input 的映射，用于在 tool-result 时获取
  // video_rerank 的原始候选视频列表（3.2 §6.3 双重推送需要重建重排后的视频列表）。
  const toolInputs = new Map<string, unknown>()

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: isStepCount(5),
    abortSignal: abortController.signal,
  })

  try {
    // 运行时防御：校验 stream 是否为可迭代对象
    if (!result.stream || typeof result.stream[Symbol.asyncIterator] !== 'function') {
      throw new Error('模型未返回可迭代流')
    }
    streamLoop: for await (const part of result.stream as AsyncIterable<TextStreamPart<ToolSet>>) {
      if (session.disconnected) return
      switch (part.type) {
        case 'text-delta':
          postToPort(port, session, { type: 'chunk', delta: part.text })
          break
        case 'reasoning-delta':
          postToPort(port, session, { type: 'reasoning', delta: part.text })
          break
        case 'tool-call':
          toolInputs.set(part.toolCallId, part.input)
          postToPort(port, session, {
            type: 'tool_start',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
          })
          break
        case 'tool-result': {
          // 先推送附加 videos/insight 消息（3.2 §9.2 顺序：tool_start -> videos/insight -> tool_result）
          const toolInput = toolInputs.get(part.toolCallId)
          postToolAuxiliaryMessages(port, session, part.toolName, part.output, toolInput)
          toolInputs.delete(part.toolCallId)
          // 再推送 tool_result
          postToPort(port, session, {
            type: 'tool_result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.output,
          })
          break
        }
        case 'tool-error': {
          const errorText = String(part.error)
          const code = inferErrorCode(errorText)
          // 含工具名上下文（4.2 SC-1）：直接使用 toolContextMessage 作为 message，
          // 而非 friendlyMessage(code, ...)。因为 friendlyMessage 对已知 code 返回
          // 固定文案会丢弃工具名上下文。
          const toolContextMessage = `工具 ${part.toolName} 执行失败: ${errorText}`
          postToPort(port, session, {
            type: 'error',
            message: toolContextMessage,
            code,
          })
          break streamLoop
        }
        case 'abort':
          break streamLoop
        case 'error': {
          const errorText = String(part.error)
          const code = inferErrorCode(errorText)
          postToPort(port, session, {
            type: 'error',
            message: friendlyMessage(code, errorText),
            code,
          })
          break streamLoop
        }
        default:
          break
      }
    }
  } catch (err) {
    if (!isAbortError(err)) {
      const message = err instanceof Error ? err.message : String(err)
      const code = inferErrorCode(message)
      postToPort(port, session, {
        type: 'error',
        message: friendlyMessage(code, message),
        code,
      })
    }
  } finally {
    // 会话结束清理 WorkingMemory（3.3 §2.1 末尾 / 3.7 §3.1 资源释放）
    // 失败静默，不阻断 done 推送
    try {
      await WorkingMemoryStore.release(traceId)
    } catch {
      // 释放失败不影响主流程
    }
  }

  session.abortController = null
  postToPort(port, session, { type: 'done' })
}

export function handlePing(port: chrome.runtime.Port, session: PortState): void {
  postToPort(port, session, { type: 'pong' })
}

export function handleStop(session: PortSession): void {
  if (session.abortController) {
    session.abortController.abort()
  }
}

/**
 * 标题生成系统提示：要求模型生成 20 字以内的中文对话标题，只输出标题本身。
 * 失败由调用方降级处理（首条 user 消息前 20 字）。
 */
const TITLE_SYSTEM_PROMPT = '生成20字以内的中文对话标题，只输出标题本身，不要加引号或标点前缀。'

/** 标题最大字符数（含中文，按字符数截断） */
const TITLE_MAX_CHARS = 20

/**
 * 处理 generate_title 请求：经单 Port 复用链路，用 AI SDK generateText（无工具循环）
 * 生成 ≤20 字标题并回推 {type:'title'}；任何失败回 {type:'error'}。
 *
 * 设计依据 3.4 §8 / 3.2 §4.9：
 * - 复用现有 Port（不开新 Port）
 * - 10s 超时（AbortSignal.timeout），避免长时间阻塞
 * - 复用 stream.ts 内 resolveActiveProvider/createModel，不重复造轮子
 * - 无 provider 配置或 generateText 失败时回 error，由 CS 侧本地降级
 */
export async function handleGenerateTitle(
  port: chrome.runtime.Port,
  session: PortState,
  msg: Extract<CSMessage, { type: 'generate_title' }>,
): Promise<void> {
  // 复用与 chat 相同的 provider 解析路径
  const settings = await readBiliAgentSettings()
  const config = resolveActiveProvider(settings.providers, settings.activeProviderId)
  const validation = config ? validateProviderConfig(config) : { valid: false, errors: ['未配置活跃 Provider'] }

  if (!config || !validation.valid) {
    postToPort(port, session, {
      type: 'error',
      message: friendlyMessage('PROVIDER_NOT_CONFIGURED'),
      code: 'PROVIDER_NOT_CONFIGURED',
    })
    return
  }

  const model: LanguageModel = createModel(config)
  const modelMessages = toModelMessages(msg.messages)

  try {
    const result = await generateText({
      model,
      system: TITLE_SYSTEM_PROMPT,
      messages: modelMessages,
      abortSignal: AbortSignal.timeout(10_000),
    })
    if (session.disconnected) return
    // 截断到 20 字（按字符数，兼容中文）
    const rawTitle = (result.text ?? '').trim()
    const title = Array.from(rawTitle).slice(0, TITLE_MAX_CHARS).join('')
    postToPort(port, session, { type: 'title', conversationId: msg.conversationId, title })
  } catch (err) {
    if (session.disconnected) return
    // 超时/abort/网络错误等均回 error，由 CS 侧本地降级
    const message = err instanceof Error ? err.message : String(err)
    const code = inferErrorCode(message)
    postToPort(port, session, {
      type: 'error',
      message: friendlyMessage(code, message),
      code,
    })
  }
}

/**
 * 处理 test_connection 请求：用消息携带的待测 provider 配置创建临时 model，
 * 执行 generateText("hi") 验证连通性，10s 超时。
 *
 * 设计依据 3.2 §3.5 + 4.5 SA-12 TestConnectionButton 硬性契约：
 * - SW 用待测配置创建临时 model（不读取 settings，直接用 msg.provider）
 * - 执行 generateText({ model, messages:[{role:'user',content:'hi'}] })
 * - 10s 超时（AbortSignal.timeout，与 handleGenerateTitle 一致）
 * - 成功回 {type:'connection_result',ok:true}
 * - 失败回 {type:'connection_result',ok:false,error:friendlyMessage(code,message)}
 *
 * 与 handleGenerateTitle 的区别：
 * - 不读取 settings/resolveActiveProvider，直接用 msg.provider
 * - 回复 connection_result 而非 title/error
 * - 不截断文本，不关心返回内容，只验证连通性
 */
export async function handleTestConnection(
  port: chrome.runtime.Port,
  session: PortState,
  msg: Extract<CSMessage, { type: 'test_connection' }>,
): Promise<void> {
  const config = msg.provider
  // 校验待测 provider 配置（ollama 允许空 apiKey）
  const validation = validateProviderConfig(config)

  // 校验失败：provider 配置本身不合法（如非 ollama 但 apiKey 为空）
  if (!validation.valid) {
    postToPort(port, session, {
      type: 'connection_result',
      ok: false,
      error: validation.errors.join('；'),
    })
    return
  }

  // 用待测配置创建临时 model（不读取 settings，直接用 msg.provider）
  const model: LanguageModel = createModel(config)

  try {
    // 执行一次性 generateText 验证连通性，10s 超时
    await generateText({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      abortSignal: AbortSignal.timeout(10_000),
    })
    if (session.disconnected) return
    // 连通性验证成功，不关心返回文本
    postToPort(port, session, { type: 'connection_result', ok: true })
  } catch (err) {
    if (session.disconnected) return
    // 超时/abort/网络错误/鉴权失败等均回 ok:false + 友好错误信息
    const message = err instanceof Error ? err.message : String(err)
    const code = inferErrorCode(message)
    postToPort(port, session, {
      type: 'connection_result',
      ok: false,
      error: friendlyMessage(code, message),
    })
  }
}

export function setupPortListener(portName = 'bili-agent-chat'): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== portName) return

    const session: PortSession = { disconnected: false, abortController: null }
    port.onDisconnect.addListener(() => {
      session.disconnected = true
      if (session.abortController) {
        session.abortController.abort()
      }
    })

    port.onMessage.addListener((msg: unknown) => {
      if (!isCSMessage(msg)) return
      switch (msg.type) {
        case 'chat':
          void handleChatMessage(port, session, msg).catch((err) => {
            if (session.disconnected) return
            const message = err instanceof Error ? err.message : String(err)
            const code = inferErrorCode(message)
            postToPort(port, session, { type: 'error', message: friendlyMessage(code, message), code })
            postToPort(port, session, { type: 'done' })
          })
          break
        case 'generate_title':
          void handleGenerateTitle(port, session, msg).catch((err) => {
            if (session.disconnected) return
            const message = err instanceof Error ? err.message : String(err)
            const code = inferErrorCode(message)
            postToPort(port, session, { type: 'error', message: friendlyMessage(code, message), code })
          })
          break
        case 'test_connection':
          void handleTestConnection(port, session, msg).catch((err) => {
            if (session.disconnected) return
            const message = err instanceof Error ? err.message : String(err)
            postToPort(port, session, { type: 'connection_result', ok: false, error: message })
          })
          break
        case 'ping':
          handlePing(port, session)
          break
        case 'stop':
          handleStop(session)
          break
      }
    })
  })
}

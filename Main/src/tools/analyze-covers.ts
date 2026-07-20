import { streamText } from 'ai'
import { APICallError, NoSuchModelError } from 'ai'
import type { LanguageModel } from 'ai'
import {
  readBiliAgentSettings,
  type BiliAgentSettings,
} from '../config/settings.js'
import { createModel } from '../config/provider-factory.js'

/**
 * 封面分析缓存 key（3.1 §15 常量表）。
 * 值为 `Record<bvid, CacheEntry>`。
 */
export const COVER_ANALYSIS_CACHE_KEY = 'bili-agent-cover-analysis-cache'

/** 缓存有效期：7 天（3.1 §15）。 */
export const COVER_ANALYSIS_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 单次 analyzeCovers 硬上限（3.1 §15）。maxN 会被截断到此值。 */
export const HARD_MAX_COVERS = 5

/** Vision 不支持时的缓存降级标记（3.1 §15）。命中后不再重试。 */
export const VISION_UNSUPPORTED_MARKER = '该模型不支持视觉'

/** Vision prompt：要求模型用简体中文描述封面。 */
const VISION_PROMPT =
  'Describe this Bilibili video cover image in concise Chinese. Focus on visible objects, people, text, style, and scene.'

/**
 * 单条封面输入（3.1 §15）。
 */
export interface CoverInput {
  bvid: string
  picUrl: string
}

/**
 * analyzeCovers 依赖注入选项。
 *
 * 用于单测替换 fetch / 时间源 / settings / model 工厂。
 * 生产路径下使用全局 fetch / Date.now / readBiliAgentSettings / createModel。
 */
export interface CoverAnalysisOptions {
  fetchImpl?: typeof fetch
  now?: () => number
  settingsReader?: () => Promise<BiliAgentSettings>
  modelFactory?: (settings: BiliAgentSettings) => LanguageModel | null
}

interface CacheEntry {
  description: string
  timestamp: number
}

type CoverAnalysisCache = Record<string, CacheEntry>

/**
 * 分析封面图像（3.1 §15）。
 *
 * 行为契约（三种状态）：
 * 1. 命中缓存且未过期 -> 直接返回缓存描述，不调用模型。
 * 2. Vision 不支持 -> 缓存 VISION_UNSUPPORTED_MARKER，下次跳过、不再重试。
 * 3. 失败 -> 不缓存，下次重试。
 *
 * @param covers 封面列表（按顺序处理，超过 maxN 截断）
 * @param maxN 最大处理数量，默认 HARD_MAX_COVERS(5)，超过硬上限截断
 * @param options 依赖注入（测试用）
 * @returns bvid -> 中文描述的 Map（不含 vision-unsupported 项）
 */
export async function analyzeCovers(
  covers: CoverInput[],
  maxN: number = HARD_MAX_COVERS,
  options: CoverAnalysisOptions = {},
): Promise<Map<string, string>> {
  const now = options.now?.() ?? Date.now()
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
  const settings = await (options.settingsReader ?? readBiliAgentSettings)()
  const selectedCovers = covers.slice(0, normalizeMaxN(maxN))
  const cache = await readCache()
  const descriptions = new Map<string, string>()
  const misses: CoverInput[] = []

  for (const cover of selectedCovers) {
    const cached = cache[cover.bvid]
    if (cached && now - cached.timestamp < COVER_ANALYSIS_TTL_MS) {
      if (cached.description !== VISION_UNSUPPORTED_MARKER) {
        descriptions.set(cover.bvid, cached.description)
      }
      continue
    }

    misses.push(cover)
  }

  if (misses.length === 0) {
    return descriptions
  }

  const model = resolveModel(settings, options.modelFactory)
  if (!model) {
    return descriptions
  }

  let cacheDirty = false

  for (const cover of misses) {
    let dataUrl: string
    try {
      dataUrl = await fetchCoverAsDataUrl(cover.picUrl, fetchImpl)
    } catch {
      // fetch 失败不缓存，下次重试
      continue
    }

    const result = await describeCover(model, dataUrl)
    if (result.kind === 'description') {
      descriptions.set(cover.bvid, result.text)
      cache[cover.bvid] = { description: result.text, timestamp: now }
      cacheDirty = true
    } else if (result.kind === 'unsupported') {
      cache[cover.bvid] = { description: VISION_UNSUPPORTED_MARKER, timestamp: now }
      cacheDirty = true
    }
    // 'failed' -> 不缓存，下次重试
  }

  if (cacheDirty) {
    await chrome.storage.local.set({ [COVER_ANALYSIS_CACHE_KEY]: cache })
  }

  return descriptions
}

/**
 * 将 maxN 规范化到 [0, HARD_MAX_COVERS] 区间。
 *
 * - 非有限数或 <= 0 -> 0（不处理任何封面）
 * - 正小数 -> 向下取整
 * - 超过 HARD_MAX_COVERS -> 截断到 HARD_MAX_COVERS
 */
function normalizeMaxN(maxN: number): number {
  if (!Number.isFinite(maxN) || maxN <= 0) {
    return 0
  }

  return Math.min(Math.floor(maxN), HARD_MAX_COVERS)
}

/**
 * 读取并校验缓存结构。
 *
 * 防御性解析：若存储中的值被外部破坏（非对象 / 数组 / 字段缺失），
 * 跳过该条目而非抛错，保证 analyzeCovers 永不因缓存损坏而失败。
 */
async function readCache(): Promise<CoverAnalysisCache> {
  const result = await chrome.storage.local.get(COVER_ANALYSIS_CACHE_KEY)
  const value = result[COVER_ANALYSIS_CACHE_KEY]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const cache: CoverAnalysisCache = {}
  for (const [bvid, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const record = entry as Record<string, unknown>
    if (
      typeof record.description === 'string' &&
      typeof record.timestamp === 'number'
    ) {
      cache[bvid] = {
        description: record.description,
        timestamp: record.timestamp,
      }
    }
  }

  return cache
}

/**
 * 下载封面并转为 data URL。
 *
 * 1. 归一化 picUrl（补 `https:` 前缀给 `//`-开头 URL）。
 * 2. fetch 字节数据。
 * 3. 按 Content-Type 拼接 `data:<mediaType>;base64,<...>`。
 *
 * @throws 当 fetch 失败或响应非 ok 时抛出，由调用方 try/catch。
 */
async function fetchCoverAsDataUrl(
  picUrl: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(normalizePicUrl(picUrl))
  if (!response.ok) {
    throw new Error(`Failed to fetch cover image: ${response.status}`)
  }

  const contentType =
    response.headers.get('Content-Type')?.split(';')[0] || 'image/jpeg'
  const bytes = new Uint8Array(await response.arrayBuffer())
  return `data:${contentType};base64,${bytesToBase64(bytes)}`
}

/** 补全 `//`-开头的协议相对 URL 为 https。 */
function normalizePicUrl(picUrl: string): string {
  if (picUrl.startsWith('//')) {
    return `https:${picUrl}`
  }

  return picUrl
}

/** 将 Uint8Array 转为 base64 字符串（分块以避免 spread 栈溢出）。 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize))
  }

  return btoa(binary)
}

/**
 * 解析当前激活的 provider 配置并构造 LanguageModel。
 *
 * 若没有激活 provider、apiKey 为空、model 为空，或 createModel 抛错，
 * 返回 null（调用方将跳过本次分析）。
 */
function resolveModel(
  settings: BiliAgentSettings,
  factory?: (settings: BiliAgentSettings) => LanguageModel | null,
): LanguageModel | null {
  if (factory) {
    return factory(settings)
  }

  const config = settings.providers.find((p) => p.id === settings.activeProviderId)
  if (!config || !config.apiKey || !config.model) {
    return null
  }

  try {
    return createModel(config)
  } catch {
    return null
  }
}

type DescribeResult =
  | { kind: 'description'; text: string }
  | { kind: 'unsupported' }
  | { kind: 'failed' }

/**
 * 调用 vision 模型描述单张封面。
 *
 * 使用 AI SDK `streamText` 发送 `{ type: 'text' } + { type: 'image', image: dataUrl }`
 * 消息，累积 text-delta 得到描述文本。
 *
 * 结果分类（3.1 §15 三态）：
 * - description: 累积到非空文本 -> 缓存并返回
 * - unsupported: 模型不支持 vision（404/400/422 或 NoSuchModelError 或
 *   消息含 'image'/'vision'/'multimodal'/'not support'/'unsupported'）-> 缓存标记
 * - failed: 其它错误（网络/认证/限流/5xx/空文本）-> 不缓存，下次重试
 *
 * @param model 已构造好的 LanguageModel
 * @param dataUrl base64 data URL 形式的封面图像
 */
async function describeCover(
  model: LanguageModel,
  dataUrl: string,
): Promise<DescribeResult> {
  let description = ''
  let streamError: unknown = null

  try {
    const result = streamText({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_PROMPT },
            { type: 'image', image: dataUrl },
          ],
        },
      ],
    })

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        description += part.text
      } else if (part.type === 'error') {
        streamError = part.error
        break
      }
    }
  } catch (err) {
    return isVisionUnsupportedError(err)
      ? { kind: 'unsupported' }
      : { kind: 'failed' }
  }

  if (streamError !== null) {
    return isVisionUnsupportedError(streamError)
      ? { kind: 'unsupported' }
      : { kind: 'failed' }
  }

  const trimmed = description.trim()
  if (!trimmed) {
    return { kind: 'failed' }
  }

  return { kind: 'description', text: trimmed }
}

/**
 * 判断错误是否表示「模型不支持 vision」。
 *
 * 判定规则（移植自旧仓库 cover-analysis.ts isVisionUnsupportedError）：
 * 1. NoSuchModelError -> 不支持该模型，视为 vision unsupported。
 * 2. APICallError 且 statusCode 为 400/404/422 -> unsupported。
 * 3. APICallError 且 statusCode 为 5xx / 401/403(auth)/429(rate_limit) /
 *    网络错误 -> 非 unsupported（视为 failed，可重试）。
 * 4. 错误消息（小写）含 'vision'/'image'/'multimodal'/
 *    'not support'/'unsupported' -> unsupported。
 * 5. 其它 -> failed。
 *
 * 注：AI SDK 的 streamText 在网络错误时会通过 fullStream 的 error part
 * 抛出 APICallError；其 `isRetryable` 字段也可作为辅助判据，但为保持与
 * 旧仓库行为一致，这里仍以 statusCode + message 为准。
 */
function isVisionUnsupportedError(error: unknown): boolean {
  if (NoSuchModelError.isInstance(error)) {
    return true
  }

  if (APICallError.isInstance(error)) {
    const statusCode = error.statusCode
    // 5xx 服务端错误：视为可重试的 failed
    if (typeof statusCode === 'number' && statusCode >= 500) {
      return false
    }

    // 401/403/429 等：非 vision-unsupported，视为 failed
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      statusCode === 429
    ) {
      return false
    }

    // 400/404/422：通常是请求格式/模型不支持
    if (
      statusCode === 400 ||
      statusCode === 404 ||
      statusCode === 422
    ) {
      return true
    }

    // statusCode 未命中上述但 isRetryable=false 的 APICallError，
    // 仍可能是 vision unsupported，继续走消息匹配
  }

  const message = getErrorMessageText(error).toLowerCase()
  return (
    message.includes('vision') ||
    message.includes('image') ||
    message.includes('multimodal') ||
    message.includes('not support') ||
    message.includes('unsupported')
  )
}

/** 从任意 error 中提取消息文本（兼容 Error / 对象 / 字符串）。 */
function getErrorMessageText(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message
    return typeof msg === 'string' ? msg : ''
  }

  return ''
}

import type { ChatMessage, BilibiliVideoCard } from '../lib/shared-types'
import type { ProviderConfig } from '../lib/shared-types/provider.js'

export type InsightKind = 'understanding' | 'expansion' | 'rerank' | 'clarification'

export type SWMessage =
  | { type: 'chunk'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: unknown }
  // videos 消息携带批次归属（S-3）：
  // batchId 标识这组视频属于哪一次搜索，video_rerank 的重排推送复用同一 batchId，
  // 使 content script 能区分「同批次的重排更新」与「新搜索的新批次」。
  // reranked 标记本次推送是否为重排结果，供 S-4 判断排序优先级；
  // rerankPending 标记当前批次是否确实等待 rerank，供前端延迟视频网格展示。
  | {
      type: 'videos'
      videos: BilibiliVideoCard[]
      batchId?: string
      reranked?: boolean
      rerankPending?: boolean
    }
  | { type: 'insight'; kind: InsightKind; data: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong' }
  | { type: 'title'; conversationId: string; title: string }
  | { type: 'connection_result'; ok: boolean; error?: string }

export type CSMessage =
  | { type: 'chat'; messages: ChatMessage[]; conversationId: string }
  | { type: 'stop' }
  | { type: 'ping' }
  | { type: 'generate_title'; conversationId: string; messages: ChatMessage[] }
  | { type: 'test_connection'; provider: ProviderConfig }

export function isSWMessage(value: unknown): value is SWMessage {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record.type !== 'string') return false

  switch (record.type) {
    case 'chunk':
    case 'reasoning':
      return typeof record.delta === 'string'
    case 'tool_start':
      return typeof record.toolCallId === 'string'
        && typeof record.toolName === 'string'
        && Object.hasOwn(record, 'args')
    case 'tool_result':
      return typeof record.toolCallId === 'string'
        && typeof record.toolName === 'string'
        && Object.hasOwn(record, 'result')
    case 'videos':
      // 批次字段采用向后兼容降级策略（S-3 方案B）：batchId 缺失时不拒绝消息，
      // 由 consumeSWMessage 生成临时 batchId，避免 SW/CS 版本不一致时视频完全不显示。
      // 但字段存在时必须类型合法，防止非法值进入状态层（参考 R-1 的教训）。
      return Array.isArray(record.videos)
        && (record.batchId === undefined
          || (typeof record.batchId === 'string' && record.batchId.length > 0))
        && (record.reranked === undefined || typeof record.reranked === 'boolean')
        && (record.rerankPending === undefined || typeof record.rerankPending === 'boolean')
    case 'insight':
      return ['understanding', 'expansion', 'rerank', 'clarification'].includes(
        String(record.kind),
      ) && Object.hasOwn(record, 'data')
    case 'done':
    case 'pong':
      return true
    case 'error':
      return typeof record.message === 'string'
        && (record.code === undefined || typeof record.code === 'string')
    case 'title':
      // 标题回推消息：conversationId 非空、title 为字符串
      return typeof record.conversationId === 'string'
        && typeof record.title === 'string'
    case 'connection_result':
      // 连接测试结果：ok 必须是 boolean，error 可选但存在时必须是 string
      return typeof record.ok === 'boolean'
        && (record.error === undefined || typeof record.error === 'string')
    default:
      return false
  }
}

export function isCSMessage(value: unknown): value is CSMessage {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record.type !== 'string') return false

  switch (record.type) {
    case 'chat':
      return Array.isArray(record.messages)
        && typeof record.conversationId === 'string'
        && record.conversationId.length > 0
    case 'generate_title':
      // 标题生成请求：conversationId 非空、messages 为数组
      return typeof record.conversationId === 'string'
        && record.conversationId.length > 0
        && Array.isArray(record.messages)
    case 'stop':
    case 'ping':
      return true
    case 'test_connection':
      // 连接测试请求：provider 必须是纯对象（非数组，完整结构校验由 createModel 负责）
      return record.provider !== null
        && typeof record.provider === 'object'
        && !Array.isArray(record.provider)
    default:
      return false
  }
}

type ErrorRecord = Record<string, unknown>

function isErrorRecord(value: unknown): value is ErrorRecord {
  return typeof value === 'object' && value !== null
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (isErrorRecord(error) && typeof error.message === 'string') return error.message
  return String(error)
}

/**
 * 只读取根错误和最多两层 cause，既保留 fetch failed 的底层网络码，
 * 也避免异常对象的循环 cause 或过深链路造成无限遍历。
 */
function collectErrorChain(error: unknown): unknown[] {
  const chain: unknown[] = []
  const visited = new Set<unknown>()
  let current: unknown = error

  for (let depth = 0; depth <= 2; depth += 1) {
    if (visited.has(current)) break
    visited.add(current)
    chain.push(current)

    if (!isErrorRecord(current) || !('cause' in current)) break
    current = current.cause
  }

  return chain
}

function getStructuredNetworkCode(error: unknown): string | undefined {
  if (!isErrorRecord(error)) return undefined
  const rawCode = typeof error.code === 'string'
    ? error.code
    : typeof error.errno === 'string'
      ? error.errno
      : undefined
  if (!rawCode) return undefined

  switch (rawCode.toUpperCase()) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'DNS_ERROR'
    case 'ECONNREFUSED':
      return 'CONNECTION_REFUSED'
    case 'ECONNRESET':
      return 'CONNECTION_RESET'
    case 'ETIMEDOUT':
      return 'TIMEOUT_ERROR'
    case 'EPROTO':
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return 'TLS_ERROR'
    default:
      return undefined
  }
}

function getHttpStatus(error: unknown): number | undefined {
  if (isErrorRecord(error)) {
    const response = isErrorRecord(error.response) ? error.response : undefined
    const candidates = [error.status, error.statusCode, response?.status]
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) {
        return candidate
      }
      if (typeof candidate === 'string' && /^\d{3}$/.test(candidate)) {
        const status = Number(candidate)
        if (status >= 400 && status <= 599) return status
      }
    }
  }

  const message = getErrorMessage(error)
  const match = /\bHTTP\s*(\d{3})\b/i.exec(message)
    ?? /\bstatus(?:\s+code)?\s*[:=]?\s*(\d{3})\b/i.exec(message)
  if (!match) return undefined

  const status = Number(match[1])
  return status >= 400 && status <= 599 ? status : undefined
}

function classifyHttpStatus(status: number): string {
  if (status === 401 || status === 403) return '401'
  if (status === 404) return 'NOT_FOUND_ERROR'
  if (status === 408) return 'TIMEOUT_ERROR'
  if (status === 429) return '429'
  if (status >= 400 && status < 500) return 'CLIENT_ERROR'
  return 'SERVER_ERROR'
}

/**
 * 从 unknown 错误中提取稳定分类。调用方应传入原始异常，
 * 这样 fetch failed 的 cause 中的 Node 错误码不会在入口处丢失。
 */
export function inferErrorCode(error: unknown): string {
  const chain = collectErrorChain(error)

  // 取消/超时优先于普通网络文本，避免 TimeoutError 被归为 NETWORK_ERROR。
  if (chain.some((item) => {
    if (!isErrorRecord(item)) return false
    return item.name === 'AbortError' || item.name === 'TimeoutError'
  })) {
    return 'TIMEOUT_ERROR'
  }

  // 先检查根错误和 cause 链中的结构化 Node 错误码。
  for (const item of chain) {
    const code = getStructuredNetworkCode(item)
    if (code) return code
  }

  // HTTP 状态码只接受 HTTP/status 前缀或结构化 status 字段，避免误读 B 站业务码。
  for (const item of chain) {
    const status = getHttpStatus(item)
    if (status !== undefined) return classifyHttpStatus(status)
  }

  const lower = chain.map(getErrorMessage).join('\n').toLowerCase()
  if (/\b(?:401|403)\b/.test(lower)
    || /\b(?:api[\s_-]*key|authentication|unauthorized|forbidden)\b/.test(lower)) {
    return '401'
  }
  if (/\b429\b/.test(lower)
    || /\b(?:rate[\s_-]*limit|too many requests)\b/.test(lower)) {
    return '429'
  }
  if (/\b(?:timeout|timed out|time out|deadline exceeded)\b/.test(lower)) {
    return 'TIMEOUT_ERROR'
  }
  if (/\b(?:enotfound|eai_again|dns|name resolution|getaddrinfo)\b/.test(lower)) {
    return 'DNS_ERROR'
  }
  if (/\b(?:econnrefused|connection refused|connect refused)\b/.test(lower)) {
    return 'CONNECTION_REFUSED'
  }
  if (/\b(?:econnreset|connection reset|socket hang up)\b/.test(lower)) {
    return 'CONNECTION_RESET'
  }
  if (/\b(?:eproto|tls|ssl|certificate|handshake)\b/.test(lower)) {
    return 'TLS_ERROR'
  }
  if (/(?:provider|base[\s_-]*url|model).*(?:invalid|missing|not configured|unsupported)|(?:invalid|missing|not configured|unsupported).*(?:provider|base[\s_-]*url|model)/.test(lower)) {
    return 'PROVIDER_CONFIG_ERROR'
  }
  if (/\b(?:fetch failed|network|socket|connect)\b/.test(lower)) {
    return 'NETWORK_ERROR'
  }
  return 'UNKNOWN_ERROR'
}

export function friendlyMessage(code: string | undefined, fallback?: string): string {
  const normalized = code === undefined ? '' : code.toLowerCase()
  const generic = '请求失败，请稍后重试'

  if (normalized === 'provider_not_configured') return '请到设置配置 AI 提供商'
  if (normalized === '401' || normalized === '403' || normalized === 'auth' || normalized === 'auth_error') {
    return 'API Key 无效，请检查设置'
  }
  if (normalized === '429' || normalized === 'rate_limit') {
    return '请求太频繁，请稍后重试'
  }
  if (normalized === 'dns_error') return '域名解析失败，请检查 Base URL 或网络'
  if (normalized === 'connection_refused') return '连接被拒绝，请检查 Base URL 或服务状态'
  if (normalized === 'connection_reset') return '连接被重置，请检查网络稳定性'
  if (normalized === 'tls_error') return 'TLS 握手失败，请检查 Base URL 协议或证书'
  if (normalized === 'timeout_error') return '连接超时，请检查网络或稍后重试'
  if (normalized === 'not_found_error') return '模型或接口不存在，请检查模型名或 Base URL'
  if (normalized === 'client_error') return '请求错误，请检查配置'
  if (normalized === 'server_error') return '服务端异常，请稍后重试'
  if (normalized === 'provider_config_error') return 'Provider 配置无效，请检查 Base URL 或模型名'
  if (normalized === 'network_error' || normalized === 'network') {
    return '网络连接失败'
  }
  if (normalized === 'unknown_error') return '请求失败，请稍后重试'
  if (normalized === 'tool_round_limit') {
    return '工具调用次数过多，请换个说法再试'
  }
  if (normalized === 'bilibili_risk') {
    return '触发风控，请稍后再试或登录 B站'
  }
  if (normalized === 'bilibili_api') {
    return 'B站接口异常'
  }
  if (normalized === 'vision_unsupported') {
    return '该模型不支持视觉，已降级'
  }

  if (fallback !== undefined && fallback.length > 0) return fallback
  return generic
}

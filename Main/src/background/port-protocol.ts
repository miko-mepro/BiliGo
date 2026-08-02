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
  // reranked 标记本次推送是否为重排结果，供 S-4 判断排序优先级。
  | { type: 'videos'; videos: BilibiliVideoCard[]; batchId?: string; reranked?: boolean }
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

export function inferErrorCode(message: string): string {
  const lower = message.toLowerCase()
  if (/\b401\b/.test(message) || /\b403\b/.test(message)
    || lower.includes('api key') || lower.includes('auth')) return '401'
  if (/\b429\b/.test(message) || lower.includes('rate limit')) return '429'
  return 'NETWORK_ERROR'
}

export function friendlyMessage(code: string | undefined, fallback?: string): string {
  const normalized = code === undefined ? '' : code.toLowerCase()
  const generic = '请求失败，请稍后重试'

  if (normalized === 'provider_not_configured') return '请到设置配置 AI 提供商'
  if (normalized === '401' || normalized === '403' || normalized === 'auth') {
    return 'API Key 无效，请检查设置'
  }
  if (normalized === '429' || normalized === 'rate_limit') {
    return '请求太频繁，请稍后重试'
  }
  if (normalized === 'network_error' || normalized === 'network') {
    return '网络连接失败'
  }
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

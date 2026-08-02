import { describe, it, expect } from 'vitest'
import {
  isSWMessage,
  isCSMessage,
  inferErrorCode,
  friendlyMessage,
} from '../../src/background/port-protocol.js'

describe('isSWMessage', () => {
  it('accepts all eleven valid SW message formats', () => {
    const cases = [
      { type: 'chunk', delta: '你好' },
      { type: 'reasoning', delta: '分析中' },
      { type: 'tool_start', toolCallId: 'c1', toolName: 'search', args: {} },
      { type: 'tool_result', toolCallId: 'c1', toolName: 'search', result: [] },
      { type: 'videos', videos: [] },
      { type: 'insight', kind: 'understanding', data: {} },
      { type: 'done' },
      { type: 'error', message: '错误', code: '401' },
      { type: 'pong' },
      { type: 'connection_result', ok: true },
      { type: 'connection_result', ok: false, error: '连接失败' },
    ]
    for (const value of cases) {
      expect(isSWMessage(value)).toBe(true)
    }
  })

  it('requires toolCallId toolName and args for tool_start', () => {
    expect(isSWMessage({ type: 'tool_start', toolName: 'x', args: {} })).toBe(false)
    expect(isSWMessage({ type: 'tool_start', toolCallId: 'c1', args: {} })).toBe(false)
    expect(isSWMessage({ type: 'tool_start', toolCallId: 'c1', toolName: 'x' })).toBe(false)
  })

  it('requires toolCallId toolName and result for tool_result', () => {
    expect(isSWMessage({ type: 'tool_result', toolName: 'x', result: [] })).toBe(false)
    expect(isSWMessage({ type: 'tool_result', toolCallId: 'c1', result: [] })).toBe(false)
    expect(isSWMessage({ type: 'tool_result', toolCallId: 'c1', toolName: 'x' })).toBe(false)
  })

  it('rejects an unknown insight kind', () => {
    expect(isSWMessage({ type: 'insight', kind: 'other', data: {} })).toBe(false)
  })

  it('rejects malformed required fields', () => {
    expect(isSWMessage({ type: 'chunk', delta: 123 })).toBe(false)
    expect(isSWMessage({ type: 'videos', videos: 'not-array' })).toBe(false)
    expect(isSWMessage({ type: 'error', message: 'x', code: 123 })).toBe(false)
  })

  // S-3：videos 消息的批次字段校验，采用向后兼容降级策略
  describe('videos 批次字段校验（S-3）', () => {
    it('接受携带 batchId 与 reranked 的完整批次消息', () => {
      expect(
        isSWMessage({ type: 'videos', videos: [], batchId: 'search_c1', reranked: true }),
      ).toBe(true)
    })

    it('batchId 缺失时仍接受（向后兼容旧版本 SW 推送）', () => {
      expect(isSWMessage({ type: 'videos', videos: [] })).toBe(true)
    })

    it('batchId 为空字符串时拒绝（存在但非法）', () => {
      expect(isSWMessage({ type: 'videos', videos: [], batchId: '' })).toBe(false)
    })

    it('batchId 类型非法时拒绝', () => {
      expect(isSWMessage({ type: 'videos', videos: [], batchId: 123 })).toBe(false)
      expect(isSWMessage({ type: 'videos', videos: [], batchId: null })).toBe(false)
    })

    it('reranked 类型非法时拒绝', () => {
      expect(isSWMessage({ type: 'videos', videos: [], batchId: 'b1', reranked: 'yes' })).toBe(
        false,
      )
    })

    it('reranked 缺省时接受', () => {
      expect(isSWMessage({ type: 'videos', videos: [], batchId: 'b1' })).toBe(true)
    })
  })

  it('requires boolean ok and optional string error for connection_result', () => {    expect(isSWMessage({ type: 'connection_result', ok: 'true' })).toBe(false)
    expect(isSWMessage({ type: 'connection_result', ok: 1 })).toBe(false)
    expect(isSWMessage({ type: 'connection_result', ok: true, error: 123 })).toBe(false)
    expect(isSWMessage({ type: 'connection_result' })).toBe(false)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'string'],
    ['number', 123],
    ['array', []],
    ['empty object', {}],
    ['unknown type', { type: 'unknown' }],
  ])('rejects primitives null arrays and unknown types: %s', (_label, value) => {
    expect(isSWMessage(value)).toBe(false)
  })
})

describe('isCSMessage', () => {
  it('accepts chat stop and ping', () => {
    expect(isCSMessage({ type: 'chat', messages: [], conversationId: 'conv_1' })).toBe(true)
    expect(isCSMessage({ type: 'stop' })).toBe(true)
    expect(isCSMessage({ type: 'ping' })).toBe(true)
  })

  it.each([
    ['missing messages', { type: 'chat', conversationId: 'c1' }],
    ['missing conversationId', { type: 'chat', messages: [] }],
    ['empty conversationId', { type: 'chat', messages: [], conversationId: '' }],
  ])('rejects malformed chat messages: %s', (_label, value) => {
    expect(isCSMessage(value)).toBe(false)
  })

  it('accepts test_connection with a provider object', () => {
    expect(isCSMessage({
      type: 'test_connection',
      provider: { id: 'deepseek', name: 'DeepSeek', format: 'openai', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-xxx', model: 'deepseek-chat', isBuiltIn: true, isCustom: false }
    })).toBe(true)
  })

  it.each([
    ['missing provider', { type: 'test_connection' }],
    ['null provider', { type: 'test_connection', provider: null }],
    ['string provider', { type: 'test_connection', provider: 'deepseek' }],
    ['array provider', { type: 'test_connection', provider: [] }],
  ])('rejects malformed test_connection messages: %s', (_label, value) => {
    expect(isCSMessage(value)).toBe(false)
  })
})

describe('inferErrorCode', () => {
  it.each([
    'HTTP 401 Unauthorized',
    'HTTP 403 Forbidden',
    'Invalid API key',
    'Authentication failed',
  ])('normalizes 401 403 api-key and auth signals to 401: %s', (message) => {
    expect(inferErrorCode(message)).toBe('401')
  })

  it.each([
    'HTTP 429 Too Many Requests',
    'Rate limit exceeded',
  ])('infers 429 from status or rate-limit text: %s', (message) => {
    expect(inferErrorCode(message)).toBe('429')
  })

  it.each([
    'timeout',
    'fetch failed',
    'unknown error',
  ])('uses NETWORK_ERROR for unmatched failures: %s', (message) => {
    expect(inferErrorCode(message)).toBe('NETWORK_ERROR')
  })
})

describe('friendlyMessage', () => {
  it.each([
    ['PROVIDER_NOT_CONFIGURED', undefined, '请到设置配置 AI 提供商'],
    ['401', undefined, 'API Key 无效，请检查设置'],
    ['429', undefined, '请求太频繁，请稍后重试'],
    ['NETWORK_ERROR', undefined, '网络连接失败'],
    ['TOOL_ROUND_LIMIT', undefined, '工具调用次数过多，请换个说法再试'],
    ['BILIBILI_RISK', undefined, '触发风控，请稍后再试或登录 B站'],
    ['BILIBILI_API', undefined, 'B站接口异常'],
    ['VISION_UNSUPPORTED', undefined, '该模型不支持视觉，已降级'],
  ])('maps known codes to stable Chinese messages: %s', (code, fallback, expected) => {
    expect(friendlyMessage(code, fallback)).toBe(expected)
  })

  it('uses the supplied fallback for unknown codes', () => {
    expect(friendlyMessage('unknown_code', '自定义错误')).toBe('自定义错误')
  })

  it('uses a generic fallback when no message is available', () => {
    expect(friendlyMessage('unknown_code', undefined)).toBe('请求失败，请稍后重试')
    expect(friendlyMessage('unknown_code', '')).toBe('请求失败，请稍后重试')
  })
})

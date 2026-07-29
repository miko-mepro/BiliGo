import { describe, it, expect } from 'vitest'
import { sanitize } from '../../../src/lib/shared-types/sanitize.js'

describe('sanitize', () => {
  // 原始值/null/undefined 透传
  it('透传 null', () => {
    expect(sanitize(null)).toBeNull()
  })

  it('透传 undefined', () => {
    expect(sanitize(undefined)).toBeUndefined()
  })

  it('透传字符串', () => {
    expect(sanitize('hello')).toBe('hello')
  })

  it('透传数字', () => {
    expect(sanitize(42)).toBe(42)
  })

  it('透传布尔值', () => {
    expect(sanitize(true)).toBe(true)
  })

  // 敏感键脱敏（精确匹配 + 大小写不敏感）
  it('脱敏 cookie', () => {
    expect(sanitize({ Cookie: 'secret' })).toEqual({ Cookie: '[REDACTED]' })
  })

  it('脱敏 authorization（大小写混合）', () => {
    expect(sanitize({ Authorization: 'Bearer token123' })).toEqual({ Authorization: '[REDACTED]' })
  })

  it('脱敏 sessdata', () => {
    expect(sanitize({ SESSDATA: 'abc123' })).toEqual({ SESSDATA: '[REDACTED]' })
  })

  it('脱敏 set-cookie', () => {
    expect(sanitize({ 'set-cookie': 'x=y' })).toEqual({ 'set-cookie': '[REDACTED]' })
  })

  it('脱敏 x-install-id', () => {
    expect(sanitize({ 'x-install-id': 'uuid' })).toEqual({ 'x-install-id': '[REDACTED]' })
  })

  it('脱敏 install-id', () => {
    expect(sanitize({ 'install-id': 'uuid' })).toEqual({ 'install-id': '[REDACTED]' })
  })

  it('脱敏 installid', () => {
    expect(sanitize({ installid: 'uuid' })).toEqual({ installid: '[REDACTED]' })
  })

  it('脱敏 x-openrouter-api-key', () => {
    expect(sanitize({ 'x-openrouter-api-key': 'key' })).toEqual({ 'x-openrouter-api-key': '[REDACTED]' })
  })

  // 新增敏感键变体
  it('脱敏 apikey', () => {
    expect(sanitize({ apikey: 'sk-xxx' })).toEqual({ apikey: '[REDACTED]' })
  })

  it('脱敏 ApiKey（大小写混合）', () => {
    expect(sanitize({ ApiKey: 'sk-xxx' })).toEqual({ ApiKey: '[REDACTED]' })
  })

  it('脱敏 api-key', () => {
    expect(sanitize({ 'api-key': 'sk-xxx' })).toEqual({ 'api-key': '[REDACTED]' })
  })

  it('脱敏 api_key', () => {
    expect(sanitize({ api_key: 'sk-xxx' })).toEqual({ api_key: '[REDACTED]' })
  })

  it('脱敏 x-api-key', () => {
    expect(sanitize({ 'x-api-key': 'sk-xxx' })).toEqual({ 'x-api-key': '[REDACTED]' })
  })

  it('脱敏 x-goog-api-key', () => {
    expect(sanitize({ 'x-goog-api-key': 'key' })).toEqual({ 'x-goog-api-key': '[REDACTED]' })
  })

  it('脱敏 proxy-authorization', () => {
    expect(sanitize({ 'proxy-authorization': 'Basic xyz' })).toEqual({ 'proxy-authorization': '[REDACTED]' })
  })

  // 非敏感键保留
  it('保留非敏感键', () => {
    const input = { name: 'test', count: 5, active: true }
    expect(sanitize(input)).toEqual(input)
  })

  it('保留非敏感键（含 apiKeyHint 不误判）', () => {
    expect(sanitize({ apiKeyHint: 'my-hint' })).toEqual({ apiKeyHint: 'my-hint' })
  })

  // 嵌套对象
  it('递归脱敏嵌套对象', () => {
    const input = {
      user: { name: 'alice', cookie: 'secret' },
      meta: { authorization: 'Bearer x' },
    }
    expect(sanitize(input)).toEqual({
      user: { name: 'alice', cookie: '[REDACTED]' },
      meta: { authorization: '[REDACTED]' },
    })
  })

  it('递归脱敏深层嵌套', () => {
    const input = { a: { b: { c: { apikey: 'deep' } } } }
    expect(sanitize(input)).toEqual({ a: { b: { c: { apikey: '[REDACTED]' } } } })
  })

  // 数组内对象
  it('脱敏数组内对象', () => {
    const input = { items: [{ name: 'a', cookie: 'x' }, { name: 'b', apikey: 'y' }] }
    expect(sanitize(input)).toEqual({
      items: [{ name: 'a', cookie: '[REDACTED]' }, { name: 'b', apikey: '[REDACTED]' }],
    })
  })

  it('脱敏数组内嵌套对象', () => {
    const input = { items: [{ meta: { authorization: 'Bearer x' } }] }
    expect(sanitize(input)).toEqual({
      items: [{ meta: { authorization: '[REDACTED]' } }],
    })
  })

  // 循环引用不栈溢出
  it('循环引用返回 [Circular]', () => {
    const obj: Record<string, unknown> = { name: 'test' }
    obj.self = obj
    const result = sanitize(obj) as Record<string, unknown>
    expect(result.name).toBe('test')
    expect(result.self).toBe('[Circular]')
  })

  it('循环引用在嵌套中返回 [Circular]', () => {
    const child: Record<string, unknown> = { cookie: 'secret' }
    const parent: Record<string, unknown> = { child }
    child.parent = parent
    const result = sanitize(parent) as Record<string, unknown>
    const childResult = result.child as Record<string, unknown>
    expect(childResult.cookie).toBe('[REDACTED]')
    expect(childResult.parent).toBe('[Circular]')
  })

  it('空对象返回空对象', () => {
    expect(sanitize({})).toEqual({})
  })

  it('空数组返回空数组', () => {
    expect(sanitize([])).toEqual([])
  })
})
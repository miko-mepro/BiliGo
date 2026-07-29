import type { LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import type { ProviderConfig } from '../lib/shared-types/provider.js'

export function createModel(config: ProviderConfig): LanguageModel {
  switch (config.format) {
    case 'openai':
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      }).chat(config.model)
    case 'anthropic':
      return createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      }).chat(config.model)
    case 'gemini':
      return createGoogle({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      }).chat(config.model)
    default:
      throw new Error(`Unsupported provider format: ${String((config as { format?: unknown }).format)}`)
  }
}

export function validateProviderConfig(config: ProviderConfig): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (config.id !== 'ollama') {
    if (!config.apiKey || config.apiKey.trim() === '') {
      errors.push('API Key 不能为空')
    }
    // 校验 apiKey 仅含可打印 ASCII 字符，防 header 换行注入
    if (config.apiKey && !/^[\x21-\x7E]+$/.test(config.apiKey)) {
      errors.push('API Key 含非法字符')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

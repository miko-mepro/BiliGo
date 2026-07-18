import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  BUILT_IN_PROVIDERS,
  type BuiltInProviderId,
  type ApiFormat,
  type ProviderConfig,
} from '../../src/lib/shared-types/provider.js'

const openaiMocks = vi.hoisted(() => ({
  createOpenAI: vi.fn(() => ({ chat: vi.fn(() => 'mock-model-openai') })),
}))
const anthropicMocks = vi.hoisted(() => ({
  createAnthropic: vi.fn(() => ({ chat: vi.fn(() => 'mock-model-anthropic') })),
}))
const googleMocks = vi.hoisted(() => ({
  createGoogle: vi.fn(() => ({ chat: vi.fn(() => 'mock-model-gemini') })),
}))

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: openaiMocks.createOpenAI }))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: anthropicMocks.createAnthropic }))
vi.mock('@ai-sdk/google', () => ({ createGoogle: googleMocks.createGoogle }))

import { createModel, validateProviderConfig } from '../../src/config/provider-factory.js'

function provider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'openai',
    name: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4',
    isBuiltIn: true,
    isCustom: false,
    ...overrides,
  }
}

const openAICompatibleCases: ReadonlyArray<BuiltInProviderId> = [
  'deepseek',
  'moonshot',
  'zhipu',
  'qwen',
  'openrouter',
  'ollama',
]

const expectedBuiltIns: ReadonlyArray<{
  id: BuiltInProviderId
  format: ApiFormat
  baseUrl: string
}> = [
  { id: 'openai', format: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', format: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'gemini', format: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'deepseek', format: 'openai', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'moonshot', format: 'openai', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'zhipu', format: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'qwen', format: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'openrouter', format: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'ollama', format: 'openai', baseUrl: 'http://localhost:11434/v1' },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createModel', () => {
  it('creates an OpenAI model for openai format', () => {
    const config = provider({ format: 'openai' })

    const result = createModel(config)

    expect(result).toBe('mock-model-openai')
    expect(openaiMocks.createOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      baseURL: 'https://api.openai.com/v1',
    })
    expect(anthropicMocks.createAnthropic).not.toHaveBeenCalled()
    expect(googleMocks.createGoogle).not.toHaveBeenCalled()
  })

  it.each(openAICompatibleCases)(
    'uses createOpenAI for %s without rewriting baseURL',
    (id) => {
      const info = BUILT_IN_PROVIDERS[id]
      const config = provider({
        id,
        name: info.name,
        format: info.format,
        baseUrl: info.baseUrl,
      })

      const result = createModel(config)

      expect(result).toBe('mock-model-openai')
      expect(openaiMocks.createOpenAI).toHaveBeenCalledWith({
        apiKey: config.apiKey,
        baseURL: info.baseUrl,
      })
      expect(anthropicMocks.createAnthropic).not.toHaveBeenCalled()
      expect(googleMocks.createGoogle).not.toHaveBeenCalled()
    },
  )

  it('creates an Anthropic model for anthropic format', () => {
    const config = provider({
      format: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
    })

    const result = createModel(config)

    expect(result).toBe('mock-model-anthropic')
    expect(anthropicMocks.createAnthropic).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      baseURL: 'https://api.anthropic.com/v1',
    })
    expect(openaiMocks.createOpenAI).not.toHaveBeenCalled()
    expect(googleMocks.createGoogle).not.toHaveBeenCalled()
  })

  it('creates a Google model for gemini format', () => {
    const config = provider({
      format: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    })

    const result = createModel(config)

    expect(result).toBe('mock-model-gemini')
    expect(googleMocks.createGoogle).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    })
    expect(openaiMocks.createOpenAI).not.toHaveBeenCalled()
    expect(anthropicMocks.createAnthropic).not.toHaveBeenCalled()
  })
})

describe('validateProviderConfig', () => {
  it('rejects an empty or whitespace API key for non-Ollama providers', () => {
    const emptyKey = validateProviderConfig(provider({ apiKey: '' }))
    expect(emptyKey.valid).toBe(false)
    expect(emptyKey.errors.some((e) => e.includes('API Key'))).toBe(true)

    const whitespaceKey = validateProviderConfig(provider({ apiKey: '   ' }))
    expect(whitespaceKey.valid).toBe(false)
    expect(whitespaceKey.errors.some((e) => e.includes('API Key'))).toBe(true)
  })

  it('allows an empty API key for built-in Ollama', () => {
    const config = provider({
      id: 'ollama',
      name: 'Ollama 本地',
      format: 'openai',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
    })

    const result = validateProviderConfig(config)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})

describe('built-ins', () => {
  it('preserves all nine exact built-in base URLs', () => {
    const ids = Object.keys(BUILT_IN_PROVIDERS) as BuiltInProviderId[]
    expect(ids).toHaveLength(9)
    expect(new Set(ids)).toEqual(new Set(expectedBuiltIns.map((e) => e.id)))

    for (const expected of expectedBuiltIns) {
      const info = BUILT_IN_PROVIDERS[expected.id]
      expect(info.id).toBe(expected.id)
      expect(info.format).toBe(expected.format)
      expect(info.baseUrl).toBe(expected.baseUrl)
      expect(info.isBuiltIn).toBe(true)
      expect(info.isCustom).toBe(false)
    }
  })
})

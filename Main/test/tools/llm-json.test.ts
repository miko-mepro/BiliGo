import { describe, it, expect, vi, beforeEach } from 'vitest'

const aiMocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
}))

vi.mock('ai', () => ({
  generateObject: aiMocks.generateObject,
  generateText: aiMocks.generateText,
}))

const settingsMocks = vi.hoisted(() => ({
  readBiliAgentSettings: vi.fn(),
}))

vi.mock('../../src/config/settings.js', () => ({
  readBiliAgentSettings: settingsMocks.readBiliAgentSettings,
}))

const factoryMocks = vi.hoisted(() => ({
  createModel: vi.fn(),
}))

vi.mock('../../src/config/provider-factory.js', () => ({
  createModel: factoryMocks.createModel,
}))

import { parseJsonFromText, callLlmForJson } from '../../src/tools/llm-json.js'
import { z } from 'zod'
import type { ChatMessage } from '../../src/lib/shared-types/index.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseJsonFromText', () => {
  it('parses plain JSON', () => {
    expect(parseJsonFromText('{"a":1}')).toEqual({ a: 1 })
  })

  it('strips markdown json code fences', () => {
    expect(parseJsonFromText('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('extracts JSON embedded in surrounding prose', () => {
    expect(parseJsonFromText('这是结果：{"a":1} 完成')).toEqual({ a: 1 })
  })

  it('returns null when no JSON is present', () => {
    expect(parseJsonFromText('no json here')).toBeNull()
  })

  it('returns null when only an opening brace is present', () => {
    expect(parseJsonFromText('{ incomplete')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseJsonFromText('')).toBeNull()
  })

  it('returns null for non-JSON content between braces', () => {
    expect(parseJsonFromText('{invalid json}')).toBeNull()
  })

  it('parses nested JSON objects', () => {
    expect(parseJsonFromText('{"a":{"b":2}}')).toEqual({ a: { b: 2 } })
  })

  it('returns null for multiple adjacent objects (overall invalid)', () => {
    expect(parseJsonFromText('{"a":1} {"b":2}')).toBeNull()
  })
})

describe('callLlmForJson fallback path', () => {
  function makeMessages(content: string): ChatMessage[] {
    return [{ role: 'user', content, timestamp: 0 }]
  }

  function setupActiveProvider() {
    settingsMocks.readBiliAgentSettings.mockResolvedValue({
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          format: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-4',
          isBuiltIn: true,
          isCustom: false,
        },
      ],
      activeProviderId: 'openai',
      themeMode: 'auto',
    })
    factoryMocks.createModel.mockReturnValue({} as any)
  }

  it('returns null when no active provider is configured', async () => {
    settingsMocks.readBiliAgentSettings.mockResolvedValue({
      providers: [],
      activeProviderId: null,
      themeMode: 'auto',
    })
    const result = await callLlmForJson(makeMessages('hi'))
    expect(result).toBeNull()
    expect(aiMocks.generateObject).not.toHaveBeenCalled()
    expect(aiMocks.generateText).not.toHaveBeenCalled()
  })

  it('falls back to generateText + parseJsonFromText when generateObject throws', async () => {
    setupActiveProvider()
    aiMocks.generateObject.mockRejectedValue(new Error('unsupported'))
    aiMocks.generateText.mockResolvedValue({ text: '```json\n{"x":1}\n```' })

    const result = await callLlmForJson(makeMessages('hi'), z.object({ x: z.number() }))

    expect(aiMocks.generateObject).toHaveBeenCalledTimes(1)
    expect(aiMocks.generateText).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ x: 1 })
  })

  it('falls back to generateText when no schema is provided', async () => {
    setupActiveProvider()
    aiMocks.generateText.mockResolvedValue({ text: '{"k":"v"}' })

    const result = await callLlmForJson(makeMessages('hi'))

    expect(aiMocks.generateObject).not.toHaveBeenCalled()
    expect(aiMocks.generateText).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ k: 'v' })
  })

  it('returns null when generateText returns empty text', async () => {
    setupActiveProvider()
    aiMocks.generateText.mockResolvedValue({ text: '   ' })

    const result = await callLlmForJson(makeMessages('hi'))

    expect(result).toBeNull()
  })

  it('passes system message via system option and excludes it from messages', async () => {
    setupActiveProvider()
    aiMocks.generateText.mockResolvedValue({ text: '{"ok":true}' })

    await callLlmForJson([
      { role: 'system', content: 'be strict', timestamp: 0 },
      { role: 'user', content: 'q', timestamp: 0 },
    ])

    const callOpts = aiMocks.generateText.mock.calls[0][0]
    expect(callOpts.system).toBe('be strict')
    expect(callOpts.messages).toHaveLength(1)
    expect(callOpts.messages[0].role).toBe('user')
  })
})

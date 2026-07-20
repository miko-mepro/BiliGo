import { generateObject, generateText } from 'ai'
import type { ModelMessage } from 'ai'
import { z } from 'zod'
import type { ChatMessage } from '../lib/shared-types/index.js'
import type { ProviderConfig } from '../lib/shared-types/provider.js'
import { readBiliAgentSettings } from '../config/settings.js'
import { createModel } from '../config/provider-factory.js'

/**
 * 调用 LLM 并解析为 JSON 对象。
 *
 * 优先使用 AI SDK `generateObject`（当传入 zod schema 时），借助 schema 校验直接拿到
 * 结构化对象；若 provider 不支持 `generateObject`、未传 schema、或调用抛出任何异常，
 * 降级到 `generateText` + `parseJsonFromText` 容错解析。
 *
 * 任何失败路径都返回 null，绝不向调用方抛出异常（见 3.3 §8.1）。
 *
 * @param messages 对话消息列表，可包含至多一条 role='system' 消息；system 消息会
 *   通过 `generateObject`/`generateText` 的 `system` 参数单独传入，不会进入
 *   `messages`（与 SW 端 streamText 行为一致，见 3.3 §9 约束）。
 * @param schema 可选的 zod schema；传入则触发 `generateObject` 优先路径。
 */
export async function callLlmForJson<T>(
  messages: ChatMessage[],
  schema?: z.Schema<T>,
): Promise<T | null> {
  try {
    const settings = await readBiliAgentSettings()
    if (!settings.activeProviderId) return null

    const config = resolveActiveProvider(settings.providers, settings.activeProviderId)
    if (!config || !config.model) return null

    const model = createModel(config)
    const { system, rest } = splitSystemMessage(messages)
    const modelMessages = toModelMessages(rest)

    if (schema) {
      const object = await tryGenerateObject<T>(model, schema, modelMessages, system)
      if (object !== null) return object
    }

    const text = await tryGenerateText(model, modelMessages, system)
    if (text === null) return null
    if (text.trim() === '') return null

    const parsed = parseJsonFromText(text)
    return (parsed as T | null) ?? null
  } catch {
    return null
  }
}

/**
 * 从 LLM 文本输出中容错提取 JSON 对象（见 3.3 §8.2）。
 *
 * 步骤：
 * 1. trim 后去除 markdown 代码块包裹（` ```json ` 头 / ` ``` ` 尾）；
 * 2. 定位第一个 `{` 到最后一个 `}`，slice 出候选子串；
 * 3. `JSON.parse` 解析，失败返回 null。
 *
 * @returns 解析得到的对象，或 null（输入不含可解析 JSON 时）。
 */
export function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim()

  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()

  const firstBrace = stripped.indexOf('{')
  const lastBrace = stripped.lastIndexOf('}')

  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    return null
  }

  const candidate = stripped.slice(firstBrace, lastBrace + 1)

  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function resolveActiveProvider(
  providers: ProviderConfig[],
  activeProviderId: string | null,
): ProviderConfig | null {
  if (!activeProviderId) return null
  return providers.find((p) => p.id === activeProviderId) ?? null
}

function splitSystemMessage(
  messages: ChatMessage[],
): { system: string | undefined; rest: ChatMessage[] } {
  const systemMsg = messages.find((m) => m.role === 'system')
  if (!systemMsg) return { system: undefined, rest: messages }
  return {
    system: systemMsg.content,
    rest: messages.filter((m) => m.role !== 'system'),
  }
}

function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  const converted = messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
    ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
  }))
  return converted as unknown as ModelMessage[]
}

async function tryGenerateObject<T>(
  model: ReturnType<typeof createModel>,
  schema: z.Schema<T>,
  messages: ModelMessage[],
  system: string | undefined,
): Promise<T | null> {
  try {
    // zod 4 的 z.Schema<T> 等价于 $ZodType，运行时被 generateObject 当作
    // FlexibleSchema 处理；类型层面因 SCHEMA 泛型不协变（FlexibleSchema<unknown>
    // 要求 schema 泛型为 unknown，而此处是 T），需用断言桥接 options 对象。
    const options = {
      model,
      schema,
      messages,
      ...(system ? { system } : {}),
    } as unknown as Parameters<typeof generateObject>[0]
    const result = await generateObject(options)
    return result.object as T
  } catch {
    return null
  }
}

async function tryGenerateText(
  model: ReturnType<typeof createModel>,
  messages: ModelMessage[],
  system: string | undefined,
): Promise<string | null> {
  try {
    const result = await generateText({
      model,
      messages,
      ...(system ? { system } : {}),
    })
    return result.text
  } catch {
    return null
  }
}

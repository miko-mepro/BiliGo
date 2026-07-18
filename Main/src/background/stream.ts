/// <reference types="@types/chrome" />

import { streamText, isStepCount } from 'ai'
import type { ModelMessage, LanguageModel, ToolSet, TextStreamPart } from 'ai'
import type { ChatMessage } from '../lib/shared-types/index.js'
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
  const tools = {} as ToolSet

  const abortController = new AbortController()
  session.abortController = abortController

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: isStepCount(5),
    abortSignal: abortController.signal,
  })

  try {
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
          postToPort(port, session, {
            type: 'tool_start',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
          })
          break
        case 'tool-result':
          postToPort(port, session, {
            type: 'tool_result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.output,
          })
          break
        case 'tool-error': {
          const errorText = String(part.error)
          const code = inferErrorCode(errorText)
          postToPort(port, session, {
            type: 'error',
            message: friendlyMessage(code, errorText),
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
          void handleChatMessage(port, session, msg)
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

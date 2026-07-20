import type { ClarificationRequest, WorkingMemory } from '../lib/shared-types/index.js'

/**
 * ask_clarification 工具的输入参数（3.3 §7 / 3.1 §8 T11）。
 *
 * - question: 向用户提出的澄清问题，简短聚焦，必填。
 * - options: 可选预设答案列表；非空时 UI 渲染为可点击按钮（一键回复）。
 * - reason: UI 解释为什么追问，必填；当调用方传入空字符串时回退为 'Need clarification'。
 */
export interface AskClarificationInput {
  question: string
  options?: string[]
  reason: string
}

/**
 * ask_clarification 的依赖注入接口。
 *
 * 设计为依赖注入而非直接 import WorkingMemoryStore，以便单测可替换内存
 * 实现，并避免在测试中污染 chrome.storage.session。SC-1 等上层编排将
 * 传入真实的 WorkingMemoryStore 单例。
 */
export interface AskClarificationDeps {
  memoryStore: {
    get(traceId: string): Promise<WorkingMemory | undefined>
    update(
      traceId: string,
      patch: Partial<WorkingMemory>,
    ): Promise<WorkingMemory | undefined>
  }
}

/**
 * ask_clarification 工具的执行体（3.3 §7）。
 *
 * 行为契约：
 * 1. 若 question 为空（`undefined` / `null` / 空串 / 仅空白）抛出
 *    `Error("ask_clarification requires a question argument")`。
 * 2. 从 WorkingMemoryStore 读取当前 clarificationCount，+1 后回写
 *    （每会话最多 1 次由 system prompt 软约束 + memoryStore 硬约束）。
 * 3. 返回 ClarificationRequest `{ question, options?, reason }`。
 *    - options 过滤掉非字符串项后透传；过滤后为空数组则置为 undefined。
 *    - reason 为空字符串时回退为 'Need clarification'。
 *
 * 注意：insight 推送（postToPort）由 SC-1 统一完成，本函数不负责。
 *
 * @param input 工具输入参数
 * @param deps 依赖注入（memoryStore）
 * @param traceId 当前会话追踪 ID（对应 WorkingMemoryStore 的 key）
 * @returns 构造好的 ClarificationRequest 对象
 */
export async function askClarification(
  input: AskClarificationInput,
  deps: AskClarificationDeps,
  traceId: string,
): Promise<ClarificationRequest> {
  if (!input.question || input.question.trim() === '') {
    throw new Error('ask_clarification requires a question argument')
  }

  const existing = await deps.memoryStore.get(traceId)
  const count = (existing?.clarificationCount ?? 0) + 1
  await deps.memoryStore.update(traceId, { clarificationCount: count })

  const options = input.options
    ? input.options.filter((o): o is string => typeof o === 'string')
    : undefined

  return {
    question: input.question,
    ...(options && options.length > 0 ? { options } : {}),
    reason: input.reason || 'Need clarification',
  }
}

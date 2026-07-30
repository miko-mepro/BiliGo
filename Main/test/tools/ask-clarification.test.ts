import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  askClarification,
  type AskClarificationDeps,
  type AskClarificationInput,
} from '../../src/tools/ask-clarification.js'
import type {
  ClarificationRequest,
  WorkingMemory,
} from '../../src/lib/shared-types/index.js'

/**
 * ask_clarification 工具单测（工厂函数注入依赖模式）。
 *
 * 参照 test/tools/slang-understand.test.ts / test/tools/query-expand.test.ts 的
 * 工厂函数注入依赖模式：通过 AskClarificationDeps.memoryStore 注入 mock 内存实现，
 * 避免在测试中污染 chrome.storage.session。
 *
 * 覆盖点（与任务要求对齐）：
 * 1. execute 正常路径（返回 ClarificationRequest）
 * 2. 依赖抛错降级路径（memoryStore.get/update 抛错时 askClarification 的行为）
 */

/**
 * 构造 mock memoryStore，记录 get/update 调用。
 *
 * @param existing 初始 WorkingMemory（默认空会话状态）
 */
function createMemoryStore(
  existing?: Partial<WorkingMemory>,
): AskClarificationDeps['memoryStore'] & {
  getMock: ReturnType<typeof vi.fn>
  updateMock: ReturnType<typeof vi.fn>
} {
  const store: WorkingMemory = {
    traceId: 'trace-1',
    triedKeywords: existing?.triedKeywords ?? [],
    rejectedBvids: existing?.rejectedBvids ?? [],
    failureReasons: existing?.failureReasons ?? [],
    clarificationCount: existing?.clarificationCount ?? 0,
  }
  const getMock = vi.fn(async () => ({ ...store }))
  const updateMock = vi.fn(async (patch: Partial<WorkingMemory>) => {
    Object.assign(store, patch)
    return { ...store }
  })
  return {
    get: getMock,
    update: updateMock,
    getMock,
    updateMock,
  }
}

/** 最小合法输入。 */
function makeInput(overrides: Partial<AskClarificationInput> = {}): AskClarificationInput {
  return {
    question: '你想要鬼畜还是教程？',
    options: ['鬼畜', '教程'],
    reason: '意图模糊',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ask_clarification / 正常路径', () => {
  it('1) execute 正常路径返回 ClarificationRequest', async () => {
    const memoryStore = createMemoryStore({ clarificationCount: 0 })

    const result = await askClarification(makeInput(), { memoryStore }, 'trace-1')

    // 返回 ClarificationRequest，结构 { question, options?, reason }
    expect(result).toEqual<ClarificationRequest>({
      question: '你想要鬼畜还是教程？',
      options: ['鬼畜', '教程'],
      reason: '意图模糊',
    })

    // memoryStore.get 被调用一次，读取现有 clarificationCount
    expect(memoryStore.getMock).toHaveBeenCalledTimes(1)
    expect(memoryStore.getMock).toHaveBeenCalledWith('trace-1')

    // memoryStore.update 被调用，将 clarificationCount 从 0 +1 到 1
    expect(memoryStore.updateMock).toHaveBeenCalledTimes(1)
    expect(memoryStore.updateMock).toHaveBeenCalledWith('trace-1', {
      clarificationCount: 1,
    })
  })

  it('1b) 已有 clarificationCount=1 时，+1 后回写为 2', async () => {
    const memoryStore = createMemoryStore({ clarificationCount: 1 })

    const result = await askClarification(makeInput(), { memoryStore }, 'trace-1')

    expect(result).toBeDefined()
    expect(memoryStore.updateMock).toHaveBeenCalledWith('trace-1', {
      clarificationCount: 2,
    })
  })

  it('1c) options 缺省/空数组时返回对象不含 options 字段', async () => {
    const memoryStore = createMemoryStore()

    // options 缺省
    const resultNoOptions = await askClarification(
      { question: '想看什么？', reason: '需要澄清' },
      { memoryStore },
      'trace-1',
    )
    expect(resultNoOptions.options).toBeUndefined()
    expect(resultNoOptions).toEqual<ClarificationRequest>({
      question: '想看什么？',
      reason: '需要澄清',
    })

    // options 为空数组 -> 转为 undefined（源码 line 70-71）
    const resultEmptyOptions = await askClarification(
      { question: '想看什么？', options: [], reason: '需要澄清' },
      { memoryStore },
      'trace-1',
    )
    expect(resultEmptyOptions.options).toBeUndefined()
  })

  it('1d) reason 为空字符串时回退为 "Need clarification"', async () => {
    const memoryStore = createMemoryStore()

    const result = await askClarification(
      { question: '想看什么？', reason: '' },
      { memoryStore },
      'trace-1',
    )

    // 源码 line 72: reason: input.reason || 'Need clarification'
    expect(result.reason).toBe('Need clarification')
  })

  it('1e) question 为空时抛 "ask_clarification requires a question argument"', async () => {
    const memoryStore = createMemoryStore()

    await expect(
      askClarification(
        { question: '', reason: 'r' },
        { memoryStore },
        'trace-1',
      ),
    ).rejects.toThrow('ask_clarification requires a question argument')

    // 抛错前不应访问 memoryStore
    expect(memoryStore.getMock).not.toHaveBeenCalled()
    expect(memoryStore.updateMock).not.toHaveBeenCalled()
  })

  it('1f) options 过滤非字符串项后透传', async () => {
    const memoryStore = createMemoryStore()

    // 混入数字和对象（非字符串项应被过滤）
    const result = await askClarification(
      {
        question: '选哪个？',
        options: ['鬼畜', 123, '教程', { x: 1 } as unknown as string, null as unknown as string],
        reason: '模糊',
      },
      { memoryStore },
      'trace-1',
    )

    // 源码 line 65-67: filter((o): o is string => typeof o === 'string')
    expect(result.options).toEqual(['鬼畜', '教程'])
  })
})

describe('ask_clarification / 依赖抛错降级路径', () => {
  /**
   * ask_clarification 本身没有 try-catch 包裹 memoryStore 调用；
   * memoryStore.get/update 抛错时会直接向上传播。
   * 上层编排（SC-1 stream.ts）的 catch 会把异常转为 error 消息。
   *
   * 本测试验证：依赖抛错时 askClarification 的 reject 行为符合预期，
   * 即错误不被吞没、上层可捕获并降级。
   */
  it('2a) memoryStore.get 抛错时 askClarification reject（不吞错）', async () => {
    const memoryStore = createMemoryStore()
    memoryStore.getMock.mockRejectedValue(new Error('storage session read failed'))

    await expect(
      askClarification(makeInput(), { memoryStore }, 'trace-1'),
    ).rejects.toThrow('storage session read failed')

    // get 抛错后 update 不应被调用
    expect(memoryStore.updateMock).not.toHaveBeenCalled()
  })

  it('2b) memoryStore.update 抛错时 askClarification reject（不吞错）', async () => {
    const memoryStore = createMemoryStore()
    memoryStore.updateMock.mockRejectedValue(new Error('storage session write failed'))

    await expect(
      askClarification(makeInput(), { memoryStore }, 'trace-1'),
    ).rejects.toThrow('storage session write failed')

    // get 正常调用、update 也被调用但抛错
    expect(memoryStore.getMock).toHaveBeenCalledTimes(1)
    expect(memoryStore.updateMock).toHaveBeenCalledTimes(1)
  })

  it('2c) memoryStore.get 返回 undefined（会话不存在）时仍能执行，clarificationCount 回退为 1', async () => {
    // WorkingMemoryStore.get 在会话不存在/过期时返回 undefined，
    // askClarification 用 (existing?.clarificationCount ?? 0) + 1 处理
    const memoryStore = createMemoryStore()
    memoryStore.getMock.mockResolvedValue(undefined)

    const result = await askClarification(makeInput(), { memoryStore }, 'trace-1')

    expect(result).toEqual<ClarificationRequest>({
      question: '你想要鬼畜还是教程？',
      options: ['鬼畜', '教程'],
      reason: '意图模糊',
    })
    // (undefined ?? 0) + 1 = 1
    expect(memoryStore.updateMock).toHaveBeenCalledWith('trace-1', {
      clarificationCount: 1,
    })
  })
})

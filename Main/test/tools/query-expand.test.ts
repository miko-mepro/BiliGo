import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createQueryExpandTool,
  executeExpand,
  type ExpandMemoryStore,
} from '../../src/tools/query-expand.js'
import type { WorkingMemory } from '../../src/lib/shared-types/index.js'

// hoisted mocks for ./llm-json.js + bilibili-client (3.7 §5.1)
const llmMocks = vi.hoisted(() => ({
  callLlmForJson: vi.fn(),
}))

const suggestMocks = vi.hoisted(() => ({
  searchSuggest: vi.fn(),
}))

const hotMocks = vi.hoisted(() => ({
  searchHot: vi.fn(),
}))

vi.mock('../../src/tools/llm-json.js', () => ({
  callLlmForJson: llmMocks.callLlmForJson,
}))

vi.mock('../../src/lib/bilibili-client/suggest.js', () => ({
  searchSuggest: suggestMocks.searchSuggest,
}))

vi.mock('../../src/lib/bilibili-client/hot.js', () => ({
  searchHot: hotMocks.searchHot,
}))

function createMemoryStore(
  existing?: Partial<WorkingMemory>,
): ExpandMemoryStore {
  const store: WorkingMemory = {
    traceId: 'trace-1',
    triedKeywords: existing?.triedKeywords ?? [],
    rejectedBvids: existing?.rejectedBvids ?? [],
    failureReasons: existing?.failureReasons ?? [],
    clarificationCount: existing?.clarificationCount ?? 0,
  }
  return {
    get: vi.fn(async () => ({ ...store })),
    update: vi.fn(async (patch: Partial<WorkingMemory>) => {
      Object.assign(store, patch)
      return { ...store }
    }),
  }
}

function createToolWithMemory(store?: ExpandMemoryStore) {
  const memoryStore = store ?? createMemoryStore()
  const toolDef = createQueryExpandTool({ memoryStore })
  return { memoryStore, toolDef }
}

/** 调用 tool().execute 并提供最小合法的执行 options。 */
async function runExecute(
  toolDef: ReturnType<typeof createQueryExpandTool>,
  query: string,
) {
  const execute = toolDef.execute
  if (!execute) throw new Error('tool.execute missing')
  return execute(
    { query },
    {
      toolCallId: 'tc',
      messages: [],
      abortSignal: undefined,
    },
  )
}

function oversizedLlmResult() {
  return {
    keywords: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k1', 'k2'],
    tags: ['t1', 't2', 't3', 't4', 't5', 't6', 't1'],
    categories: ['c1', 'c2', 'c3', 'c4', 'c1'],
    rationale: 'oversized',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  llmMocks.callLlmForJson.mockReset()
  suggestMocks.searchSuggest.mockReset()
  hotMocks.searchHot.mockReset()
  suggestMocks.searchSuggest.mockResolvedValue([])
  hotMocks.searchHot.mockResolvedValue([])
})

describe('query_expand / auxiliary APIs', () => {
  it('continues when searchSuggest fails', async () => {
    suggestMocks.searchSuggest.mockRejectedValue(new Error('suggest down'))
    hotMocks.searchHot.mockResolvedValue([
      { keyword: 'hot-1', show_name: '', pos: 1 },
    ])
    llmMocks.callLlmForJson.mockResolvedValue({
      keywords: ['ok-1'],
      tags: [],
      categories: [],
      rationale: 'suggest failed but ok',
    })
    const { toolDef } = createToolWithMemory()

    const result = await runExecute(toolDef, '搜索意图')

    expect(result.keywords).toEqual(['ok-1'])
    expect(result.rationale).toBe('suggest failed but ok')
  })

  it('continues when searchHot fails', async () => {
    suggestMocks.searchSuggest.mockResolvedValue([
      { value: 'suggest-1', ref: 0, type: '' },
    ])
    hotMocks.searchHot.mockRejectedValue(new Error('hot down'))
    llmMocks.callLlmForJson.mockResolvedValue({
      keywords: ['ok-2'],
      tags: [],
      categories: [],
      rationale: 'hot failed but ok',
    })
    const { toolDef } = createToolWithMemory()

    const result = await runExecute(toolDef, '搜索意图')

    expect(result.keywords).toEqual(['ok-2'])
    expect(result.rationale).toBe('hot failed but ok')
  })
})

describe('query_expand / LLM', () => {
  it('returns generated keywords tags categories and rationale', async () => {
    llmMocks.callLlmForJson.mockResolvedValue({
      keywords: ['kw-1', 'kw-2'],
      tags: ['tag-1', 'tag-2'],
      categories: ['cat-1'],
      rationale: '完整的扩展理由',
    })
    const { toolDef } = createToolWithMemory()

    const result = await runExecute(toolDef, '游戏解说')

    expect(result.keywords).toEqual(['kw-1', 'kw-2'])
    expect(result.tags).toEqual(['tag-1', 'tag-2'])
    expect(result.categories).toEqual(['cat-1'])
    expect(result.rationale).toBe('完整的扩展理由')
  })
})

describe('query_expand / limits', () => {
  it('deduplicates before enforcing output limits', async () => {
    llmMocks.callLlmForJson.mockResolvedValue(oversizedLlmResult())
    const { toolDef } = createToolWithMemory()

    const result = await runExecute(toolDef, '意图')

    expect(result.keywords).toHaveLength(8)
    expect(result.tags).toHaveLength(5)
    expect(result.categories).toHaveLength(3)
    // 去重后保留首次出现的顺序
    expect(result.keywords).toEqual([
      'k1',
      'k2',
      'k3',
      'k4',
      'k5',
      'k6',
      'k7',
      'k8',
    ])
    expect(result.tags).toEqual(['t1', 't2', 't3', 't4', 't5'])
    expect(result.categories).toEqual(['c1', 'c2', 'c3'])
  })
})

describe('query_expand / fallback', () => {
  it('uses deduplicated seed keywords when LLM fails', async () => {
    llmMocks.callLlmForJson.mockResolvedValue(null)
    const { toolDef } = createToolWithMemory()

    const result = await runExecute(toolDef, '重复种子')

    // seed 由 query 派生：[query.trim()]
    expect(result.keywords).toEqual(['重复种子'])
    expect(result.tags).toEqual([])
    expect(result.categories).toEqual([])
    expect(result.rationale).toBe('fallback')
  })
})

describe('query_expand / memory', () => {
  it('merges result keywords into existing triedKeywords', async () => {
    llmMocks.callLlmForJson.mockResolvedValue({
      keywords: ['新词1', '新词2'],
      tags: [],
      categories: [],
      rationale: 'merged',
    })
    const memoryStore = createMemoryStore({
      triedKeywords: ['旧词', '新词1'],
    })

    await executeExpand(
      '意图',
      memoryStore,
      llmMocks.callLlmForJson,
      suggestMocks.searchSuggest,
      hotMocks.searchHot,
    )

    expect(memoryStore.update).toHaveBeenCalledTimes(1)
    const callArgs = (memoryStore.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0]
    expect(callArgs.triedKeywords).toEqual(['旧词', '新词1', '新词2'])
  })
})

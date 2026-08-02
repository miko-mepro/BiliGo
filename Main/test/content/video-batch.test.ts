// S-3 视频批次归属模型的单元测试。
// 覆盖 UPSERT_VIDEO_BATCH / CLEAR_VIDEO_BATCHES reducer、selectCurrentVideos 派生选择器、
// migrateVideoBatches 旧数据迁移，以及 HYDRATE/REHYDRATE 的批次恢复路径。
import { describe, it, expect } from 'vitest'
import {
  chatReducer,
  createInitialChatState,
  selectCurrentVideos,
  migrateVideoBatches,
  type ChatState,
  type PersistedConversation,
} from '../../src/content/chat-context.js'
import type {
  ChatMessage,
  BilibiliVideoCard,
  VideoBatch,
} from '../../src/lib/shared-types/index.js'

const FIXED_NOW = 1704067200000

function state(overrides: Partial<ChatState> = {}): ChatState {
  return { ...createInitialChatState(), ...overrides }
}

function video(bvid: string): BilibiliVideoCard {
  return {
    bvid,
    aid: 1,
    title: `视频 ${bvid}`,
    author: 'UP',
    pic: 'pic',
    play: 0,
    videoReview: 0,
    favorites: 0,
    duration: '10:00',
    pubdate: 0,
    tag: '',
    description: '',
  }
}

/** 构造一个视频批次 */
function batch(
  batchId: string,
  videos: BilibiliVideoCard[],
  overrides: Partial<VideoBatch> = {},
): VideoBatch {
  return {
    batchId,
    videos,
    anchorTimestamp: FIXED_NOW,
    receivedAt: FIXED_NOW,
    reranked: false,
    ...overrides,
  }
}

/** 构造持久化会话结构，便于测试 HYDRATE/REHYDRATE */
function persisted(overrides: Partial<PersistedConversation> = {}): PersistedConversation {
  const messages: ChatMessage[] = [{ role: 'user', content: '历史消息', timestamp: FIXED_NOW }]
  return {
    version: 1,
    conversationId: 'conv_persisted',
    messages,
    videos: [],
    understandings: [],
    expansions: [],
    reranks: [],
    updatedAt: FIXED_NOW,
    ...overrides,
  }
}

describe('UPSERT_VIDEO_BATCH reducer（S-3）', () => {
  it('批次不存在时追加新批次', () => {
    const after = chatReducer(state({ videoBatches: [] }), {
      type: 'UPSERT_VIDEO_BATCH',
      payload: batch('b1', [video('BV1')]),
    })

    expect(after.videoBatches).toHaveLength(1)
    expect(after.videoBatches[0].batchId).toBe('b1')
  })

  it('批次已存在时原地更新，不新增批次（rerank 走此路径）', () => {
    const initial = state({ videoBatches: [batch('b1', [video('BV1')])] })
    const after = chatReducer(initial, {
      type: 'UPSERT_VIDEO_BATCH',
      payload: batch('b1', [video('BV2')], { reranked: true }),
    })

    expect(after.videoBatches).toHaveLength(1)
    expect(after.videoBatches[0].videos[0].bvid).toBe('BV2')
    expect(after.videoBatches[0].reranked).toBe(true)
  })

  it('不同 batchId 追加为新批次，旧批次保留（S-3 核心行为）', () => {
    const initial = state({ videoBatches: [batch('b1', [video('BV1')])] })
    const after = chatReducer(initial, {
      type: 'UPSERT_VIDEO_BATCH',
      payload: batch('b2', [video('BV2')]),
    })

    expect(after.videoBatches).toHaveLength(2)
    expect(after.videoBatches.map((b) => b.batchId)).toEqual(['b1', 'b2'])
    // 旧批次的视频未被新搜索顶掉——这正是 S-3 要修复的问题
    expect(after.videoBatches[0].videos[0].bvid).toBe('BV1')
  })

  it('更新时保持批次在数组中的原有位置', () => {
    const initial = state({
      videoBatches: [batch('b1', [video('BV1')]), batch('b2', [video('BV2')])],
    })
    const after = chatReducer(initial, {
      type: 'UPSERT_VIDEO_BATCH',
      payload: batch('b1', [video('BV1new')]),
    })

    expect(after.videoBatches.map((b) => b.batchId)).toEqual(['b1', 'b2'])
    expect(after.videoBatches[0].videos[0].bvid).toBe('BV1new')
  })

  it('videos 派生镜像同步为最新批次的视频', () => {
    const initial = state({ videoBatches: [batch('b1', [video('BV1')])] })
    const after = chatReducer(initial, {
      type: 'UPSERT_VIDEO_BATCH',
      payload: batch('b2', [video('BV2')]),
    })

    expect(after.videos.map((v) => v.bvid)).toEqual(['BV2'])
  })

  it('不可变更新：返回新数组，原 state 不被修改', () => {
    const original = [batch('b1', [video('BV1')])]
    const initial = state({ videoBatches: original })
    const after = chatReducer(initial, {
      type: 'UPSERT_VIDEO_BATCH',
      payload: batch('b1', [video('BV2')]),
    })

    expect(after.videoBatches).not.toBe(original)
    expect(original[0].videos[0].bvid).toBe('BV1')
    expect(after).not.toBe(initial)
  })
})

describe('CLEAR_VIDEO_BATCHES reducer（S-3）', () => {
  it('清空全部批次与派生镜像', () => {
    const initial = state({
      videoBatches: [batch('b1', [video('BV1')])],
      videos: [video('BV1')],
    })
    const after = chatReducer(initial, { type: 'CLEAR_VIDEO_BATCHES' })

    expect(after.videoBatches).toEqual([])
    expect(after.videos).toEqual([])
  })
})

describe('CLEAR_MESSAGES 清空批次（S-3）', () => {
  it('清空对话时批次一并清除', () => {
    const initial = state({ videoBatches: [batch('b1', [video('BV1')])] })
    const after = chatReducer(initial, { type: 'CLEAR_MESSAGES' })

    expect(after.videoBatches).toEqual([])
  })
})

describe('selectCurrentVideos（S-3）', () => {
  it('返回最新批次的视频', () => {
    const videos = selectCurrentVideos({
      videoBatches: [batch('b1', [video('BV1')]), batch('b2', [video('BV2')])],
    })
    expect(videos.map((v) => v.bvid)).toEqual(['BV2'])
  })

  it('无批次时返回空数组', () => {
    expect(selectCurrentVideos({ videoBatches: [] })).toEqual([])
  })
})

describe('migrateVideoBatches 旧数据迁移（S-3）', () => {
  it('旧版扁平 videos 迁移为单批次', () => {
    const legacy = [video('BV1'), video('BV2')]
    const result = migrateVideoBatches(undefined, legacy, 'conv_1')

    expect(result).toHaveLength(1)
    expect(result[0].batchId).toBe('legacy_conv_1')
    expect(result[0].videos).toBe(legacy)
    // 锚点为 0 使迁移批次排在消息流最前
    expect(result[0].anchorTimestamp).toBe(0)
    expect(result[0].reranked).toBe(false)
  })

  it('新版批次结构原样保留', () => {
    const batches = [batch('b1', [video('BV1')], { anchorTimestamp: 123 })]
    const result = migrateVideoBatches(batches, [], 'conv_1')

    expect(result).toHaveLength(1)
    expect(result[0].batchId).toBe('b1')
    expect(result[0].anchorTimestamp).toBe(123)
  })

  it('旧版空 videos 不产生空批次', () => {
    expect(migrateVideoBatches(undefined, [], 'conv_1')).toEqual([])
  })

  it('两者都缺失时返回空数组', () => {
    expect(migrateVideoBatches(undefined, undefined, 'conv_1')).toEqual([])
  })

  // 以下为字段级校验（参考 R-1 教训：脏数据不得进入状态层引发 render crash）
  it('batchId 非法时降级为稳定的 legacy 标识', () => {
    const result = migrateVideoBatches(
      [{ batchId: null, videos: [video('BV1')] }],
      [],
      'conv_1',
    )
    expect(result[0].batchId).toBe('legacy_conv_1_0')
  })

  it('videos 非数组的批次整条丢弃', () => {
    const result = migrateVideoBatches(
      [
        { batchId: 'b1', videos: null },
        { batchId: 'b2', videos: [video('BV2')] },
      ],
      [],
      'conv_1',
    )
    expect(result).toHaveLength(1)
    expect(result[0].batchId).toBe('b2')
  })

  it('非对象元素被丢弃', () => {
    const result = migrateVideoBatches(
      [null, 'garbage', { batchId: 'b1', videos: [video('BV1')] }],
      [],
      'conv_1',
    )
    expect(result).toHaveLength(1)
    expect(result[0].batchId).toBe('b1')
  })

  it('数值字段非法时降级为 0，reranked 非 true 时降级为 false', () => {
    const result = migrateVideoBatches(
      [{ batchId: 'b1', videos: [], anchorTimestamp: 'x', receivedAt: NaN, reranked: 'yes' }],
      [],
      'conv_1',
    )
    expect(result[0]).toMatchObject({ anchorTimestamp: 0, receivedAt: 0, reranked: false })
  })

  it('非数组的 batches 输入回落到扁平 videos 迁移', () => {
    const result = migrateVideoBatches('not-an-array', [video('BV1')], 'conv_1')
    expect(result).toHaveLength(1)
    expect(result[0].batchId).toBe('legacy_conv_1')
  })
})

describe('HYDRATE/REHYDRATE 批次恢复（S-3）', () => {
  it('HYDRATE 时旧版扁平 videos 迁移为单批次', () => {
    const after = chatReducer(state({ hydrated: false }), {
      type: 'HYDRATE',
      payload: persisted({ conversationId: 'conv_h', videos: [video('BV_h')] }),
    })

    expect(after.videoBatches).toHaveLength(1)
    expect(after.videoBatches[0].batchId).toBe('legacy_conv_h')
    expect(after.videos.map((v) => v.bvid)).toEqual(['BV_h'])
  })

  it('HYDRATE 时新版 videoBatches 优先于扁平 videos', () => {
    const after = chatReducer(state({ hydrated: false }), {
      type: 'HYDRATE',
      payload: persisted({
        conversationId: 'conv_h2',
        videos: [video('BV_flat')],
        videoBatches: [batch('b1', [video('BV_batch')])],
      }),
    })

    expect(after.videoBatches).toHaveLength(1)
    expect(after.videoBatches[0].batchId).toBe('b1')
    expect(after.videos.map((v) => v.bvid)).toEqual(['BV_batch'])
  })

  it('REHYDRATE 加载历史对话时恢复多个批次，保持各自锚点', () => {
    const after = chatReducer(state(), {
      type: 'REHYDRATE',
      payload: persisted({
        conversationId: 'conv_r',
        videoBatches: [
          batch('b1', [video('BV1')], { anchorTimestamp: 1000 }),
          batch('b2', [video('BV2')], { anchorTimestamp: 3000 }),
        ],
      }),
    })

    expect(after.videoBatches).toHaveLength(2)
    expect(after.videoBatches[0].anchorTimestamp).toBe(1000)
    expect(after.videoBatches[1].anchorTimestamp).toBe(3000)
    // 派生镜像取最新批次
    expect(after.videos.map((v) => v.bvid)).toEqual(['BV2'])
  })

  it('REHYDRATE 旧对话（无 videoBatches）迁移为单批次', () => {
    const after = chatReducer(state(), {
      type: 'REHYDRATE',
      payload: persisted({ conversationId: 'conv_old', videos: [video('BV_old')] }),
    })

    expect(after.videoBatches).toHaveLength(1)
    expect(after.videoBatches[0].batchId).toBe('legacy_conv_old')
  })
})

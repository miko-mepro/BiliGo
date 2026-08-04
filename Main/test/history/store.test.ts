import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getHistoryIndex,
  writeHistoryIndex,
  saveConversation,
  loadConversation,
  deleteConversation,
  updateTitle,
  clearAllHistory,
  saveLocalCache,
  loadLocalCache,
  clearLocalCache,
  MAX_PERSISTED_MESSAGES,
} from '../../src/lib/history/store.js';
import type { SaveableConversation, PersistedConversation } from '../../src/lib/history/store.js';
import type {
  ConversationRecord,
  ConversationData,
  ChatMessage,
} from '../../src/lib/shared-types/index.js';

// 存储 Key 逐字断言（契约）
const INDEX_KEY = 'bili-agent-history-index';
const DATA_PREFIX = 'bili-agent-history:';
const CONVERSATION_STORAGE_KEY = 'bili-agent-conversation';

/**
 * 构造一个内存版 chrome.storage.local，记录 set/get/remove 调用并返回后端 store 对象。
 * 风格参照 Main/test/tools/working-memory.test.ts 的 makeStorageMock。
 */
function createBackingStore() {
  const store: Record<string, unknown> = {};
  (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (keys: string | string[] | Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      const keyList =
        typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys as Record<string, unknown>);
      for (const k of keyList) {
        if (k in store) result[k] = store[k];
      }
      return Promise.resolve(result);
    },
  );
  (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    },
  );
  (chrome.storage.local.remove as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (keys: string | string[]) => {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const k of keyList) delete store[k];
      return Promise.resolve();
    },
  );
  return store;
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { role: 'user', content: 'hello', timestamp: Date.now(), ...overrides };
}

describe('storage key contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MAX_PERSISTED_MESSAGES === 200', () => {
    expect(MAX_PERSISTED_MESSAGES).toBe(200);
  });
});

describe('getHistoryIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when index does not exist', async () => {
    createBackingStore();
    const result = await getHistoryIndex();
    expect(result).toEqual([]);
  });

  it('returns array content when index exists', async () => {
    const store = createBackingStore();
    const records: ConversationRecord[] = [
      {
        id: 'c1',
        title: 'Chat 1',
        titleFinal: false,
        createdAt: 100,
        lastActiveAt: 200,
        messageCount: 3,
      },
    ];
    store[INDEX_KEY] = records;
    const result = await getHistoryIndex();
    expect(result).toEqual(records);
  });

  it('returns empty array when stored value is not an array (corrupted data)', async () => {
    const store = createBackingStore();
    store[INDEX_KEY] = 'not-an-array';
    const result = await getHistoryIndex();
    expect(result).toEqual([]);
  });

  // R-1：本地读取入口必须经过 sanitizeHistoryIndex 校验，
  // 非字符串 title 不得原样流向渲染层（会在 toLowerCase 处抛 TypeError）
  describe('数据入口校验（R-1）', () => {
    it('title 为 null 时降级为空字符串', async () => {
      const store = createBackingStore();
      store[INDEX_KEY] = [
        { id: 'c1', title: null, titleFinal: false, createdAt: 1, lastActiveAt: 2, messageCount: 3 },
      ];
      const result = await getHistoryIndex();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('');
      expect(() => result[0].title.toLowerCase()).not.toThrow();
    });

    it('id 非法的记录被丢弃，有效记录保留', async () => {
      const store = createBackingStore();
      store[INDEX_KEY] = [
        { id: '', title: 'dropped', titleFinal: false, createdAt: 1, lastActiveAt: 2, messageCount: 0 },
        { id: 'c2', title: 'kept', titleFinal: false, createdAt: 1, lastActiveAt: 2, messageCount: 0 },
      ];
      const result = await getHistoryIndex();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c2');
    });

    it('数组内的非对象元素被丢弃', async () => {
      const store = createBackingStore();
      store[INDEX_KEY] = [
        null,
        'garbage',
        { id: 'c1', title: 'ok', titleFinal: false, createdAt: 1, lastActiveAt: 2, messageCount: 0 },
      ];
      const result = await getHistoryIndex();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
    });

    it('校验不回写存储（静默降级策略，避免写放大与并发冲突）', async () => {
      const store = createBackingStore();
      store[INDEX_KEY] = [
        { id: 'c1', title: null, titleFinal: false, createdAt: 1, lastActiveAt: 2, messageCount: 0 },
      ];
      await getHistoryIndex();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      // 存储中的原始脏数据保持不变
      expect((store[INDEX_KEY] as Array<{ title: unknown }>)[0].title).toBeNull();
    });
  });
});

describe('writeHistoryIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes array to INDEX_KEY', async () => {
    const store = createBackingStore();
    const records: ConversationRecord[] = [
      {
        id: 'c1',
        title: 'Chat 1',
        titleFinal: false,
        createdAt: 100,
        lastActiveAt: 200,
        messageCount: 3,
      },
    ];
    await writeHistoryIndex(records);
    expect(store[INDEX_KEY]).toEqual(records);
  });
});

describe('saveConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a new conversation: writes to index head + data key, returns correct record', async () => {
    const store = createBackingStore();
    const now = Date.now();
    vi.setSystemTime(now);

    const messages = [
      makeMessage({ content: 'hi' }),
      makeMessage({ content: 'hello', role: 'assistant' }),
    ];
    const record = await saveConversation(
      {
        conversationId: 'c1',
        messages,
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
      },
      'New Chat',
    );

    // 返回 record 字段
    expect(record.id).toBe('c1');
    expect(record.title).toBe('New Chat');
    expect(record.titleFinal).toBe(false);
    expect(record.createdAt).toBe(now);
    expect(record.lastActiveAt).toBe(now);
    expect(record.messageCount).toBe(2);

    // 索引写入
    const index = store[INDEX_KEY] as ConversationRecord[];
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('c1');

    // 数据 key 写入
    const data = store[DATA_PREFIX + 'c1'] as ConversationData;
    expect(data).toBeDefined();
    expect(data.version).toBe(2);
    expect(data.id).toBe('c1');
    expect(data.messages).toHaveLength(2);
  });

  it('re-saves same id: preserves createdAt, refreshes lastActiveAt, deduplicates index', async () => {
    const store = createBackingStore();
    const t1 = 1000;
    const t2 = 2000;
    vi.setSystemTime(t1);

    const messages1 = [makeMessage({ content: 'first' })];
    await saveConversation(
      {
        conversationId: 'c1',
        messages: messages1,
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
      },
      'First',
    );

    vi.setSystemTime(t2);
    const messages2 = [makeMessage({ content: 'second' })];
    const record = await saveConversation(
      {
        conversationId: 'c1',
        messages: messages2,
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
      },
      'Updated',
    );

    // createdAt 保留首次值
    expect(record.createdAt).toBe(t1);
    // lastActiveAt 刷新
    expect(record.lastActiveAt).toBe(t2);
    // title 更新
    expect(record.title).toBe('Updated');
    // messageCount 更新
    expect(record.messageCount).toBe(1);

    // 索引仅 1 条 c1（去重）
    const index = store[INDEX_KEY] as ConversationRecord[];
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('c1');
  });

  it('trims index to MAX_HISTORY=50 and removes oldest data key', async () => {
    const store = createBackingStore();
    const now = Date.now();
    vi.setSystemTime(now);

    // 预填 50 条记录
    const existing: ConversationRecord[] = [];
    for (let i = 0; i < 50; i++) {
      const id = `old-${i}`;
      existing.push({
        id,
        title: `Old ${i}`,
        titleFinal: false,
        createdAt: now - (50 - i) * 1000,
        lastActiveAt: now - (50 - i) * 500,
        messageCount: 1,
      });
      store[DATA_PREFIX + id] = { version: 2, id, messages: [] } as unknown as ConversationData;
    }
    store[INDEX_KEY] = existing;

    // 保存第 51 条
    await saveConversation(
      {
        conversationId: 'new-one',
        messages: [makeMessage({ content: 'new' })],
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
      },
      'New',
    );

    // 索引应截断为 50 条
    const index = store[INDEX_KEY] as ConversationRecord[];
    expect(index).toHaveLength(50);
    // 新条目在头部
    expect(index[0].id).toBe('new-one');
    // 原索引最后一条 old-49 被移除
    expect(index.find((r) => r.id === 'old-49')).toBeUndefined();
    // old-49 数据 key 被删除
    expect(store[DATA_PREFIX + 'old-49']).toBeUndefined();
    // old-0 仍在索引
    expect(index.find((r) => r.id === 'old-0')).toBeDefined();
    // old-0 数据 key 仍存在
    expect(store[DATA_PREFIX + 'old-0']).toBeDefined();
  });

  it('messageCount equals messages array length', async () => {
    createBackingStore();
    const messages = [
      makeMessage({ content: 'a' }),
      makeMessage({ content: 'b' }),
      makeMessage({ content: 'c' }),
    ];
    const record = await saveConversation(
      {
        conversationId: 'c1',
        messages,
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
      },
      'Test',
    );
    expect(record.messageCount).toBe(3);
  });

  it('uses provided createdAt when no existing record', async () => {
    createBackingStore();
    const customCreatedAt = 42_000;
    const record = await saveConversation(
      {
        conversationId: 'c1',
        messages: [makeMessage()],
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
        createdAt: customCreatedAt,
      },
      'Test',
    );
    expect(record.createdAt).toBe(customCreatedAt);
  });
});

// 回归：已最终化（titleFinal===true）的 AI 标题在重复 saveConversation 时不应被 tempTitle 覆盖。
// 复现路径：第1轮 save -> generate_title -> updateTitle(titleFinal=true) ->
// 第2轮 isLoading 结束后再 save -> 旧实现会用 tempTitle 覆盖 AI 标题并把 titleFinal 重置为 false。
describe('saveConversation: preserve finalized AI title on re-save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps AI title and titleFinal=true when re-saving after updateTitle', async () => {
    const store = createBackingStore();
    const t1 = 1000;
    const t2 = 2000;
    const t3 = 3000;
    vi.setSystemTime(t1);

    // 1. 首次保存：titleFinal=false，title=tempTitle
    const messages1 = [makeMessage({ content: 'first' })];
    const first = await saveConversation(
      {
        conversationId: 'c1',
        messages: messages1,
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
      },
      'Temp Title',
    );
    expect(first.title).toBe('Temp Title');
    expect(first.titleFinal).toBe(false);

    // 2. updateTitle 置 AI 标题并标记 titleFinal=true
    const aiTitle = 'AI Generated Title';
    await updateTitle('c1', aiTitle);
    const indexAfterTitle = store[INDEX_KEY] as ConversationRecord[];
    expect(indexAfterTitle[0].title).toBe(aiTitle);
    expect(indexAfterTitle[0].titleFinal).toBe(true);

    // 3. 再次 saveConversation：不同 tempTitle、消息变多
    vi.setSystemTime(t3);
    const messages2 = [
      makeMessage({ content: 'first' }),
      makeMessage({ content: 'second', role: 'assistant' }),
      makeMessage({ content: 'third' }),
    ];
    const reSaved = await saveConversation(
      {
        conversationId: 'c1',
        messages: messages2,
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
        createdAt: t2,
      },
      'Different Temp Title',
    );

    // 4. 断言：AI 标题保留、titleFinal 仍 true、messageCount/lastActiveAt 已更新
    expect(reSaved.title).toBe(aiTitle);
    expect(reSaved.titleFinal).toBe(true);
    expect(reSaved.messageCount).toBe(3);
    expect(reSaved.lastActiveAt).toBe(t3);
    // createdAt 保留首次值（t1），入参 createdAt=t2 被忽略
    expect(reSaved.createdAt).toBe(t1);

    // 索引中同样保留 AI 标题与 titleFinal
    const finalIndex = store[INDEX_KEY] as ConversationRecord[];
    expect(finalIndex).toHaveLength(1);
    expect(finalIndex[0].title).toBe(aiTitle);
    expect(finalIndex[0].titleFinal).toBe(true);
    expect(finalIndex[0].messageCount).toBe(3);
    expect(finalIndex[0].lastActiveAt).toBe(t3);
  });

  it('still overwrites title with tempTitle when existing titleFinal===false', async () => {
    const store = createBackingStore();
    const t1 = 1000;
    const t2 = 2000;
    vi.setSystemTime(t1);

    // 首次保存
    await saveConversation(
      {
        conversationId: 'c1',
        messages: [makeMessage({ content: 'first' })],
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
      },
      'First Title',
    );

    // 再次保存：titleFinal 仍为 false，应沿用 tempTitle 覆盖逻辑
    vi.setSystemTime(t2);
    const reSaved = await saveConversation(
      {
        conversationId: 'c1',
        messages: [
          makeMessage({ content: 'first' }),
          makeMessage({ content: 'second', role: 'assistant' }),
        ],
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
      },
      'Second Title',
    );

    expect(reSaved.title).toBe('Second Title');
    expect(reSaved.titleFinal).toBe(false);
    expect(reSaved.messageCount).toBe(2);
  });

  it('new conversation (no existing record) uses tempTitle with titleFinal=false', async () => {
    createBackingStore();
    const record = await saveConversation(
      {
        conversationId: 'c-new',
        messages: [makeMessage()],
        videos: [],
        understandings: [],
        expansions: [],
        reranks: [],
      },
      'Brand New',
    );
    expect(record.title).toBe('Brand New');
    expect(record.titleFinal).toBe(false);
  });
});

describe('loadConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when data key does not exist', async () => {
    createBackingStore();
    const result = await loadConversation('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null when version !== 2', async () => {
    const store = createBackingStore();
    store[DATA_PREFIX + 'c1'] = { version: 1, id: 'c1', messages: [] };
    const result = await loadConversation('c1');
    expect(result).toBeNull();
  });

  it('returns null when id field type is wrong', async () => {
    const store = createBackingStore();
    store[DATA_PREFIX + 'c1'] = { version: 2, id: 123, messages: [] };
    const result = await loadConversation('c1');
    expect(result).toBeNull();
  });

  it('returns full ConversationData for valid data', async () => {
    const store = createBackingStore();
    const data: ConversationData = {
      version: 2,
      id: 'c1',
      messages: [makeMessage({ content: 'test' })],
      videos: [],
      understandings: [],
      expansions: [],
      reranks: [],
      createdAt: 100,
      lastActiveAt: 200,
    };
    store[DATA_PREFIX + 'c1'] = data;
    const result = await loadConversation('c1');
    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
    expect(result!.id).toBe('c1');
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0].content).toBe('test');
    expect(result!.createdAt).toBe(100);
    expect(result!.lastActiveAt).toBe(200);
  });
});

describe('deleteConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes entry from index and removes data key', async () => {
    const store = createBackingStore();
    const records: ConversationRecord[] = [
      {
        id: 'c1',
        title: 'Chat 1',
        titleFinal: false,
        createdAt: 100,
        lastActiveAt: 200,
        messageCount: 3,
      },
      {
        id: 'c2',
        title: 'Chat 2',
        titleFinal: false,
        createdAt: 300,
        lastActiveAt: 400,
        messageCount: 5,
      },
    ];
    store[INDEX_KEY] = records;
    store[DATA_PREFIX + 'c1'] = { version: 2, id: 'c1' };
    store[DATA_PREFIX + 'c2'] = { version: 2, id: 'c2' };

    await deleteConversation('c1');

    const index = store[INDEX_KEY] as ConversationRecord[];
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('c2');
    expect(store[DATA_PREFIX + 'c1']).toBeUndefined();
    expect(store[DATA_PREFIX + 'c2']).toBeDefined();
  });

  it('does not throw when deleting a non-existent id', async () => {
    const store = createBackingStore();
    const records: ConversationRecord[] = [
      {
        id: 'c1',
        title: 'Chat 1',
        titleFinal: false,
        createdAt: 100,
        lastActiveAt: 200,
        messageCount: 3,
      },
    ];
    store[INDEX_KEY] = records;

    await expect(deleteConversation('nonexistent')).resolves.toBeUndefined();

    // 索引不变
    const index = store[INDEX_KEY] as ConversationRecord[];
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('c1');
  });
});

describe('updateTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates title and sets titleFinal=true when id exists', async () => {
    const store = createBackingStore();
    const records: ConversationRecord[] = [
      {
        id: 'c1',
        title: 'Old Title',
        titleFinal: false,
        createdAt: 100,
        lastActiveAt: 200,
        messageCount: 3,
      },
    ];
    store[INDEX_KEY] = records;

    await updateTitle('c1', 'New Title');

    const index = store[INDEX_KEY] as ConversationRecord[];
    expect(index[0].title).toBe('New Title');
    expect(index[0].titleFinal).toBe(true);
  });

  it('does not throw and does not modify index when id does not exist', async () => {
    const store = createBackingStore();
    const records: ConversationRecord[] = [
      {
        id: 'c1',
        title: 'Chat 1',
        titleFinal: false,
        createdAt: 100,
        lastActiveAt: 200,
        messageCount: 3,
      },
    ];
    store[INDEX_KEY] = records;

    await expect(updateTitle('nonexistent', 'New Title')).resolves.toBeUndefined();

    const index = store[INDEX_KEY] as ConversationRecord[];
    expect(index).toHaveLength(1);
    expect(index[0].title).toBe('Chat 1');
    expect(index[0].titleFinal).toBe(false);
  });
});

describe('clearAllHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes INDEX_KEY and all data keys', async () => {
    const store = createBackingStore();
    const records: ConversationRecord[] = [
      {
        id: 'c1',
        title: 'Chat 1',
        titleFinal: false,
        createdAt: 100,
        lastActiveAt: 200,
        messageCount: 3,
      },
      {
        id: 'c2',
        title: 'Chat 2',
        titleFinal: false,
        createdAt: 300,
        lastActiveAt: 400,
        messageCount: 5,
      },
    ];
    store[INDEX_KEY] = records;
    store[DATA_PREFIX + 'c1'] = { version: 2, id: 'c1' };
    store[DATA_PREFIX + 'c2'] = { version: 2, id: 'c2' };

    await clearAllHistory();

    expect(store[INDEX_KEY]).toBeUndefined();
    expect(store[DATA_PREFIX + 'c1']).toBeUndefined();
    expect(store[DATA_PREFIX + 'c2']).toBeUndefined();
  });

  it('handles empty index gracefully (only removes INDEX_KEY)', async () => {
    const store = createBackingStore();
    store[INDEX_KEY] = [];

    await clearAllHistory();

    expect(store[INDEX_KEY]).toBeUndefined();
  });
});

// ============ 当前活动会话缓存原语测试（key: 'bili-agent-conversation'）============

describe('saveLocalCache / loadLocalCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes payload to CONVERSATION_STORAGE_KEY', async () => {
    const store = createBackingStore();
    const now = 9999;
    vi.setSystemTime(now);

    const payload: PersistedConversation = {
      version: 1,
      conversationId: 'active-1',
      messages: [makeMessage({ content: 'hi' })],
      videos: [],
      understandings: [],
      expansions: [],
      reranks: [],
      updatedAt: now,
    };
    await saveLocalCache(payload);

    expect(store[CONVERSATION_STORAGE_KEY]).toEqual(payload);
  });

  it('round-trips: saveLocalCache then loadLocalCache returns the same payload', async () => {
    createBackingStore();
    const payload: PersistedConversation = {
      version: 1,
      conversationId: 'active-1',
      messages: [makeMessage({ content: 'roundtrip' })],
      videos: [],
      understandings: [],
      expansions: [],
      reranks: [],
      updatedAt: 123,
    };
    await saveLocalCache(payload);
    const loaded = await loadLocalCache();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.conversationId).toBe('active-1');
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0].content).toBe('roundtrip');
    expect(loaded!.updatedAt).toBe(123);
  });

  it('returns null when CONVERSATION_STORAGE_KEY does not exist', async () => {
    createBackingStore();
    const result = await loadLocalCache();
    expect(result).toBeNull();
  });

  it('returns null when version !== 1 (corrupted data)', async () => {
    const store = createBackingStore();
    store[CONVERSATION_STORAGE_KEY] = { version: 2, conversationId: 'x' };
    const result = await loadLocalCache();
    expect(result).toBeNull();
  });

  it('returns null when conversationId is not a string', async () => {
    const store = createBackingStore();
    store[CONVERSATION_STORAGE_KEY] = { version: 1, conversationId: 123 };
    const result = await loadLocalCache();
    expect(result).toBeNull();
  });
});

describe('clearLocalCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes CONVERSATION_STORAGE_KEY', async () => {
    const store = createBackingStore();
    store[CONVERSATION_STORAGE_KEY] = { version: 1, conversationId: 'x' };

    await clearLocalCache();

    expect(store[CONVERSATION_STORAGE_KEY]).toBeUndefined();
  });

  it('does not throw when key does not exist', async () => {
    createBackingStore();
    await expect(clearLocalCache()).resolves.toBeUndefined();
  });
});

// ============ 端到端 CRUD 循环 ============

describe('end-to-end CRUD loop', () => {
  it('saveConversation -> getHistoryIndex -> loadConversation -> updateTitle -> deleteConversation 完整链路', async () => {
    createBackingStore();

    // 1. 保存一条对话
    const saveable: SaveableConversation = {
      conversationId: 'e2e-1',
      messages: [
        { role: 'user', content: 'hello', timestamp: 1000 },
        { role: 'assistant', content: 'world', timestamp: 2000 },
      ],
      videos: [],
      understandings: [],
      expansions: [],
      reranks: [],
    };
    const saved = await saveConversation(saveable, 'Hello World');
    expect(saved.id).toBe('e2e-1');
    expect(saved.titleFinal).toBe(false);
    expect(saved.messageCount).toBe(2);

    // 2. 索引应包含该条
    const index = await getHistoryIndex();
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('e2e-1');
    expect(index[0].title).toBe('Hello World');

    // 3. 加载完整数据
    const loaded = await loadConversation('e2e-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe('e2e-1');
    expect(loaded?.version).toBe(2);
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[0].content).toBe('hello');

    // 4. 更新标题
    await updateTitle('e2e-1', 'AI Generated Title');
    const indexAfterUpdate = await getHistoryIndex();
    expect(indexAfterUpdate[0].title).toBe('AI Generated Title');
    expect(indexAfterUpdate[0].titleFinal).toBe(true);

    // 5. 删除
    await deleteConversation('e2e-1');
    const indexAfterDelete = await getHistoryIndex();
    expect(indexAfterDelete).toHaveLength(0);
    const loadedAfterDelete = await loadConversation('e2e-1');
    expect(loadedAfterDelete).toBeNull();
  });
});

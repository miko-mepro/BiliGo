// 历史索引与单条对话的 chrome.storage.local 存储原语。
// 纯存储原语 - 禁止 import React 或 React hooks。
// 职责边界：本文件只负责读写 chrome.storage.local 的三类 key；
// 保存编排（防抖/事件触发）属于 save-orchestrator.ts。
import type {
  ChatMessage,
  BilibiliVideoCard,
  ConversationRecord,
  ConversationData,
  SlangUnderstandResult,
  QueryExpandResult,
  RerankResult,
} from '../../lib/shared-types/index.js';

// 存储 Key 定义（逐字契约，不可修改）
const INDEX_KEY = 'bili-agent-history-index';
const DATA_PREFIX = 'bili-agent-history:';
const CONVERSATION_STORAGE_KEY = 'bili-agent-conversation';

// 上限常量（契约：MAX_HISTORY=50、MAX_PERSISTED_MESSAGES=200）
const MAX_HISTORY = 50;
export const MAX_PERSISTED_MESSAGES = 200;

/**
 * 当前活动会话缓存结构。
 * 对应 chrome.storage.local key 'bili-agent-conversation'。
 * 设计依据 3.4 §5.1：version=1 的轻量缓存，供刷新后 HYDRATE 恢复。
 */
export interface PersistedConversation {
  version: 1;
  conversationId: string;
  messages: ChatMessage[];
  videos: BilibiliVideoCard[];
  understandings: Array<SlangUnderstandResult & { receivedAt: number }>;
  expansions: Array<QueryExpandResult & { receivedAt: number }>;
  reranks: Array<RerankResult & { receivedAt: number }>;
  updatedAt: number;
}

/**
 * saveConversation 的入参：需要持久化为完整历史对话的数据。
 * createdAt 可选；未提供时由 saveConversation 用 Date.now() 补齐。
 */
export interface SaveableConversation {
  conversationId: string;
  messages: ChatMessage[];
  videos: BilibiliVideoCard[];
  understandings: Array<SlangUnderstandResult & { receivedAt: number }>;
  expansions: Array<QueryExpandResult & { receivedAt: number }>;
  reranks: Array<RerankResult & { receivedAt: number }>;
  createdAt?: number;
}

// ============ 历史索引原语 ============

/**
 * 读取历史索引。存储损坏（非数组）时返回空数组，保证调用方安全。
 */
export async function getHistoryIndex(): Promise<ConversationRecord[]> {
  const result = await chrome.storage.local.get(INDEX_KEY);
  const value = result[INDEX_KEY];
  if (Array.isArray(value)) {
    return value as ConversationRecord[];
  }
  return [];
}

/**
 * 原样写入历史索引（不做截断）。供 HistorySync.trackedWrite 及内部使用。
 */
export async function writeHistoryIndex(index: ConversationRecord[]): Promise<void> {
  await chrome.storage.local.set({ [INDEX_KEY]: index });
}

/**
 * 保存一条对话：写入索引头部 + 单条数据 key，并截断到 MAX_HISTORY=50。
 * - 同 id 重复保存时保留原 createdAt，刷新 lastActiveAt，索引去重。
 * - 超出 MAX_HISTORY 的旧条目从索引和数据 key 一并清除。
 * - messageCount 取入参 messages.length。
 */
export async function saveConversation(
  data: SaveableConversation,
  tempTitle: string,
): Promise<ConversationRecord> {
  const now = Date.now();
  const index = await getHistoryIndex();

  const existingRecord = index.find((r) => r.id === data.conversationId);
  const existingCreatedAt = existingRecord?.createdAt;
  const filtered = index.filter((r) => r.id !== data.conversationId);

  // 标题保留策略：当已有记录且 titleFinal===true（AI 标题已最终生成）时，
  // 保留原 title 与 titleFinal，避免后续 saveConversation（如 isLoading 结束后重存）
  // 用 tempTitle 覆盖已生成的 AI 标题并把 titleFinal 重置为 false。
  // 新建记录或 titleFinal 仍为 false 时，沿用 tempTitle 占位逻辑不变。
  const titleAlreadyFinal = existingRecord?.titleFinal === true;
  const newRecord: ConversationRecord = {
    id: data.conversationId,
    title: titleAlreadyFinal && existingRecord ? existingRecord.title : tempTitle,
    titleFinal: titleAlreadyFinal,
    createdAt: existingCreatedAt ?? data.createdAt ?? now,
    lastActiveAt: now,
    messageCount: data.messages.length,
  };

  const newIndex = [newRecord, ...filtered];
  const trimmed = newIndex.slice(0, MAX_HISTORY);
  const removed = newIndex.slice(MAX_HISTORY);

  const id = data.conversationId;
  const conversationData: ConversationData = {
    version: 2,
    id,
    messages: data.messages,
    videos: data.videos,
    understandings: data.understandings,
    expansions: data.expansions,
    reranks: data.reranks,
    createdAt: newRecord.createdAt,
    lastActiveAt: now,
  };

  await chrome.storage.local.set({
    [INDEX_KEY]: trimmed,
    [DATA_PREFIX + id]: conversationData,
  });

  // 截断掉的旧条目数据 key 也要删除，避免存储泄漏
  if (removed.length > 0) {
    await chrome.storage.local.remove(removed.map((r) => DATA_PREFIX + r.id));
  }

  return newRecord;
}

/**
 * 加载单条完整对话。校验 version===2 且 id 为 string，否则返回 null（数据损坏保护）。
 */
export async function loadConversation(id: string): Promise<ConversationData | null> {
  const result = await chrome.storage.local.get(DATA_PREFIX + id);
  const value = result[DATA_PREFIX + id];

  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  if (data.version !== 2 || typeof data.id !== 'string') {
    return null;
  }

  return data as unknown as ConversationData;
}

/**
 * 删除单条对话：从索引移除并删除对应数据 key。
 */
export async function deleteConversation(id: string): Promise<void> {
  const index = await getHistoryIndex();
  const newIndex = index.filter((r) => r.id !== id);
  await writeHistoryIndex(newIndex);
  await chrome.storage.local.remove(DATA_PREFIX + id);
}

/**
 * 更新标题并标记 titleFinal=true（标题已最终生成）。
 * id 不存在时静默返回，不抛错（幂等）。
 */
export async function updateTitle(id: string, title: string): Promise<void> {
  const index = await getHistoryIndex();
  const record = index.find((r) => r.id === id);
  if (!record) {
    return;
  }
  record.title = title;
  record.titleFinal = true;
  await writeHistoryIndex(index);
}

/**
 * 清空全部历史：删除索引 key 和所有单条数据 key。
 */
export async function clearAllHistory(): Promise<void> {
  const index = await getHistoryIndex();
  const allDataKeys = index.map((r) => DATA_PREFIX + r.id);
  await chrome.storage.local.remove([INDEX_KEY, ...allDataKeys]);
}

// ============ 当前活动会话缓存原语（key: 'bili-agent-conversation'）============
// 设计依据 3.4 §5.1 / §6.2：刷新页面后恢复当前会话，由 save-orchestrator 防抖写入。
// 存储原语只负责读写，不做防抖/过滤；编排层负责 messages 过滤与 slice(-200)。

/**
 * 写入当前活动会话缓存。
 * 调用方应自行保证 messages 已截断到 MAX_PERSISTED_MESSAGES（由 save-orchestrator 负责）。
 */
export async function saveLocalCache(payload: PersistedConversation): Promise<void> {
  await chrome.storage.local.set({ [CONVERSATION_STORAGE_KEY]: payload });
}

/**
 * 读取当前活动会话缓存。无缓存或结构异常时返回 null。
 */
export async function loadLocalCache(): Promise<PersistedConversation | null> {
  const result = await chrome.storage.local.get(CONVERSATION_STORAGE_KEY);
  const value = result[CONVERSATION_STORAGE_KEY];

  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  if (data.version !== 1 || typeof data.conversationId !== 'string') {
    return null;
  }

  return data as unknown as PersistedConversation;
}

/**
 * 清除当前活动会话缓存（如消息为空时）。
 */
export async function clearLocalCache(): Promise<void> {
  await chrome.storage.local.remove(CONVERSATION_STORAGE_KEY);
}

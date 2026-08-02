// 历史索引数据入口的结构完整性校验（R-1）。
// 纯函数模块 - 禁止 import React 或 React hooks，禁止访问 chrome.storage 等浏览器 API。
//
// 背景：ConversationRecord 的类型契约要求 title: string，但 chrome.storage.local
// 中的实际存储值不受 TypeScript 约束。store.ts 与 sync.ts 原本仅用
// `value as ConversationRecord[]` 强制断言，非字符串 title 会一路流到渲染层，
// 在 HistoryDropdown 搜索过滤执行 r.title.toLowerCase() 时抛出 TypeError。
//
// 本模块把两条数据入口（本地读取、跨标签页同步）的校验规则收敛到同一个函数，
// 保证两条链路的降级行为完全一致。
import type { ConversationRecord } from '../../lib/shared-types/index.js';

/**
 * 把未知输入降级为合法的数值字段。
 * 校验规则：必须是有限数值且非负；否则降级为 0。
 * NaN / Infinity / 字符串 / null / 负数均视为非法。
 */
function toSafeNonNegativeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return 0;
}

/**
 * 校验并降级单条历史记录。
 *
 * 分级策略：
 * - 致命失败（返回 null 丢弃整条）：元素非对象，或 id 不是非空字符串。
 *   没有 id 的记录既无法通过 loadConversation(id) 加载，也无法被删除，
 *   保留只会造成索引与数据 key 不一致。
 * - 可降级失败（保留记录并修正字段）：title / titleFinal / createdAt /
 *   lastActiveAt / messageCount 类型不符，降级后记录仍可正常加载与删除。
 */
function sanitizeRecord(raw: unknown): ConversationRecord | null {
  // 非对象元素（null、数字、字符串、布尔值等）直接丢弃
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;

  // id 是致命字段：必须是非空字符串，否则丢弃整条记录
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }

  return {
    id: candidate.id,
    // title 降级为空字符串：保留记录可加载，搜索时不匹配任何关键词但不会崩溃
    title: typeof candidate.title === 'string' ? candidate.title : '',
    // titleFinal 降级为 false：视为标题尚未最终生成，允许后续重命名覆盖
    titleFinal: typeof candidate.titleFinal === 'boolean' ? candidate.titleFinal : false,
    createdAt: toSafeNonNegativeNumber(candidate.createdAt),
    lastActiveAt: toSafeNonNegativeNumber(candidate.lastActiveAt),
    messageCount: toSafeNonNegativeNumber(candidate.messageCount),
  };
}

/**
 * 校验整个历史索引数组，返回全新的干净数组。
 *
 * 纯净性约束：不修改输入（每条记录都重建为新对象），无副作用，不做存储回写。
 * 采用「静默降级，不主动回写」策略：回写会引入 chrome.storage.local.set 副作用
 * 并可能与其他标签页的并发写入冲突；降级后的记录用户无感知，
 * 下次 saveConversation / updateTitle 写入时脏数据会被正常值自然覆盖。
 *
 * @param raw 来自 chrome.storage.local 或 onChanged 事件的未知值
 * @returns 只包含合法 ConversationRecord 的新数组；输入非数组时返回空数组
 */
export function sanitizeHistoryIndex(raw: unknown): ConversationRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const result: ConversationRecord[] = [];
  for (const item of raw) {
    const record = sanitizeRecord(item);
    // sanitizeRecord 返回 null 表示该条记录不可修复，丢弃
    if (record !== null) {
      result.push(record);
    }
  }
  return result;
}

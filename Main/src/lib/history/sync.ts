// 跨标签页历史索引同步：监听 chrome.storage.onChanged 并用 syncId 去回声。
// 纯存储原语 - 禁止 import React 或 React hooks。
// 设计依据 3.4 §7：每次写入生成唯一 syncId，写入后 200ms pending TTL 内忽略相同 syncId 的事件，
// 避免自身写入触发自身回调导致重复刷新。
import type { ConversationRecord } from '../../lib/shared-types/index.js';
import { sanitizeHistoryIndex } from './validate.js';

const INDEX_KEY = 'bili-agent-history-index';
// 旧实现用独立 key 承载 syncId（非嵌入 index 数组的 __syncId 方案），保持该方案。
const SYNC_ID_KEY = 'bili-agent-history-sync-id';
// pending TTL：写入后该毫秒内，相同 syncId 的事件被视为自身回声而忽略。
const PENDING_TTL_MS = 200;

export type HistoryIndexCallback = (index: ConversationRecord[]) => void;

/**
 * 跨标签页历史索引同步器。
 *
 * syncId 去回声机制：
 * - trackedWrite 生成唯一 writeId（形如 w_{ts}_{rand}），写入 pendingWriteIds，
 *   随 INDEX_KEY + SYNC_ID_KEY 一起落盘。
 * - onChanged 事件到达时，若 newValue.syncId 命中 pendingWriteIds，视为自身写入，忽略。
 * - pendingWriteIds 在写入后 PENDING_TTL_MS(200ms) 经 setTimeout 清除，
 *   超时后即使相同 syncId 的事件也被视为外部写入而触发回调。
 */
export class HistorySync {
  private pendingWriteIds = new Set<string>();
  private callback: HistoryIndexCallback | null = null;
  private listener:
    | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
    | null = null;

  /**
   * 注册 onChanged 监听。重复调用会先 stop 旧监听，保证同一时刻只有一个监听。
   */
  start(onIndexUpdated: HistoryIndexCallback): void {
    if (this.listener) {
      this.stop();
    }
    this.callback = onIndexUpdated;
    this.listener = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (!changes[INDEX_KEY]) return;

      // 回声保护：若事件携带的 syncId 在 pendingWriteIds 中，视为自身写入，忽略
      const syncIdChange = changes[SYNC_ID_KEY];
      const incomingSyncId =
        typeof syncIdChange?.newValue === 'string' ? syncIdChange.newValue : null;
      if (incomingSyncId && this.pendingWriteIds.has(incomingSyncId)) {
        return;
      }

      // 数据入口校验（R-1）：外部标签页写入的脏数据会经由本回调进入本地状态。
      // 与 store.ts 的 getHistoryIndex 复用同一个 sanitizeHistoryIndex，
      // 保证「本地读取」与「跨标签页同步」两条链路的校验规则完全一致，
      // 避免仅修其中一条导致脏数据仍能绕过校验触发渲染崩溃。
      const newIndex = sanitizeHistoryIndex(changes[INDEX_KEY].newValue);
      this.callback?.(newIndex);
    };
    chrome.storage.onChanged.addListener(this.listener);
  }

  /**
   * 移除监听并清空 pending 状态。
   */
  stop(): void {
    if (this.listener) {
      chrome.storage.onChanged.removeListener(this.listener);
      this.listener = null;
    }
    this.callback = null;
    this.pendingWriteIds.clear();
  }

  /**
   * 带去回声的写入：生成唯一 writeId 并随 INDEX_KEY + SYNC_ID_KEY 一起写入。
   * writeId 在 PENDING_TTL_MS(200ms) 后从 pendingWriteIds 移除。
   */
  async trackedWrite(index: ConversationRecord[]): Promise<void> {
    const writeId = `w_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.pendingWriteIds.add(writeId);
    try {
      await chrome.storage.local.set({
        [INDEX_KEY]: index,
        [SYNC_ID_KEY]: writeId,
      });
    } finally {
      // 200ms 后清除 pending 标记，使同 syncId 的迟延事件能再次触发回调
      setTimeout(() => {
        this.pendingWriteIds.delete(writeId);
      }, PENDING_TTL_MS);
    }
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistorySync } from '../../src/lib/history/sync.js';
import type { ConversationRecord } from '../../src/lib/shared-types/index.js';

// 存储 Key 逐字断言（契约）
const INDEX_KEY = 'bili-agent-history-index';
const SYNC_ID_KEY = 'bili-agent-history-sync-id';

function makeRecord(id: string, overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id,
    title: `Chat ${id}`,
    titleFinal: false,
    createdAt: 100,
    lastActiveAt: 200,
    messageCount: 1,
    ...overrides,
  };
}

describe('HistorySync', () => {
  let sync: HistorySync;
  let callback: ReturnType<typeof vi.fn>;
  let registeredListener:
    | ((
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => void)
    | null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    registeredListener = null;

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      (cb: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
        registeredListener = cb;
      },
    );
    (
      chrome.storage.onChanged.removeListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      (cb: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
        if (registeredListener === cb) registeredListener = null;
      },
    );

    sync = new HistorySync();
    callback = vi.fn();
  });

  afterEach(() => {
    sync.stop();
  });

  describe('start', () => {
    it('registers an onChanged listener', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
      expect(registeredListener).not.toBeNull();
    });

    it('repeated start stops old listener first (addListener 2x, removeListener 1x)', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(2);
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
    });

    it("does not trigger callback when areaName !== 'local'", () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      registeredListener!({ [INDEX_KEY]: { newValue: [] } }, 'sync');
      expect(callback).not.toHaveBeenCalled();
    });

    it('does not trigger callback when INDEX_KEY is not in changes', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      registeredListener!({ someOtherKey: { newValue: 'x' } }, 'local');
      expect(callback).not.toHaveBeenCalled();
    });

    it('does not trigger callback when syncId is in pendingWriteIds (echo guard)', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      // 模拟 trackedWrite 加入的 pendingWriteId
      const writeId = 'w_1000_abc123';
      (sync as unknown as { pendingWriteIds: Set<string> }).pendingWriteIds.add(writeId);

      registeredListener!(
        {
          [INDEX_KEY]: { newValue: [{ id: 'c1' }] },
          [SYNC_ID_KEY]: { newValue: writeId },
        },
        'local',
      );
      expect(callback).not.toHaveBeenCalled();
    });

    it('triggers callback with new index when INDEX_KEY changes and syncId does not match', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      const newIndex = [makeRecord('c1')];
      registeredListener!(
        {
          [INDEX_KEY]: { newValue: newIndex },
          [SYNC_ID_KEY]: { newValue: 'other-write-id' },
        },
        'local',
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(newIndex);
    });

    it('triggers callback with empty array when INDEX_KEY is deleted (clearAllHistory across tabs)', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      registeredListener!(
        {
          [INDEX_KEY]: { newValue: undefined },
          [SYNC_ID_KEY]: { newValue: 'other-write-id' },
        },
        'local',
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([]);
    });

    it('triggers callback when SYNC_ID_KEY newValue is not a string (non-echo treated as external)', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      registeredListener!(
        {
          [INDEX_KEY]: { newValue: [makeRecord('c1')] },
          [SYNC_ID_KEY]: { newValue: 12345 },
        },
        'local',
      );
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('calls removeListener', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      sync.stop();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
    });

    it('after stop, simulated events do not trigger callback', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      const capturedListener = registeredListener;
      sync.stop();
      capturedListener!(
        {
          [INDEX_KEY]: { newValue: [makeRecord('c1')] },
          [SYNC_ID_KEY]: { newValue: 'some-id' },
        },
        'local',
      );
      expect(callback).not.toHaveBeenCalled();
    });

    it('after stop, pendingWriteIds is cleared', () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      (sync as unknown as { pendingWriteIds: Set<string> }).pendingWriteIds.add('w_1');
      sync.stop();
      expect((sync as unknown as { pendingWriteIds: Set<string> }).pendingWriteIds.size).toBe(0);
    });
  });

  describe('trackedWrite', () => {
    it('writes INDEX_KEY and SYNC_ID_KEY to chrome.storage.local', async () => {
      const index = [makeRecord('c1')];
      await sync.trackedWrite(index);

      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(callArg[INDEX_KEY]).toEqual(index);
      expect(typeof callArg[SYNC_ID_KEY]).toBe('string');
      expect((callArg[SYNC_ID_KEY] as string).startsWith('w_')).toBe(true);
    });

    it('own trackedWrite event does not trigger callback (echo guard end-to-end)', async () => {
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      const index = [makeRecord('c1')];
      await sync.trackedWrite(index);

      // writeId 已加入 pendingWriteIds；模拟 onChanged 事件
      const callArg = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const writeId = callArg[SYNC_ID_KEY] as string;

      registeredListener!(
        {
          [INDEX_KEY]: { newValue: index },
          [SYNC_ID_KEY]: { newValue: writeId },
        },
        'local',
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('after TTL expires, same syncId event triggers callback (pendingWriteIds cleared)', async () => {
      vi.useFakeTimers();
      sync.start(callback as unknown as (index: ConversationRecord[]) => void);
      const index = [makeRecord('c1')];
      await sync.trackedWrite(index);

      const callArg = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const writeId = callArg[SYNC_ID_KEY] as string;

      // 推进超过 200ms TTL
      vi.advanceTimersByTime(201);

      // 此时相同 writeId 应已从 pendingWriteIds 移除
      registeredListener!(
        {
          [INDEX_KEY]: { newValue: index },
          [SYNC_ID_KEY]: { newValue: writeId },
        },
        'local',
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(index);
    });
  });
});

// 历史功能模块的 barrel 导出。
// 聚合存储原语（store）与跨标签页变更监听（sync）。
// 注意：本目录按 feature 聚合而非按 layer 聚合。
// save-orchestrator.ts（保存编排，SA-11）将并列在本目录下，但不在本任务范围内。
export {
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
  type SaveableConversation,
  type PersistedConversation,
} from './store.js';
export { HistorySync, type HistoryIndexCallback } from './sync.js';
// 历史索引数据入口校验（R-1）：store 与 sync 共用的纯函数校验器
export { sanitizeHistoryIndex } from './validate.js';

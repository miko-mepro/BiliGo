# 02-状态管理与数据生命周期

## 分类说明

本类问题集中在前端状态管理、数据生命周期和异步操作的状态一致性上，涉及全局状态替换、数据校验缺失、异步竞态导致过期状态更新。这些问题共同影响扩展在多次操作、视图切换和跨标签页同步场景下的数据正确性：部分数据缺少结构校验导致渲染崩溃，部分数据缺少归属模型导致旧数据被新数据覆盖，部分异步操作在视图切换后仍写入过期状态。

调查范围覆盖三个数据域：

1. 视频结果的全局状态管理（`SET_VIDEOS` 直接替换）。
2. 历史记录的存储读取与跨标签页同步（类型校验缺失）。
3. 异步操作（历史重命名、连接测试）完成时机与视图切换的竞态。

## 包含问题

| 编号 | 问题名称 | 严重程度 | 代码位置 |
| --- | --- | --- | --- |
| S-3 | 视频结果缺少批次归属模型，新搜索覆盖旧视频 | HIGH | `Main/src/content/chat-context.tsx:166-179`, `Main/src/components/MessageList.tsx:144-195` |
| R-1 | 历史标题类型校验缺失导致搜索渲染抛错 | CRITICAL | `Main/src/components/HistoryDropdown.tsx:214-219`, `Main/src/lib/history/store.ts:59-65`, `Main/src/lib/history/sync.ts:52-56` |
| R-2 | 历史重命名异步竞态，结果可能晚于视图卸载 | MEDIUM | `Main/src/components/HistoryDropdown.tsx:172-194`, `Main/src/components/Panel.tsx:608-631` |
| R-3 | 连接测试结果可能覆盖新的 Provider 状态 | MEDIUM | `Main/src/components/model-settings/TestConnectionButton.tsx:115-189` |

## 涉及代码模块

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 聊天上下文 | `Main/src/content/chat-context.tsx` | 视频状态 reducer、insight 追加、流式状态清理 |
| 消息列表 | `Main/src/components/MessageList.tsx` | 视频网格渲染、排序筛选状态重置 |
| 历史下拉 | `Main/src/components/HistoryDropdown.tsx` | 历史记录搜索过滤、重命名确认 |
| 历史存储 | `Main/src/lib/history/store.ts` | 读写 `bili-agent-history-index` |
| 历史同步 | `Main/src/lib/history/sync.ts` | 跨标签页 `storage` 事件同步 |
| 连接测试按钮 | `Main/src/components/model-settings/TestConnectionButton.tsx` | `Promise.race` 等待结果或超时 |
| 设置面板 | `Main/src/components/Panel.tsx` | 视图切换、组件卸载 |
| 错误边界 | `Main/src/content/error-boundary.tsx` | 捕获 render 异常 |

## 共性问题特征

### 特征一：外部数据进入状态时缺少结构校验

S-3 和 R-1 共同体现外部数据进入前端状态时缺少结构校验的问题。

- S-3 中，`videos` 消息（`port-protocol.ts:6-17`）只包含视频数组，没有消息 ID、搜索批次 ID 或锚点 ID。`SET_VIDEOS`（`chat-context.tsx:166-179`）直接替换 `state.videos`，不保留旧数组。协议和状态均缺少批次归属字段，导致旧视频无法挂在旧输出下。
- R-1 中，`store.ts:59-65` 只判断存储值是否为数组，随后将数组强制转换为 `ConversationRecord[]`，没有逐条校验 `id`、`title` 和时间字段。`sync.ts:52-56` 对跨标签页同步数据也只判断是否为数组。当历史索引中存在 `title: null`、数字或对象时，搜索框输入非空字符即触发 `r.title.toLowerCase()` 抛出 `TypeError`。

两者共性是：从存储或 Port 消息进入状态的数据没有经过结构完整性检查，直接信任外部数据形状。

### 特征二：异步操作结果在视图切换后写入过期状态

R-2 和 R-3 共同体现异步操作结果在视图切换后写入过期状态的问题。

- R-2 中，`handleRenameConfirm`（`HistoryDropdown.tsx:172-194`）在 `await onRename(id, newTitle)` 返回后才执行 `setRecords`，并在 `finally` 中执行 `setEditing(null)`。而 `Panel.tsx:608-631` 在切换到设置视图时不再渲染 `HistoryDropdown`。异步操作返回后，旧闭包仍执行状态更新和 ref 写入。
- R-3 中，连接测试使用 `Promise.race` 等待 service worker 响应或 12 秒超时。Provider 变化或组件卸载时，现有 cleanup 只移除 listener 和 timer，没有取消已经创建的 Promise。旧请求仍可能在 `:175-185` 完成并调用 `setStatus`、`setErrorMessage`、`setIsTimeout`。

两者共性是：异步操作创建的 Promise 在组件卸载或状态变化后没有取消机制，旧结果可能覆盖新状态。React 运行时通常会忽略卸载组件的 `setState`，但不能保证不产生过期状态覆盖。

### 特征三：数据生命周期不一致

S-3 体现数据生命周期不一致的问题。`chat-context.tsx:283-308` 对 understanding、expansion、rerank 采用追加策略，而视频数组采用替换策略。`MessageList.tsx:79-90` 将 insight 按 `receivedAt` 与消息时间排序。同一会话多次搜索时，旧 insight 会继续出现在消息流中，而视频网格已经只剩最新一组视频，二者生命周期不一致。

## 修复方向参考

- 建立统一的数据入口校验层，对从存储和跨标签页同步进入状态的数据进行结构完整性检查，拒绝非字符串 `title` 等异常数据。
- 为视频结果引入批次归属模型（`searchId`/`batchId`/`messageId`），使旧视频能挂在旧输出下。
- 为异步操作引入取消机制（`AbortController` 或 `cancelled` 标志），在组件卸载或状态变化时取消未完成的 Promise。
- 任何修复均应参阅原始文档 `docs/搜索结果展示与重排问题记录.md` 和 `docs/渲染崩溃问题记录.md` 中的复现所需最小证据。

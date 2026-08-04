# 03-UI渲染与交互

## 分类说明

本类问题集中在 React 组件的 UI 渲染时机和用户交互体验上，涉及工具辅助消息的展示时机和无条件自动滚动行为。这些问题共同影响用户在搜索过程中的阅读体验：辅助内容在工具结果到达后立即进入 UI，而自动滚动没有用户阅读保护，导致用户无法在流式输出期间稳定阅读上方内容。

调查范围覆盖两个渲染链路：

1. `bilibili_search`、`video_rerank` 等工具结果从 service worker 推送到 content script 的时机。
2. `MessageList` 组件对视频网格、筛选排序控件、insight 卡片和流式文本的渲染与滚动行为。

## 包含问题

| 编号 | 问题名称 | 严重程度 | 代码位置 |
| --- | --- | --- | --- |
| S-1 | 搜索辅助内容在工具结果到达后立即展示 | MEDIUM | `Main/src/background/stream.ts:182-220`, `Main/src/components/MessageList.tsx:144-195` |
| S-2 | 自动滚动缺少用户阅读保护 | HIGH | `Main/src/components/MessageList.tsx:93-96` |

## 涉及代码模块

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 流处理层 | `Main/src/background/stream.ts` | 工具结果转换为 `videos`/`insight` 消息并推送 |
| 消息列表 | `Main/src/components/MessageList.tsx` | 消息与 insight 合并排序、视频网格渲染、自动滚动 effect |
| 聊天上下文 | `Main/src/content/chat-context.tsx` | `SET_VIDEOS`、`APPEND_STREAMING`、`APPEND_REASONING` 派发 |
| Port 协议层 | `Main/src/background/port-protocol.ts` | `videos`/`insight` 消息类型定义 |
| Insight 卡片 | `Main/src/components/AgentInsightCard.tsx` | understanding/expansion/rerank 卡片渲染 |

## 共性问题特征

### 特征一：工具结果在最终 `tool_result` 之前进入 UI

S-1 确认 `stream.ts` 在消费 AI SDK 流的 `tool-result` 事件时，先调用 `postToolAuxiliaryMessages`，再推送 `tool_result`：

- `stream.ts:354-366`：收到工具结果后调用辅助消息函数，再发送 `tool_result`。
- `stream.ts:182-185`：`bilibili_search` 输出转换为 `{ type: 'videos', videos: ... }`。
- `stream.ts:186-220`：理解、查询扩展、重排和澄清结果转换为 `insight` 消息。
- `port-protocol.ts:6-17`：协议允许 `videos` 和 `insight` 作为独立 UI 消息传递。

因此，辅助 UI 消息不等待最终 `tool_result` 或整段文本结束，就在工具结果可用的时点先进入 content script。`MessageList` 随状态更新渲染视频网格、筛选控件和 insight 卡片，导致搜索过程中多个 UI 区域立即变化。

### 特征二：自动滚动 effect 依赖高频更新源

S-2 确认 `MessageList.tsx:93-96` 的 effect 监听四类依赖，任一变化都会无条件调用 `scrollIntoView({ behavior: 'smooth' })`：

| 依赖 | 触发时机 | 影响 |
| --- | --- | --- |
| `renderItems.length` | 新消息或新 insight 进入合并列表 | 滚动到底部 |
| `state.streamingContent` | 每个流式文本 chunk 更新 | 高频滚动 |
| `state.streamingReasoning` | 推理文本更新 | 高频滚动 |
| `videos` | Search 或 rerank 推送新数组 | 滚动到底部 |

`chat-context.tsx:395-403` 证明 chunk 和 reasoning 会分别派发 `APPEND_STREAMING`、`APPEND_REASONING`；`chat-context.tsx:428-432` 证明视频消息会派发 `SET_VIDEOS`。因此，用户在流式输出期间手动上拉时，只要继续收到 chunk、reasoning 或视频数组更新，就会再次触发滚动。

### 特征三：缺少用户阅读状态保护

`MessageList.tsx` 没有发现以下机制：

- 监听滚动容器并判断用户是否接近底部。
- `isAtBottom`、`userScrolled` 或类似状态。
- 用户主动上拉后暂停自动滚动的标记。
- 仅在新消息到达且用户已经位于底部时滚动的条件判断。

因此，"用户无法在流式输出尚未结束时稳定阅读上方内容"的代码风险已静态确认。需要注意：insight 卡片的 `isExpanded` 是 `AgentInsightCard.tsx:101-116` 的局部状态，展开/收起本身不在 `MessageList` effect 依赖中，不能直接说"每次展开都会单独调用滚动"；如果展开期间又有流式状态更新，后续依赖变化仍会把视图拉到底部。

### 特征四：测试覆盖不足

`Main/test/components/MessageList.test.tsx:6-7` 仅把 `scrollIntoView` 替换为 mock，没有断言以下行为：

- 流式文本变化时是否滚动。
- 推理文本变化时是否滚动。
- 视频数组变化时是否滚动。
- 用户手动上拉后是否应停止滚动。

当前没有测试能证明用户阅读保护存在；静态代码反而证明该保护不存在。

## 修复方向参考

- 评估是否应将辅助内容展示延迟到最终 `tool_result` 之后，或引入"搜索输出块"概念统一管理视频和 insight 的展示时机。
- 为自动滚动引入用户阅读状态保护：监听滚动容器判断用户是否接近底部，用户主动上拉后暂停自动滚动，仅在新消息到达且用户已位于底部时恢复滚动。
- 补充 `MessageList` 滚动行为的测试覆盖，包括流式文本、推理文本、视频数组变化时的滚动调用频率和用户上拉后的行为。
- 任何修复均应参阅原始文档 `docs/搜索结果展示与重排问题记录.md` 中的复现所需最小证据，确认浏览器实际渲染顺序和闪烁频率后再实施。

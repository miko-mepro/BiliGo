# 04-排序与重排逻辑

## 分类说明

本类问题集中在后端重排逻辑与前端客户端排序的优先级冲突上。核心矛盾是：service worker 层确实构造了重排后的视频数组并通过协议推送，但 `MessageList` 的客户端默认排序会在最终 DOM 渲染前覆盖后端重排顺序，导致用户通常看不到重排效果。

调查范围覆盖三个环节：

1. `video_rerank` 工具在 service worker 层的重排逻辑和视频数组推送。
2. `MessageList` 的客户端排序状态（`sortField`、`applySortAndFilter`）。
3. 视频数组引用变化时的排序状态重置行为。

## 包含问题

| 编号 | 问题名称 | 严重程度 | 代码位置 |
| --- | --- | --- | --- |
| S-4 | 客户端排序覆盖后端重排顺序 | HIGH | `Main/src/components/MessageList.tsx:44-61`, `Main/src/utils/sort-filter.ts:32-57`, `Main/src/background/stream.ts:200-212` |

## 涉及代码模块

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 流处理层 | `Main/src/background/stream.ts` | `video_rerank` 重排逻辑、视频数组推送 |
| 消息列表 | `Main/src/components/MessageList.tsx` | 客户端排序状态、`applySortAndFilter` 调用、状态重置 |
| 排序筛选工具 | `Main/src/utils/sort-filter.ts` | `sortVideos` 复制数组并按字段降序排序、先过滤再排序 |
| 筛选排序控件 | `Main/src/components/FilterSortControls.tsx` | 用户排序选择回调 |
| Insight 卡片 | `Main/src/components/AgentInsightCard.tsx` | rerank body 展示策略、裁剪数量、保留数量 |

## 问题详解

### 后端重排已确认存在

`video_rerank` 的辅助消息逻辑位于 `stream.ts:200-212`：

1. `:203` 先推送 `insight(rerank)`。
2. `:207` 从 tool input 提取原始候选视频。
3. `:209` 调用 `reorderVideosByRerank(candidates, rerankResult.items)`。
4. `:210` 推送 `{ type: 'videos', videos: reordered }`。

`reorderVideosByRerank` 在 `stream.ts:257-287` 按 `rerankItems` 的 `bvid` 顺序取卡片，再把未涉及的候选按原序追加。因此，service worker 层不是只把排序结果写到文本中，而是确实构造了重排后的视频数组。

现有 `Main/test/background/stream.test.ts:557-620` 已验证：输入 `[BV1, BV2, BV3]`，重排结果为 `BV2、BV1、BV3` 时，推送的视频消息顺序也是 `BV2、BV1、BV3`，且消息顺序为 `insight -> videos -> tool_result`。

### 客户端最终顺序覆盖

问题出现在 `MessageList` 的客户端处理：

- `MessageList.tsx:44-47` 的默认 `sortField` 是 `'play'`。
- `MessageList.tsx:58-61` 对视频调用 `applySortAndFilter`。
- `sort-filter.ts:32-57` 的 `sortVideos` 会复制数组并按所选字段降序排序。
- `sort-filter.ts:110-117` 明确先过滤、再排序。
- `MessageList.tsx:172-177` 渲染的是 `processedVideos`，不是未经处理的 `state.videos`。

因此，当重排顺序与播放量顺序不一致时，后端送来的重排顺序会在最终 DOM 渲染前被播放量排序覆盖。只有当两种顺序恰好一致时，用户才会看到看似生效的重排。

### 视频数组引用变化触发状态重置

`MessageList.tsx:49-56` 在 `videos` 数组引用变化时将 `sortField`、日期筛选和时长筛选重置为默认值。`video_rerank` 的第二次 `videos` 推送会产生新的数组引用，因此它不仅可能覆盖重排顺序，还会把用户此前选择的客户端排序恢复为播放量排序。

### Insight 卡片的实际作用

`AgentInsightCard.tsx:142-147` 的 rerank body 只展示：

- 策略是 LLM 还是 Fallback。
- 裁剪数量。
- 保留结果数量。

它不读取 `bvid` 顺序，也不参与 `processedVideos` 计算。因此"重排只应用在输出文本上"这一判断不准确；更精确的结论是：**重排数组已通过协议到达，但客户端默认播放量排序使其最终可见顺序通常不可见。**

## 共性问题特征

### 特征一：后端逻辑与前端渲染解耦但缺少优先级协调

后端重排和客户端排序是两个独立的排序逻辑，分别服务于不同目的：

- 后端重排（`video_rerank`）基于 LLM 或 Fallback 策略，按相关性重排候选视频。
- 客户端排序（`applySortAndFilter`）按用户选择的字段（播放量、日期、时长等）降序排序。

两者缺少优先级协调机制：后端重排的顺序到达前端后，客户端排序无条件覆盖，没有"当后端已重排时应保留重排顺序"的判断。

### 特征二：用户手动选择被无条件重置

`MessageList.tsx:49-56` 在视频数组引用变化时重置用户手动选择的 `sortField` 和筛选条件。这导致：

- 用户手动选择按日期排序后，新的视频数组到达会重置为播放量排序。
- `video_rerank` 的第二次推送会触发重置，使用户在重排过程中的选择失效。

这个行为属于已确认的状态行为，与排序覆盖问题叠加，进一步削弱用户对最终卡片顺序的控制。

## 修复方向参考

- 明确产品需求：当后端重排顺序到达时，客户端应优先保留重排顺序还是用户手动排序选择。
- 如果应保留重排顺序，需在 `applySortAndFilter` 之前增加判断，当 `sortField` 为默认值且后端已重排时跳过客户端排序。
- 评估是否应在视频数组引用变化时保留用户手动选择，而非无条件重置。
- 补充 rerank 数组经过 `MessageList` 后最终 DOM 顺序的测试覆盖，以及 rerank 顺序与默认播放量排序冲突时的测试用例。
- 任何修复均应参阅原始文档 `docs/搜索结果展示与重排问题记录.md` 中的复现所需最小证据，确认 rerank 与播放量排序在实际数据中是否确实存在不同顺序后再实施。

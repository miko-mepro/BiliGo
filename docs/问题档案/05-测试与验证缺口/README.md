# 05-测试与验证缺口

## 分类说明

本类问题集中在测试覆盖率和自动化测试基础设施的缺陷上。三份原始问题记录文档在调查过程中均发现测试覆盖不足或 E2E 测试阻塞，导致部分代码风险只能通过静态分析确认，无法通过自动化测试验证运行时行为。

本类不收录具体的代码缺陷，而是收录测试体系的缺口清单，作为修复任务的前置验证条件。

## 包含文档说明

### 文档一：测试覆盖缺口清单

原始文档中记录的测试覆盖缺口共7项，分布在网络层、状态管理层和 UI 渲染层：

| 序号 | 缺口描述 | 涉及模块 | 来源文档 |
| --- | --- | --- | --- |
| 1 | 用户上拉后继续流式输出时不应自动滚动 | `MessageList.tsx:93-96` | 搜索结果展示与重排问题记录 |
| 2 | `scrollIntoView` 在每个 chunk、reasoning 或视频数组更新时的调用频率 | `MessageList.tsx:93-96` | 搜索结果展示与重排问题记录 |
| 3 | 两次搜索的结果是否应按消息批次同时保留 | `chat-context.tsx`、`MessageList.tsx` | 搜索结果展示与重排问题记录 |
| 4 | 旧视频与旧 insight 的归属是否一致 | `chat-context.tsx:283-308` | 搜索结果展示与重排问题记录 |
| 5 | rerank 数组经过 `MessageList` 后的最终 DOM 顺序 | `MessageList.tsx:44-61`、`sort-filter.ts` | 搜索结果展示与重排问题记录 |
| 6 | rerank 顺序与默认播放量排序冲突时，产品应优先哪一种 | `MessageList.tsx:44-47` | 搜索结果展示与重排问题记录 |
| 7 | 视频数组更新后是否应该重置用户手动选择的筛选/排序 | `MessageList.tsx:49-56` | 搜索结果展示与重排问题记录 |

### 文档二：E2E 运行阻塞问题

原始文档 `docs/渲染崩溃问题记录.md` 记录了 Playwright E2E 测试在 content script 挂载前失败的情况：

- 测试代理执行 `cd Main && npm run build` 成功，Vite 构建完成，仅出现 chunk 大小警告，没有编译错误。
- 测试代理先安装了缺失的 Chromium，然后执行目标 smoke 测试。
- 测试在 `Main/e2e/fixtures/extension-harness.ts:85-87` 等待 `[data-bili-agent-toggle]` 时失败，未进入打开面板和按钮交互阶段。
- 诊断文件 `Main/test-results/smoke-BiliGo-panel-UX-no-b-a381c-e-edge-and-expands-on-hover-chromium-extension/error-context.md:15-23` 记录错误：`Error: Channel closed` 和 `Error: page.goto: Target page, context or browser has been closed`。

由于 E2E 阻塞，本次调查没有获得以下目标证据：

- 点击顺序和点击间隔。
- React 错误边界文案。
- 浏览器控制台中的 render stack。
- 事件处理器异常或 `Maximum call stack size exceeded`。
- 目标点击序列期间的网络/Port 时间线。

当前稳定复现的只是 E2E 前置失败：扩展页面在限定时间内没有出现 `[data-bili-agent-toggle]`。这可能是扩展注入、测试页面、浏览器上下文关闭或 service worker 启动问题，不能等同于用户描述的按钮渲染崩溃。

## 涉及代码模块

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 消息列表测试 | `Main/test/components/MessageList.test.tsx` | mock `scrollIntoView`，但缺少滚动行为断言 |
| 流处理测试 | `Main/test/background/stream.test.ts` | 已覆盖推送顺序，但缺少最终 DOM 顺序断言 |
| 聊天上下文测试 | `Main/test/content/chat-context.test.ts` | 已覆盖 `SET_VIDEOS` 写入，但缺少批次归属断言 |
| 排序筛选测试 | `Main/test/utils/sort-filter.test.ts` | 已覆盖排序和过滤，但缺少 rerank 冲突场景 |
| E2E 测试夹具 | `Main/e2e/fixtures/extension-harness.ts` | 等待 content script 挂载，当前阻塞 |

## 共性问题特征

### 特征一：已有测试覆盖推送逻辑，但缺少最终行为断言

现有测试可以证明"后端重排消息发送正确"和"通用客户端排序正确"，但不能证明"用户最终看到的卡片顺序正确"。测试覆盖停留在数据推送和 reducer 层面，没有覆盖从状态到最终 DOM 渲染的完整链路。

`MessageList.test.tsx:6-7` 仅把 `scrollIntoView` 替换为 mock，没有断言滚动行为；`stream.test.ts:557-620` 验证了推送顺序，但没有验证经过 `MessageList` 客户端排序后的最终 DOM 顺序。

### 特征二：E2E 基础设施阻塞运行时验证

三份原始文档均强调部分问题"不能仅凭静态代码分析确定，需要运行时证据确认"。但当前 E2E 测试在 content script 挂载前失败，无法执行目标按钮点击和交互验证。这导致：

- 渲染崩溃问题（R-1、R-2、R-3）无法通过 E2E 获取浏览器堆栈。
- 自动滚动行为（S-2）无法通过 E2E 验证实际滚动频率和用户阅读保护效果。
- 客户端排序覆盖（S-4）无法通过 E2E 验证最终 DOM 顺序。

### 特征三：产品需求未明确导致测试无法定义预期行为

部分测试缺口不是测试技术问题，而是产品需求未明确：

- rerank 顺序与默认播放量排序冲突时，产品应优先哪一种（缺口6）。
- 视频数组更新后是否应该重置用户手动选择的筛选/排序（缺口7）。
- 两次搜索的结果是否应按消息批次同时保留（缺口3）。

这些问题需要产品决策后才能定义测试预期行为，不能仅由测试工程师补全。

## 修复方向参考

- 优先解决 E2E 阻塞问题，恢复 content script 挂载阶段的测试能力，使后续修复能通过运行时验证。
- 补充 `MessageList` 滚动行为的测试覆盖，包括流式文本、推理文本、视频数组变化时的滚动调用频率和用户上拉后的行为。
- 补充 rerank 数组经过 `MessageList` 后最终 DOM 顺序的端到端测试。
- 在产品需求明确后，补充缺口3、6、7 对应的预期行为测试。
- 任何测试补充均应参阅原始文档中的"已有覆盖"和"缺少覆盖"清单，避免重复测试已有路径。

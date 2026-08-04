# E2E 运行阻塞问题

## 基本信息
- **严重程度**: HIGH
- **问题类型**: 测试基础设施
- **确认状态**: 已确认
- **来源文档**: 渲染崩溃问题记录.md
- **发现日期**: 2026-08-01

## 代码位置
- `Main/e2e/fixtures/extension-harness.ts:85-87`：E2E 等待 `[data-bili-agent-toggle]` 选择器的位置，此处为扩展挂载后的目标按钮探针。
- `Main/test-results/smoke-BiliGo-panel-UX-no-b-a381c-e-edge-and-expands-on-hover-chromium-extension/error-context.md:15-23`：失败现场的错误上下文记录，包含浏览器关闭与通道断开的原始信息。

## 问题描述

现有 Playwright E2E 在 content script 挂载前失败，未执行任何目标按钮点击，因此没有获得用户现象对应的浏览器崩溃堆栈。测试代理先安装了缺失的 Chromium，然后执行了目标 smoke 测试。测试在 `extension-harness.ts:85-87` 等待 `[data-bili-agent-toggle]` 时失败，未进入打开面板和按钮交互阶段。

具体表现为：测试启动浏览器并加载扩展后，harness 在限定时间内没有等到目标按钮出现在 DOM 中。随后浏览器通道被关闭，`page.goto` 报告目标页面、上下文或浏览器已被关闭。这一失败发生在任何用户交互之前，因此用户描述的"按钮渲染崩溃"现象在 E2E 中从未被触发，相关浏览器侧证据全部缺失。

## 错误信息

- `Channel closed`
- `page.goto: Target page, context or browser has been closed`

两条错误叠加出现，表明浏览器实例在 harness 等待期间已经不可用。`Channel closed` 通常指向浏览器进程与 Playwright 之间的通信通道断开，而 `page.goto` 的错误进一步确认页面层已失效。由于失败发生在等待选择器阶段，没有进入任何导航或点击动作，可以排除"点击导致崩溃"的可能。

## 影响

由于 E2E 在扩展挂载阶段就失败，没有获得以下目标证据：

- **点击顺序和点击间隔**：用户描述的崩溃可能与连续点击目标按钮的顺序或间隔有关，但 E2E 未执行任何点击，无法采集点击时间线。
- **React 错误边界文案**：如果崩溃发生在渲染层，React 错误边界会展示兜底文案，但 E2E 未进入面板打开阶段，无法捕获错误边界内容。
- **浏览器控制台中的 render stack**：渲染崩溃通常伴随 React 警告或错误堆栈输出到控制台，但浏览器通道已关闭，控制台日志无法采集。
- **事件处理器异常或 Maximum call stack size exceeded**：递归渲染或事件循环爆栈会在控制台抛出 `Maximum call stack size exceeded`，但 E2E 失败后浏览器实例已被销毁，无法捕获。
- **目标点击序列期间的网络/Port 时间线**：点击按钮触发的 service worker 与 content script 之间的 Port 通信时间线是定位崩溃的关键证据，但 E2E 未触发任何 Port 通信。

当前稳定复现的只是 E2E 前置失败：扩展页面在限定时间内没有出现 `[data-bili-agent-toggle]`。这可能是扩展注入、测试页面、浏览器上下文关闭或 service worker 启动问题，不能等同于用户描述的按钮渲染崩溃。换言之，当前阻塞的是"能否进入崩溃场景"，而非"崩溃本身是否复现"。

## 修复方向

修复 E2E 测试的扩展挂载阶段，排查 `extension-harness` 的 content script 注入时机和 service worker 启动状态。具体建议如下：

1. **确认扩展已正确加载**：检查 Playwright 启动参数是否将扩展目录正确传递给 Chromium，并确认扩展在 `chrome://extensions` 中处于启用状态且无错误。
2. **确认 content script 注入时机**：`extension-harness.ts:85-87` 等待选择器时，需要确认目标页面已经完成 content script 注入。如果注入时机晚于等待开始，需要增加注入完成的探针或延长等待策略。
3. **确认 service worker 启动状态**：扩展的 service worker 可能在浏览器启动后未立即激活，导致目标按钮的渲染依赖未就绪。建议在 harness 中增加 service worker 就绪检查。
4. **排查浏览器上下文关闭原因**：`Channel closed` 与 `page.goto` 报错表明浏览器实例在等待期间被销毁，需要排查是否有其他测试用例、超时策略或资源限制导致浏览器被提前关闭。
5. **恢复后再补充崩溃证据采集**：扩展挂载阶段修复后，再补充目标按钮点击序列、控制台日志采集、错误边界文案捕获和 Port 时间线记录等端到端验证，以确认用户描述的渲染崩溃是否复现。

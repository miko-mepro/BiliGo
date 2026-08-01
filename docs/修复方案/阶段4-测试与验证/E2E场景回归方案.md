# E2E 场景回归方案

> **阶段归属**：阶段4 测试与验证 · 工作二：E2E 场景回归
> **对应问题档案**：`docs/问题档案/05-测试与验证缺口/E2E运行阻塞问题.md`
> **来源记录**：`docs/渲染崩溃问题记录.md`、`docs/搜索结果展示与重排问题记录.md`、`docs/网络连接错误问题记录.md`
> **关联假设**：`docs/问题档案/06-待验证假设/搜索结果高风险假设清单.md`（S-V1 至 S-V5）、`docs/问题档案/06-待验证假设/网络层假设清单.md`（N-V1 至 N-V6）
> **完成状态**：pending

## 1. 方案目标

在阶段0 恢复 E2E 挂载能力后，对阶段1 到阶段3 的修复进行 E2E 场景回归。每个回归场景针对一个或多个已确认问题，在浏览器运行时验证修复后的行为是否符合预期，并采集用户现象对应的运行时证据。

本方案不修改 `Main/` 源码，只描述 E2E 测试场景的设计、执行步骤、预期结果和证据采集要求。

## 2. 前置依赖

| 依赖项 | 说明 | 阻塞关系 |
| --- | --- | --- |
| 阶段0 E2E 能力恢复 | smoke 测试能通过 `extension-harness.ts:85-87` 的 waitFor 阶段，进入面板打开和按钮交互 | 强阻塞：阶段0 未完成时所有 E2E 回归无法执行 |
| 阶段1 R-1 修复完成 | 异常历史标题不再触发 `TypeError` | 渲染崩溃回归依赖此项 |
| 阶段2 S-2、S-3、S-4 修复完成 | 自动滚动保护、批次保留、排序优先级 | 对应回归场景依赖 |
| 阶段3 N-1、N-3、N-4、S-1、R-2、R-3 修复完成 | 错误分类、断线检测、辅助内容时机、异步取消 | 对应回归场景依赖 |

**阶段4 执行时机声明**：阶段4 只能在阶段0、阶段1、阶段2、阶段3 的修复方案完成后执行。E2E 回归验证的是修复后的运行时行为，若修复未完成则回归无验证对象。

## 3. 阶段0 恢复挂载后的前置验证

在执行任何回归场景前，必须先验证阶段0 已恢复 E2E 挂载能力。

### 3.1 挂载能力验证

```
场景：阶段0 挂载恢复验证
前置条件：
  - Main/dist 构建产物存在且为最新
  - playwright.config.ts 的 launchOptions 已按阶段0 方案调整
  - extension-probe.spec.ts 存在

步骤：
  1. 运行 npx playwright test e2e/extension-probe.spec.ts --reporter=list
  2. 确认扩展 SW 已启动（context.serviceWorkers() 包含 chrome-extension:// SW）
  3. 确认 content script 已注入（#bili-agent-host 元素 attached）
  4. 确认 toggle 按钮已渲染（[data-bili-agent-toggle] 可见）

预期结果：
  - extension-probe.spec.ts 退出码 0
  - 不出现 Channel closed 或 page.goto: Target page, context or browser has been closed

失败处理：
  - 若 SW 未启动：检查 --load-extension 路径和 dist/manifest.json
  - 若 host 元素未出现：检查 content script 注入和 CSP
  - 若 toggle 未可见：延长 toggle 超时，检查 SW storage 响应
```

### 3.2 smoke 测试进入面板交互验证

```
场景：smoke 测试进入面板交互
前置条件：
  - 3.1 挂载能力验证通过

步骤：
  1. 运行 npx playwright test e2e/smoke.spec.ts --reporter=list
  2. 确认 "side toggle peeks from the page edge and expands on hover" 通过 openBilibiliWithMockedExtension 阶段
  3. 确认 "panel SPA navigation switches between chat and settings without reload" 通过 openPanel

预期结果：
  - smoke 测试退出码 0
  - 至少一条 smoke 测试进入面板打开和按钮交互阶段
```

## 4. E2E 回归场景

### 场景1：异常历史 title 搜索回归（R-1）

**覆盖问题**：R-1（历史标题类型校验缺失）
**依赖阶段**：阶段0 + 阶段1
**回归要求**：历史记录含异常 `title` 时搜索不再抛错

```
场景：异常历史 title 搜索不触发渲染崩溃
前置条件：
  - 阶段0 挂载能力已恢复（3.1、3.2 通过）
  - R-1 修复已完成：store.ts 和 sync.ts 接入 sanitizeHistoryIndex 校验，HistoryDropdown.tsx 增加渲染层兜底

步骤：
  1. 导航到 bilibili，等待 content script 挂载
  2. 通过 chrome.storage.local.set 向 bili-agent-history-index 注入脏数据：
     [
       { id: 'dirty-1', title: null, titleFinal: false, createdAt: 1, lastActiveAt: 2, messageCount: 1 },
       { id: 'dirty-2', title: 123, titleFinal: false, createdAt: 1, lastActiveAt: 2, messageCount: 1 },
       { id: 'clean-1', title: '正常对话', titleFinal: true, createdAt: 1, lastActiveAt: 2, messageCount: 1 }
     ]
  3. 打开面板（点击 [data-bili-agent-toggle]）
  4. 展开历史下拉
  5. 在搜索历史记录输入框输入非空字符（如 "测试"）
  6. 观察 UI 和控制台

预期结果：
  - 不出现 "BiliAgent 渲染异常" 错误边界 UI
  - 控制台无 TypeError: Cannot read properties of null (reading 'toLowerCase')
  - 脏数据记录（title 为 null/123）不出现在搜索结果中（被降级为空字符串后不匹配关键词）
  - 正常记录 "正常对话" 仍可正常搜索

证据采集：
  - 错误边界文案截图（若出现）
  - 控制台 TypeError 堆栈（若出现）
  - bili-agent-history-index 的 title 字段运行时类型（不记录完整内容）

失败分类：
  - 若出现 TypeError：R-1 修复未覆盖该路径，记录缺失的校验点
  - 若错误边界触发但无 TypeError：校验遗漏但渲染层兜底未生效
  - 若正常记录也无法搜索：校验逻辑误伤了正常数据
```

### 场景2：重命名后快速切换视图回归（R-2）

**覆盖问题**：R-2（历史重命名异步竞态）
**依赖阶段**：阶段0 + 阶段3
**回归要求**：历史重命名视图切换后不再写入过期状态

```
场景：重命名确认后快速切换到设置视图
前置条件：
  - 阶段0 挂载能力已恢复
  - R-2 修复已完成：HistoryDropdown 引入 AbortController 或 isMounted 标志

步骤：
  1. 导航到 bilibili，打开面板
  2. 展开历史下拉，选择一条历史记录进入重命名
  3. 输入新标题并确认（触发 handleRenameConfirm 的 await onRename）
  4. 在 onRename 尚未返回时，立即点击设置按钮切换到设置视图
  5. 等待 onRename 返回（模拟异步完成）
  6. 切回聊天视图，展开历史下拉

预期结果：
  - 切换到设置视图时 HistoryDropdown 卸载，不产生过期状态更新
  - 切回聊天视图后历史列表状态一致，重命名结果正确反映
  - 控制台无 "Can't perform a React state update on an unmounted component" 警告
  - 不出现 render crash

证据采集：
  - 视图切换时间线（点击设置按钮的时间戳）
  - onRename 返回时间戳
  - 控制台警告或错误
  - 切回后历史列表的 DOM 状态

失败分类：
  - 若出现 React state update on unmounted component 警告：R-2 取消机制未生效
  - 若历史列表状态不一致：过期状态更新未被阻止
  - 若出现 render crash：竞态导致的崩溃需记录堆栈
```

### 场景3：连接测试期间 Provider 切换回归（R-3 + N-3）

**覆盖问题**：R-3（连接测试结果过期覆盖）、N-3（设置 Port 无断线检测）
**依赖阶段**：阶段0 + 阶段3
**回归要求**：连接测试视图切换后不再写入过期状态，设置 Port 断线时前端及时感知

```
场景：连接测试期间切换 Provider
前置条件：
  - 阶段0 挂载能力已恢复
  - R-3 修复已完成：Promise.race 引入取消机制
  - N-3 修复已完成：设置 Port 注册 onDisconnect 处理

步骤：
  1. 导航到 bilibili，打开面板，切换到设置视图
  2. 选择 Provider A，配置 Base URL 和模型名
  3. 点击 "测试连接" 按钮
  4. 在等待响应期间（未返回前），立即切换到 Provider B
  5. 观察 Provider A 的响应返回后的 UI 状态
  6. 或在等待期间离开设置页，观察组件卸载后是否仍执行状态更新

预期结果：
  - Provider A 的响应返回后不覆盖 Provider B 的 UI 状态
  - 切换 Provider 时旧请求被取消（R-3 取消机制生效）
  - 若设置 Port 在测试期间断开，前端及时感知并给出反馈（N-3 onDisconnect 生效）
  - 不出现状态闪烁或与当前 Provider 不一致的结果

证据采集：
  - 点击 "测试连接" 的时间戳
  - 切换 Provider 的时间戳
  - Provider A 响应返回的时间戳
  - Provider B 的 UI 状态（是否被覆盖）
  - Port onDisconnect 事件记录
  - 错误文案（若出现）

失败分类：
  - 若 Provider A 结果覆盖 Provider B 状态：R-3 取消机制未生效
  - 若 Port 断开未及时反馈：N-3 onDisconnect 未注册或未触发
  - 若出现状态闪烁：取消机制存在时序窗口

记录 Port 时间线：
  - 设置 Port 建立时间
  - test_connection 消息发送时间
  - Port onDisconnect 时间（若触发）
  - connection_result 返回时间（若收到）
```

### 场景4：连续两次搜索回归（S-1、S-3、S-4）

**覆盖问题**：S-1（搜索辅助内容即时展示）、S-3（视频结果缺少批次归属模型）、S-4（客户端排序覆盖后端重排）
**依赖阶段**：阶段0 + 阶段2 + 阶段3
**回归要求**：两次搜索的结果按批次保留，旧视频挂在旧输出下，排序优先级符合产品决策

```
场景：同一对话内连续两次搜索
前置条件：
  - 阶段0 挂载能力已恢复
  - S-1 修复已完成：辅助内容展示时机调整
  - S-3 修复已完成：视频结果引入批次归属模型
  - S-4 修复已完成：排序优先级定义

步骤：
  1. 导航到 bilibili，打开面板，新建对话
  2. 发送第一次搜索请求（触发 bilibili_search）
  3. 记录第一次搜索返回的视频 bvid 顺序、播放量顺序和 insight 文案
  4. 等待流式输出完成
  5. 发送第二次搜索请求
  6. 记录第二次搜索返回的视频 bvid 顺序、播放量顺序和 insight 文案
  7. 观察 DOM 中两次搜索结果的存在和排列

预期结果：
  - 第一次搜索的视频仍保留在 DOM 中（按批次保留，S-3 生效）
  - 第二次搜索的视频挂载在第二次输出下，不覆盖第一次
  - 旧 insight 与旧视频归属一致（无语义错配）
  - 视频卡片顺序符合 S-4 产品决策（rerank 顺序或播放量顺序）
  - 搜索过程中 UI 区域不立即变化（S-1 时机调整生效）

证据采集：
  - 两次搜索返回的视频 bvid 顺序
  - 两次搜索返回的视频播放量顺序
  - rerank items 顺序（若触发了 video_rerank）
  - DOM 中消息、视频网格和 insight 卡片的相对位置快照
  - 搜索过程中 UI 区域变化的截图时间线

失败分类：
  - 若第一次视频被第二次覆盖：S-3 批次保留未生效
  - 若旧 insight 下方挂载新视频：S-3 归属一致性未生效
  - 若视频顺序不符合产品决策：S-4 排序优先级未生效
  - 若搜索过程中 UI 立即变化：S-1 时机调整未生效
```

### 场景5：连续两次上拉回归（S-2）

**覆盖问题**：S-2（自动滚动缺少用户保护）
**依赖阶段**：阶段0 + 阶段2
**回归要求**：流式输出期间用户上拉后不再自动滚动，新消息到达且用户在底部时恢复滚动

```
场景：流式输出期间用户上拉
前置条件：
  - 阶段0 挂载能力已恢复
  - S-2 修复已完成：自动滚动 effect 引入用户阅读状态保护

步骤：
  1. 导航到 bilibili，打开面板，发送一条消息触发流式输出
  2. 在流式输出期间（收到 chunk/reasoning），手动上拉阅读历史消息
  3. 观察上拉后是否被自动拉回底部
  4. 等待流式输出继续，观察是否持续被拉回
  5. 流式输出结束后，下拉到底部
  6. 再次触发流式输出，观察是否恢复自动跟随

预期结果：
  - 用户上拉后 scrollIntoView 不被调用（S-2 保护生效）
  - 流式输出期间用户上拉后不被持续拉回底部
  - 流式输出结束后或用户下拉到底部时，自动滚动恢复
  - 不出现滚动动画叠加和闪烁

证据采集：
  - 用户上拉时的 scrollTop 值
  - scrollIntoView 调用次数（通过 page.evaluate 注入计数器或监听 mock）
  - 每次流式 chunk 到达时的 scrollTop 变化
  - 用户可见的闪烁记录（屏幕录制或截图序列）

失败分类：
  - 若上拉后仍被拉回底部：S-2 用户阅读保护未生效
  - 若 scrollIntoView 调用次数过高：S-2 节流/批量合并未生效
  - 若恢复自动跟随失败：S-2 isAtBottom 判断逻辑有误
```

### 场景6：连续两次 rerank 回归（S-4）

**覆盖问题**：S-4（客户端排序覆盖后端重排）
**依赖阶段**：阶段0 + 阶段2
**回归要求**：rerank 数组经过 MessageList 后最终 DOM 顺序符合产品决策

```
场景：连续两次 rerank 推送
前置条件：
  - 阶段0 挂载能力已恢复
  - S-4 修复已完成：排序优先级定义

步骤：
  1. 导航到 bilibili，打开面板，发送搜索请求
  2. 等待第一次 rerank 推送，记录 rerank items 顺序和 DOM 中视频卡片顺序
  3. 用户手动切换排序字段（如切换到弹幕数排序）
  4. 触发第二次搜索和 rerank
  5. 记录第二次 rerank items 顺序和 DOM 中视频卡片顺序
  6. 观察用户手动选择是否被保留或重置

预期结果：
  - 第一次 rerank 后 DOM 顺序符合 S-4 产品决策
  - 用户手动切换排序后，DOM 顺序按用户选择排列
  - 第二次 rerank 推送后，用户手动选择被保留或重置（取决于产品决策）
  - 不出现 rerank 顺序被客户端默认排序静默覆盖

证据采集：
  - 两次 rerank 的 items 顺序（bvid 列表）
  - 两次 rerank 后 DOM 中视频卡片的 bvid 顺序
  - 视频播放量顺序（用于判断是否被播放量排序覆盖）
  - 用户手动切换排序的时间戳和切换后的 DOM 顺序
  - 第二次 rerank 后用户选择的状态（保留或重置）

失败分类：
  - 若 rerank 顺序被播放量排序覆盖：S-4 排序优先级未生效
  - 若用户手动选择被无条件重置：S-4 重置策略不符合产品决策
  - 若第二次 rerank 后顺序混乱：S-4 与 S-3 批次模型集成有问题

记录错误边界、Port、消息时间线：
  - 若上述场景中出现错误边界触发，记录错误边界文案和触发时间
  - 若上述场景中出现 Port 断开，记录 Port onDisconnect 时间和原因
  - 消息时间线：记录每次 videos、insight、chunk、reasoning、done 消息的到达时间戳和相对顺序
    （不记录 API Key、Cookie 或完整请求凭据）
```

## 5. E2E 回归场景汇总

| 场景 | 覆盖问题 | 依赖阶段 | 核心验证点 |
| --- | --- | --- | --- |
| 3.1 挂载能力验证 | E2E 阻塞 | 阶段0 | SW 启动、content script 注入、toggle 渲染 |
| 3.2 smoke 进入面板 | E2E 阻塞 | 阶段0 | openBilibiliWithMockedExtension 通过、openPanel 断言通过 |
| 场景1 | R-1 | 阶段0 + 阶段1 | 异常 title 搜索不触发 TypeError |
| 场景2 | R-2 | 阶段0 + 阶段3 | 重命名后快速切换视图不写入过期状态 |
| 场景3 | R-3 + N-3 | 阶段0 + 阶段3 | 连接测试期间 Provider 切换不覆盖新状态 |
| 场景4 | S-1 + S-3 + S-4 | 阶段0 + 阶段2 + 阶段3 | 两次搜索按批次保留、排序优先级 |
| 场景5 | S-2 | 阶段0 + 阶段2 | 用户上拉后不自动滚动 |
| 场景6 | S-4 | 阶段0 + 阶段2 | rerank 最终 DOM 顺序符合产品决策 |

## 6. 证据采集要求

### 6.1 采集范围

| 证据类型 | 采集方式 | 敏感性处理 |
| --- | --- | --- |
| 浏览器控制台日志 | `page.on("console", ...)` | 过滤含 API Key / Cookie / token 的文本 |
| React 错误边界文案 | DOM 查询错误边界元素文本 | 无敏感信息 |
| render stack | 控制台 error 级别日志 | 过滤敏感信息 |
| Maximum call stack size exceeded | 控制台 error 日志 | 无敏感信息 |
| scrollIntoView 调用次数 | `page.evaluate` 注入计数器 | 无敏感信息 |
| scrollTop 值 | `page.evaluate(() => document.documentElement.scrollTop)` | 无敏感信息 |
| DOM 节点相对位置 | `page.evaluate` 查询节点顺序 | 不记录文本内容，只记录 bvid 和节点存在性 |
| Port onDisconnect 时间 | service worker 控制台日志 | 无敏感信息 |
| 消息时间线 | service worker 控制台记录 videos/insight/chunk/reasoning/done 到达时间 | 不记录 API Key、Cookie 或完整请求凭据 |
| 视频 bvid 顺序 | DOM 查询 VideoCard 节点 | 无敏感信息 |
| 播放量顺序 | DOM 查询或消息记录 | 无敏感信息 |
| rerank items 顺序 | 消息记录 | 无敏感信息 |

### 6.2 不采集的内容

依据 `docs/渲染崩溃问题记录.md:142` 和 `docs/问题档案/06-待验证假设/网络层假设清单.md` 的要求，不记录：
- API Key
- Cookie
- 完整请求凭据
- `bili-agent-history-index` 的完整内容（只记录 `title` 字段的运行时类型）

### 6.3 错误边界、Port、消息时间线记录

每个 E2E 回归场景在执行过程中，若出现以下情况，必须记录对应证据：

**错误边界触发**：
- 记录错误边界文案（"BiliAgent 渲染异常" 或其他兜底文案）
- 记录触发时间戳
- 记录控制台对应的 React 错误堆栈

**Port 断开**：
- 记录 Port onDisconnect 时间戳
- 记录断开时的场景上下文（如正在执行连接测试或流式输出）
- 记录断开后的 UI 反馈（如 "连接已断开，请重试"）

**消息时间线**：
- 记录每次 videos、insight、chunk、reasoning、done 消息的到达时间戳
- 记录消息之间的相对顺序（如 `insight -> videos -> tool_result`）
- 不记录消息内容中的敏感信息

## 7. 测试文件组织

E2E 回归测试文件建议组织在 `Main/e2e/` 下：

| 文件 | 覆盖场景 | 说明 |
| --- | --- | --- |
| `Main/e2e/extension-probe.spec.ts` | 3.1 挂载能力验证 | 阶段0 已创建的最小探针 |
| `Main/e2e/smoke.spec.ts` | 3.2 smoke 进入面板 | 已有 smoke 测试 |
| `Main/e2e/regression/r1-history-title-search.spec.ts` | 场景1 | R-1 异常 title 搜索 |
| `Main/e2e/regression/r2-rename-view-switch.spec.ts` | 场景2 | R-2 重命名后快速切换视图 |
| `Main/e2e/regression/r3-n3-connection-provider-switch.spec.ts` | 场景3 | R-3 + N-3 连接测试期间 Provider 切换 |
| `Main/e2e/regression/s1-s3-s4-dual-search.spec.ts` | 场景4 | S-1 + S-3 + S-4 连续两次搜索 |
| `Main/e2e/regression/s2-scroll-protection.spec.ts` | 场景5 | S-2 用户上拉保护 |
| `Main/e2e/regression/s4-rerank-order.spec.ts` | 场景6 | S-4 连续两次 rerank |

## 8. 测试运行命令

```bash
# 阶段0 挂载验证
cd Main && npx playwright test e2e/extension-probe.spec.ts --reporter=list

# smoke 测试
cd Main && npx playwright test e2e/smoke.spec.ts --reporter=list

# 单个回归场景（以场景1为例）
cd Main && npx playwright test e2e/regression/r1-history-title-search.spec.ts --reporter=list

# 全部回归场景
cd Main && npx playwright test e2e/regression/ --reporter=list

# 带 trace 运行（失败后可回放）
cd Main && npx playwright test e2e/regression/ --reporter=list --trace=on

# 查看失败 trace
cd Main && npx playwright show-trace test-results/<trace-folder>/trace.zip
```

## 9. 验收标准

| 标准编号 | 验收标准 | 验证方式 |
| --- | --- | --- |
| E2E-AC1 | 挂载能力验证通过（3.1） | extension-probe.spec.ts 退出码 0 |
| E2E-AC2 | smoke 测试进入面板交互（3.2） | smoke.spec.ts 退出码 0，至少一条进入 openPanel |
| E2E-AC3 | 场景1（R-1 异常 title 搜索）通过 | r1-history-title-search.spec.ts 退出码 0，无 TypeError |
| E2E-AC4 | 场景2（R-2 重命名视图切换）通过 | r2-rename-view-switch.spec.ts 退出码 0，无过期状态更新 |
| E2E-AC5 | 场景3（R-3 + N-3 连接测试 Provider 切换）通过 | r3-n3-connection-provider-switch.spec.ts 退出码 0，无状态覆盖 |
| E2E-AC6 | 场景4（S-1 + S-3 + S-4 连续两次搜索）通过 | s1-s3-s4-dual-search.spec.ts 退出码 0，批次保留+排序符合决策 |
| E2E-AC7 | 场景5（S-2 用户上拉保护）通过 | s2-scroll-protection.spec.ts 退出码 0，上拉后不自动滚动 |
| E2E-AC8 | 场景6（S-4 连续两次 rerank）通过 | s4-rerank-order.spec.ts 退出码 0，DOM 顺序符合产品决策 |
| E2E-AC9 | 所有场景不记录 API Key、Cookie 或完整请求凭据 | 代码审查确认无敏感信息 |
| E2E-AC10 | 错误边界、Port、消息时间线证据已采集（若触发） | 检查测试输出包含对应证据 |

## 10. 风险与回滚

### 风险

| 风险 | 概率 | 影响 | 缓解措施 |
| --- | --- | --- | --- |
| MV3 service worker 在测试期间被回收（N-V3） | 中 | 中 | `--disable-background-timer-throttling` 缓解；探针重试机制 |
| bilibili 首页 CSP 阻止 content script 注入 | 中 | 高 | 导航到 bilibili 子页面测试；阶段0 已排查 |
| 网络环境导致导航超时（E0-A6） | 中 | 中 | 使用 `waitUntil: "networkidle"` + 延长超时 |
| 运行时证据采集影响测试行为 | 低 | 中 | 验证采集通道本身不改变被验证行为 |
| 产品决策未明确导致场景4、6 预期行为无法定义 | 高 | 高 | 在阶段2 实施期间同步推进产品需求确认 |

### 回滚

若 E2E 回归引入不稳定或新问题：
1. 保留 `extension-probe.spec.ts` 作为诊断工具
2. 将不稳定的回归场景标记为 `skip`，记录不稳定原因
3. 不影响 smoke 测试和探针测试的独立运行

## 11. 完成状态

**当前状态**：pending

状态变更条件：
- `pending` -> `in_progress`：阶段0 恢复 E2E 能力后，开始执行挂载验证
- `in_progress` -> `needs_review`：所有回归场景至少执行一次，采集到运行时证据
- `needs_review` -> `completed`：验收标准 E2E-AC1 至 E2E-AC10 全部满足

---

**关联文档**：
- `docs/问题档案/05-测试与验证缺口/E2E运行阻塞问题.md`：E2E 阻塞问题档案
- `docs/问题档案/06-待验证假设/搜索结果高风险假设清单.md`：S-V1 至 S-V5 假设
- `docs/问题档案/06-待验证假设/网络层假设清单.md`：N-V1 至 N-V6 假设
- `docs/修复方案/阶段0-前置准备/E2E测试环境修复方案.md`：阶段0 E2E 修复方案
- `docs/修复方案/阶段4-测试与验证/README.md`：阶段4 总览
- `docs/修复方案/修复状态追踪.md`：状态追踪

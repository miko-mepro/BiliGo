# Research: 当前 Main AI SDK、技能资源与测试实现

- **Query**: 检查 `Main/package.json`、锁文件、`vite.config.ts`、`src/background/stream.ts`、`src/components/ChatMessage.tsx`、测试配置和 e2e，确认 AI SDK `tool()`、Zod、`stopWhen`、`conversationId`、tool timeline 的真实用法，确认 Vite/TypeScript 是否支持从 `Main/.agents/skills` 或生成文件导入原始 Markdown，记录测试位置/命令和与任务设计交叉的事实。
- **Scope**: internal
- **Date**: 2026-08-04

## Findings

### Files Found

| File Path | Description |
|---|---|
| `Main/package.json:5-16` | Node 约束、npm scripts、Vitest/Playwright 命令 |
| `Main/package.json:18-51` | AI SDK、Zod、Vite、Vitest、Playwright 依赖声明 |
| `Main/package-lock.json:2354-2369` | 已安装 `ai` 7.0.22 及其 Zod peer/Node engine |
| `Main/package-lock.json:8318-8325` | 已安装 `zod` 4.4.3 |
| `Main/vite.config.ts:1-9` | React + CRXJS Vite 配置 |
| `Main/tsconfig.app.json:2-31` | 浏览器端 TypeScript bundler 配置及 include 范围 |
| `Main/tsconfig.node.json:2-25` | Vite 配置的 Node 端 TypeScript include 范围 |
| `Main/node_modules/vite/client.d.ts:249-252` | Vite `?raw` 模块的类型声明 |
| `Main/src/background/stream.ts:3-5,133-164,323-397` | AI SDK stream、工具注册、事件转 Port 消息 |
| `Main/src/components/ChatMessage.tsx:17-164` | 工具名称显示和助手思考时间线渲染 |
| `Main/src/content/chat-context.tsx:167-245,415-508,829-874` | Port 事件转 reducer 状态、步骤时间线和会话请求 |
| `Main/src/background/port-protocol.ts:6-24,26-94` | `tool_start`/`tool_result` 与 `conversationId` 的自定义协议 |
| `Main/src/lib/shared-types/index.ts:1-31,106-132` | `ChatMessage`、`AgentStep`、会话数据类型 |
| `Main/test/background/stream.test.ts:216-753` | stream、工具、顺序、`stopWhen` 单元测试 |
| `Main/test/content/chat-context.test.ts:234-340` | reducer 步骤/过程文字时间线测试 |
| `Main/e2e/agent-flow.spec.ts:260-399` | 完整 Agent 流程 mock e2e |
| `Main/e2e/smoke.spec.ts:173-368` | Provider、聊天及错误状态 mock e2e |
| `Main/vitest.config.ts:4-18` | Vitest 环境、setup、排除规则、覆盖率范围 |
| `Main/playwright.config.ts:8-41` | 生成扩展路径、e2e 目录和 Chromium 项目 |
| `.trellis/tasks/08-04-bili-progressive-skill-loading/{prd,design,implement}.md` | 本任务的目标、设计和计划中的新增行为 |

### 1. AI SDK `tool()`、Zod、`stopWhen` 与 `conversationId`

#### 依赖和版本

- `Main/package.json:18-28` 声明 `ai: ^7.0.22`、`@ai-sdk/anthropic: ^4.0.12`、`@ai-sdk/google: ^4.0.12`、`@ai-sdk/openai: ^4.0.11` 和 `zod: ^4.4.3`。
- Lockfile 中实际安装的是 `ai` 7.0.22（`Main/package-lock.json:2354-2369`）、`zod` 4.4.3（`Main/package-lock.json:8318-8325`），AI SDK 的 peer 范围是 `zod ^3.25.76 || ^4.1.8`（`Main/package-lock.json:2367-2369`）。
- `ai` 7.0.22 的包元数据要求 Node `>=22`（`Main/node_modules/ai/package.json:61-66`；lockfile 同样记录于 `Main/package-lock.json:2364-2366`），而产品根声明是 Node `>=20.0.0`（`Main/package.json:5-6`）。这是当前依赖元数据与根 engines 之间的版本事实。

#### `tool()` 的实际注册方式

当前有五个注册给顶层 `streamText` 的工具：

1. `slang_understand` 在 `Main/src/tools/slang-understand.ts:63-79` 使用 `z.object({ query: z.string() })` 作为 `inputSchema`，`execute` 调用 `executeUnderstand`。
2. `query_expand` 在 `Main/src/tools/query-expand.ts:62-80` 使用 `z.object({ query: z.string() })`，`execute` 调用 `executeExpand`。
3. `bilibili_search` 在 `Main/src/tools/bilibili-search.ts:43-75` 使用包含 `keyword`、`order`、`analyze_covers` 的 Zod 对象，`execute` 调用 `executeBilibiliSearch`。
4. `video_rerank` 在 `Main/src/tools/video-rerank.ts:36-58` 使用包含 `videos` 和 `intent` 的 Zod 对象，`videos` 内层对象要求 `bvid` 并使用 `.passthrough()`。
5. `ask_clarification` 没有在自身模块调用 `tool()`；它的执行函数在 `Main/src/tools/ask-clarification.ts:52-73`，由 `Main/src/background/stream.ts:141-156` 包装为 `tool({ description, inputSchema: z.object(...), execute })`。输入字段是 `question`、可选 `options`、`reason`。

`buildTools(traceId)` 在 `Main/src/background/stream.ts:133-164` 每次聊天请求创建四个工厂工具和一个澄清工具，并返回这五个键：`slang_understand`、`query_expand`、`bilibili_search`、`video_rerank`、`ask_clarification`。`analyze_covers` 是 `bilibili_search` 的注入依赖，不是顶层独立工具（`Main/src/background/stream.ts:128-131`、`Main/src/tools/bilibili-search.ts:38-41`）。

因此当前 Zod 的实际职责是为 AI SDK 工具输入提供 `inputSchema`，工具执行结果由各 `execute` 函数直接返回；`stream.ts` 没有另建工具输出 Zod schema。工具对象的 `ToolSet` 类型在 `Main/src/background/stream.ts:133-164` 返回处使用了类型断言。

#### `streamText`、工具事件和 `stopWhen`

- `handleChatMessage` 从设置创建模型、转换消息、创建 trace 和工具，然后在 `Main/src/background/stream.ts:310-330` 调用一次 `streamText`。参数实际为 `model`、固定 `system: SYSTEM_PROMPT`、`messages: modelMessages`、`tools`、`stopWhen: isStepCount(5)` 和 `abortSignal`。
- 当前代码不使用 `result.text`、`result.fullStream` 或 AI SDK UI hook；它校验 `result.stream` 可异步迭代后，在 `Main/src/background/stream.ts:332-397` 逐个消费 `TextStreamPart`。
- `text-delta` 和 `reasoning-delta` 转成 Port 的 `chunk`/`reasoning`；`tool-call` 使用 SDK 事件的 `toolCallId`、`toolName`、`input`；`tool-result` 使用 `toolCallId`、`toolName`、`output`（`Main/src/background/stream.ts:339-367`）。
- `toolInputs` 是 `Map<string, unknown>`，在 `tool-call` 时按 `toolCallId` 保存 input，在 `tool-result` 时取出并删除，主要用于 `video_rerank` 重建重排后视频列表（`Main/src/background/stream.ts:319-321,347-359`）。
- `stopWhen` 当前只有一个 AI SDK 条件 `isStepCount(5)`，没有项目自己的循环计数器（`Main/src/background/stream.ts:323-330`）。现有单测把 `isStepCount` mock 成 sentinel，并断言收到参数 `5` 且同一个 sentinel 被传给 `streamText`（`Main/test/background/stream.test.ts:367-379`）。
- 当前内联系统提示把限制描述为“单次会话工具调用不超过 5 轮”（`Main/src/background/stream.ts:40-45`）；代码实际传给 AI SDK 的是单次 `streamText` 请求的 step 条件。任务设计文档将目标表述为每请求七个 model steps（`.trellis/tasks/08-04-bili-progressive-skill-loading/prd.md:46-51`、`design.md:76-82`），但当前实现及测试仍是 5。

#### `conversationId` 的真实边界

- `conversationId` 是项目自定义 Port 字段，不是当前传给 AI SDK 的参数。`CSMessage` 的 chat 结构定义在 `Main/src/background/port-protocol.ts:19-24`，`isCSMessage` 只检查它是非空字符串（`Main/src/background/port-protocol.ts:68-85`）。
- 前端生成 ID 的格式是 `conv_${Date.now()}_${random}`（`Main/src/content/chat-context.tsx:138-146`），发送聊天时把当前完整消息列表和该 ID 放进 Port 消息（`Main/src/content/chat-context.tsx:845-867`）。
- `toModelMessages` 只过滤掉 `system` 消息，并把 `role`、`content`、可选 `toolCalls`、可选 `toolCallId` 转换成 `ModelMessage`，最后使用类型断言（`Main/src/background/stream.ts:60-70`）。这里没有把 `conversationId` 加入 `ModelMessage` 或 `streamText` 选项。
- 后台使用 `msg.conversationId` 生成 trace：优先是 `conversationId + crypto.randomUUID()`，回退是 `conversationId + Date.now() + random`（`Main/src/background/stream.ts:86-97`）。因此同一会话的每次 `handleChatMessage` 请求都会得到新的 trace 后缀。
- 这个 trace 被用于创建、绑定和释放 `WorkingMemoryStore`（`Main/src/background/stream.ts:312-314,409-417`）；存储 key 是 `working-memory:${traceId}`，并带 5 分钟 TTL（`Main/src/tools/working-memory.ts:3-4,13-28,31-72`）。当前没有按 `conversationId` 命名的模块级 mandatory skill cache。
- `conversationId` 也用于前端会话历史/标题：标题请求和响应携带该字段（`Main/src/content/chat-context.tsx:702-735`、`Main/src/background/stream.ts:452-485`），历史数据按该 ID 保存（`Main/src/lib/history/store.ts:81-125`）。这些是应用层会话功能，不是 AI SDK 的内置会话上下文。

### 2. Tool timeline 的真实数据流

#### 后台 Port 事件

- 协议只定义 `tool_start`、`tool_result`，字段分别是 `toolCallId`、`toolName`、`args`/`result`（`Main/src/background/port-protocol.ts:6-17`）。运行时守卫要求这些字段存在，但不验证 args/result 的具体工具 schema（`Main/src/background/port-protocol.ts:26-65`）。
- `stream.ts` 在收到 SDK `tool-call` 时先发 `tool_start`（`Main/src/background/stream.ts:346-354`）。收到 `tool-result` 时先调用 `postToolAuxiliaryMessages`，再发 `tool_result`（`Main/src/background/stream.ts:355-367`）。
- 现有工具的附加消息顺序是 `tool_start -> videos/insight -> tool_result`；`bilibili_search` 发 `videos`，四类 insight 工具发 `insight`，未知工具走 `default`，不发附加消息，只发普通 `tool_result`（`Main/src/background/stream.ts:167-225`）。按该 default 行为，未来技能工具不会自动产生视频或 insight 消息。

#### Content reducer 和消息结构

- `ChatMessage` 的可持久化结构包含 `reasoning` 和 `steps`，另有但当前 timeline 不使用的 `toolCalls`/`toolCallId` 字段（`Main/src/lib/shared-types/index.ts:1-9`）。`AgentStep` 只有 `id`、`type`、`name`、`summary`、`status`、时间戳和可选完成时间，没有 tool result 字段（`Main/src/lib/shared-types/index.ts:11-25`）。
- 收到 `tool_start` 后，`consumeSWMessage` 确保末尾有 assistant 占位消息，把尚未提交的流式正文转成 `note`，设置 activity 为 tool，再追加一个 `status: running` 的 `AgentStep`，其 id 等于 `toolCallId`（`Main/src/content/chat-context.tsx:415-449`）。
- 收到 `tool_result` 后，前端只派发 `COMPLETE_STEP`，按 `toolCallId` 把末尾 assistant 消息中对应步骤标为 completed；result 内容本身不会进入 `ChatMessage`（`Main/src/content/chat-context.tsx:452-457`、reducer 实现 `Main/src/content/chat-context.tsx:202-219`）。视频和 insight 通过相邻的专门 Port 消息进入独立 state（`Main/src/content/chat-context.tsx:459-490`）。
- 工具调用前已经累积的 assistant 流式文字会由 `PROMOTE_STREAMING_TO_NOTE` 追加到同一 `steps` 数组中，作为 `type: note`，正文流缓存清空（`Main/src/content/chat-context.tsx:222-245`）。这就是系统提示“每次工具调用前先说明计划”与 UI note 时间线之间的现有连接。
- 收到 `done` 时，当前 streaming content/reasoning 被写回末尾 assistant message，随后清空流式缓存、结束 loading/activity（`Main/src/content/chat-context.tsx:492-508`）。

#### UI 显示和持久化

- 工具名映射当前只有五个现有工具：`slang_understand`、`query_expand`、`bilibili_search`、`video_rerank`、`ask_clarification`（`Main/src/components/ChatMessage.tsx:17-31`），没有技能加载或技能资源读取标签。
- assistant 消息有步骤时显示思考区域（`Main/src/components/ChatMessage.tsx:76-90`）。折叠预览把 reasoning、note summary 和工具中文标签拼接（`Main/src/components/ChatMessage.tsx:33-49,109-121`）；展开区域按 `steps` 顺序显示 note 或工具胶囊，并为 running 步骤显示“进行中”（`Main/src/components/ChatMessage.tsx:123-163`）。
- assistant 正文使用 `react-markdown`、GFM 和 sanitize（`Main/src/components/ChatMessage.tsx:167-177`）；用户正文才使用 `.bili-agent-message__text`（`Main/src/components/ChatMessage.tsx:167-181`）。
- `ChatMessage.steps` 会随会话保存：空 assistant 只有在 content/reasoning/steps 都为空时才过滤，payload 保留完整 `messages`（`Main/src/lib/history/save-orchestrator.ts:64-103`）；历史记录继续保存该消息数组（`Main/src/lib/history/store.ts:111-125`）。因此 tool timeline 不是只存在于本次渲染，也会进入当前会话/历史消息数据。

### 3. Vite/TypeScript 与原始 Markdown 导入

#### 当前配置能确认的支持

- `Main/vite.config.ts:1-9` 只注册 `@vitejs/plugin-react` 和 `@crxjs/vite-plugin`，没有 `assetsInclude`、Markdown 插件、生成 registry 插件或 `import.meta.glob` 相关配置。
- 浏览器端 TS 配置显式开启 `vite/client` 类型和 `allowArbitraryExtensions`（`Main/tsconfig.app.json:7-8`），使用 `moduleResolution: bundler`（`Main/tsconfig.app.json:11-17`）。
- 已安装 Vite 客户端类型在 `Main/node_modules/vite/client.d.ts:249-252` 声明了 `declare module '*?raw'`，默认导出类型为 `string`。因此当前工具链明确支持类似 `some-file.md?raw` 的 Vite 原始文本导入类型。
- 当前 `vite/client.d.ts` 对 `.md` 没有单独的裸模块声明；仓库也没有自定义 `*.md`/`*.md?raw` 声明文件。`allowArbitraryExtensions` 本身只放宽扩展名解析，不负责读取 Markdown 内容；当前可确认的原始内容路径是 Vite 的 `?raw` 查询。
- TypeScript app 项目只 include `src`（`Main/tsconfig.app.json:26-31`）。Node 项目只 include `vite.config.ts`（`Main/tsconfig.node.json:24-25`）。所以当前 `Main/scripts` 不存在，也未被现有 `tsc -b` 的 Node project 覆盖；一个未来生成的 TS registry 若位于 `src` 内会进入 app typecheck，位于脚本目录则不因当前 `tsconfig.node.json` 自动进入 typecheck。

#### 当前仓库实际资源状况

- 2026-08-04 的目录检查结果：`Main/.agents` 不存在，`Main/scripts` 不存在，`Main/public` 不存在；因此当前没有 `Main/.agents/skills/**/SKILL.md` 可供 Vite import/glob 验证。
- 对 `Main/` 的源码检索没有发现 `.md`、`?raw`、`import.meta.glob`、`node:fs` 或 Markdown registry 导入。现有静态内容导入是 JSON，例如 `Main/src/tools/slang-understand.ts:9`、`Main/src/tools/query-expand.ts:17`，以及 Vite 配置导入 `Main/manifest.json`（`Main/vite.config.ts:4`）。
- `Main/dist` 当前存在生成产物，列表包括 `manifest.json`、`service-worker-loader.js`、若干 `assets/*.js` 和图标资源；没有独立的 `.md` 或 `.agents/skills` 文件。`dist` 在 Git ignore 中（`Main/.gitignore:10-13`）。
- 任务设计所说的“Vite raw asset registry”目前只出现在设计文字中（`.trellis/tasks/08-04-bili-progressive-skill-loading/design.md:24-34`），当前 Vite 配置和源码尚未实现该 registry。

结论限定：从现有配置和已安装类型可以确认 Vite `?raw` 文本导入通道及其 TypeScript `string` 类型支持；不能从当前仓库确认裸 `.md` import、技能目录 glob 或生成 registry 已经可运行，因为对应目录、声明、源码和构建配置都尚不存在。

### 4. 测试位置、配置和命令

#### npm scripts 和锁定工具

`Main/package.json:9-16` 当前只有以下 scripts：

```text
npm run dev        -> vite
npm run build      -> tsc -b && vite build
npm run lint       -> eslint .
npm run preview    -> vite preview
npm run test       -> vitest run
npm run typecheck  -> tsc -b
npm run test:e2e   -> playwright test
```

锁定版本包括 Vite 8.1.4（`Main/package-lock.json:6741-6759`）、TypeScript 6.0.3（`Main/package-lock.json:6530-6542`）、Vitest 2.1.9（`Main/package-lock.json:7405-7438`）和 `zod` 4.4.3（`Main/package-lock.json:8318-8325`）。`package.json` 和 lockfile 根依赖中没有直接 `yaml` 依赖；Vite lock 条目仅把 `yaml`列为可选 peer（`Main/package-lock.json:6766-6816`）。

#### Vitest

- `Main/vitest.config.ts:4-18` 使用 `jsdom`，加载 `test/setup.ts`，排除 `**/node_modules/**` 与 `**/e2e/**`，覆盖率 provider 是 v8，reporter 是 text/html，统计范围是 `src/**`。
- `Main/test/setup.ts:6-44` 提供全局 Chrome runtime/storage/cookies/tabs mock，组件测试还在同文件安装 Pointer Events polyfill（`Main/test/setup.ts:46-85`）。
- 后台编排和 AI SDK mock 的现有位置是 `Main/test/background/stream.test.ts`：顶部 mock `ai` 的 `streamText`、`generateText`、`isStepCount`、`tool`（`1-15`），并覆盖流映射、终止、step limit、工具辅助消息顺序、五工具注册和 WorkingMemory 生命周期（`216-753`）。
- 工具执行逻辑的现有位置是 `Main/test/tools/*.test.ts`，包括 `ask-clarification`、`bilibili-search`、`query-expand`、`slang-understand`、`video-rerank`、`working-memory`、`llm-json` 和 `analyze-covers`。
- reducer/time-line 的现有位置是 `Main/test/content/chat-context.test.ts`，步骤增加/完成和 note 晋升覆盖在 `234-340`；会话 ID 在 hydration/reset 方面的断言覆盖在 `369-465`、`522-592`。
- 组件测试目前有 `MessageList.test.tsx`、`AgentInsightCard.test.tsx` 等，但对 `ChatMessage` 文件名的 Glob 检索没有发现 `Main/test/**/ChatMessage*.test.*`。
- `Main/test/e2e-fixtures/fixtures-smoke.test.ts` 虽然名称含 e2e fixture，但路径在 `test/`，不匹配 Vitest 的 `**/e2e/**` 排除项，因此会随 `npm run test` 运行（`Main/test/e2e-fixtures/fixtures-smoke.test.ts:12-29`）。

从 `Main/` 运行已有命令时，当前可确认的形式是：

```bash
npm run test
npx vitest run test/background/stream.test.ts
npm run typecheck
npm run lint
npm run build
npm run test:e2e -- e2e/agent-flow.spec.ts
```

任务 implementation 文档额外列出 `npm run validate:skills`（`.trellis/tasks/08-04-bili-progressive-skill-loading/implement.md:16-29`），但当前 `Main/package.json:9-16` 没有该 script，也没有 `prebuild`。

#### Playwright e2e

- `Main/playwright.config.ts:8-10` 把扩展路径固定为 `Main/dist`，`testDir` 是 `./e2e`（`Main/playwright.config.ts:11-14`），Chromium 项目通过 `--disable-extensions-except` 和 `--load-extension` 加载该目录（`Main/playwright.config.ts:24-37`）。配置没有 `webServer` 或自动 build hook；`npm run test:e2e` 本身只执行 Playwright。
- `Main/e2e/agent-flow.spec.ts:260-399` 是完整 mock Agent 流程，使用 `context.route` 拦截 Service Worker 发出的 AI `/chat/completions` 和 Bilibili API，请求中模拟第一轮 tool call、第二轮文本回答，并断言工具步骤、视频卡片、助手文本和请求次数。
- `Main/e2e/smoke.spec.ts:201-328` 覆盖 Provider 配置、`generateText` 的非流式连接测试、`streamText` 流式聊天和 429 错误；该文件的聊天文本选择器位于 `318-325`。
- `Main/e2e/agent-flow.spec.ts:362-369` 使用 `.bili-agent-message__steps` 和其内部 `.bili-agent-message__step`；但当前 `ChatMessage.tsx` 实际渲染的是 `.bili-agent-thinking__body` 和 `.bili-agent-thinking__step`（`Main/src/components/ChatMessage.tsx:123-160`）。`Main/src/content/styles.ts:1106-1127` 仍保留旧 `.bili-agent-message__steps`/`__step` CSS，但当前 TSX 没有对应元素。
- `Main/e2e/agent-flow.spec.ts:387-390` 和 `Main/e2e/smoke.spec.ts:318-325` 都查找 assistant 下的 `.bili-agent-message__text`；当前 assistant 分支使用 `.bili-agent-message__markdown`，`.bili-agent-message__text` 只在非 assistant 分支出现（`Main/src/components/ChatMessage.tsx:167-181`）。这是现有 e2e 选择器与当前组件 DOM 之间的事实差异。

### 5. 与任务设计交叉的事实

| 任务设计中的事实/目标 | 当前仓库事实 | 证据 |
|---|---|---|
| 技能作者目录为 `Main/.agents/skills/` | `Main/.agents` 当前不存在 | `.trellis/tasks/08-04-bili-progressive-skill-loading/prd.md:21-30`；2026-08-04 目录检查 |
| 构建前由 `Main/scripts/` 做 YAML/链接/大小校验 | `Main/scripts` 当前不存在；`package.json` 没有 `prebuild` 或 `validate:skills` | `design.md:24-34`；`implement.md:5-7`；`Main/package.json:9-16` |
| 依赖直接 `yaml` | 根依赖和 lockfile 根包没有 `yaml`；Vite 只把 `yaml`列为可选 peer | `Main/package.json:18-28`；`Main/package-lock.json:7-43,6766-6816` |
| runtime registry 使用 Vite raw imports/globs | 当前无 registry、无 `.md?raw`、无 `import.meta.glob`；只有 Vite 客户端 `*?raw` 类型 | `design.md:24-34`；`Main/vite.config.ts:1-9`；`Main/node_modules/vite/client.d.ts:249-252` |
| mandatory cache 以 `conversationId` 为 key | 当前 `conversationId` 每次请求被加工为带随机后缀的 `traceId`，WorkingMemory 以 traceId 存取；没有 mandatory cache map | `design.md:36-46`；`Main/src/background/stream.ts:86-97,312-314`；`Main/src/tools/working-memory.ts:11-72` |
| 新增 `load_skill`、`read_skill_file` 后只显示普通 timeline | 当前 `postToolAuxiliaryMessages` 的未知工具 default 确实只产生普通 `tool_result`，但顶层尚未注册这两个工具 | `design.md:56-74`；`Main/src/background/stream.ts:158-164,215-225` |
| 思考时间线新增技能工具可读标签 | 当前标签表只有五个现有工具 | `.trellis/tasks/08-04-bili-progressive-skill-loading/design.md:72-74`；`Main/src/components/ChatMessage.tsx:17-31` |
| 单次请求 step cap 为 7 | 当前 `isStepCount(5)`，对应单测也固定断言 5 | `prd.md:46-51`；`Main/src/background/stream.ts:323-330`；`Main/test/background/stream.test.ts:367-379` |
| 现有 video-search e2e 保持可用 | e2e mock 流程存在，但步骤容器和 assistant 文本选择器仍引用旧 DOM class | `Main/e2e/agent-flow.spec.ts:357-390`；`Main/src/components/ChatMessage.tsx:123-181` |
| 用户只拿 `dist/` 也能使用技能 | `dist` 当前被忽略且已有产物没有独立 Markdown/技能目录文件；当前无技能源目录或构建 registry | `Main/.gitignore:10-13`；2026-08-04 `Main/dist` 目录检查；`prd.md:65-70` |

## External References

- [Agent Skills specification](https://agentskills.io/specification) — 已有任务研究记录说明标准目录包含 `SKILL.md`、YAML frontmatter 和可选 references；见 `.trellis/tasks/08-04-bili-progressive-skill-loading/research/skill-loading-research.md:7-17`。
- [OpenAI Codex skills](https://developers.openai.com/codex/skills) — 已有任务研究记录其 `.agents/skills` 发现约定；见 `.trellis/tasks/08-04-bili-progressive-skill-loading/research/skill-loading-research.md:19-26`。这不是当前 BiliGo runtime 已存在的能力。
- [Vercel AI SDK](https://ai-sdk.dev/docs) — 当前实际安装包为 `ai` 7.0.22，包主页与 peer/engine 元数据见 `Main/node_modules/ai/package.json:1-10,61-71`。

## Related Specs

- `.trellis/tasks/08-04-bili-progressive-skill-loading/prd.md` — 技能目录、加载行为、资源限制、构建分发和验收标准。
- `.trellis/tasks/08-04-bili-progressive-skill-loading/design.md` — raw registry、conversation cache、两个技能工具和七步上限的技术设计。
- `.trellis/tasks/08-04-bili-progressive-skill-loading/implement.md` — 计划新增文件、测试范围和验证命令。
- `.trellis/tasks/08-04-bili-progressive-skill-loading/research/skill-loading-research.md` — Agent Skills/Codex/Claude/Copilot 外部约定的已有研究。
- `.trellis/spec/shared/code-quality.md:54-62` — 当前项目通用质量检查中列出的 lint/typecheck 命令。

## Caveats / Not Found

- 本次只做仓库和已安装依赖的静态研究，没有执行 `npm run validate:skills`、`npm run build`、`npm run test` 或 Playwright；因此没有新增行为的运行时结果。
- `Main/.agents/skills`、`Main/scripts`、`Main/public` 和源码 Markdown 文件未找到；`Main/dist` 是现存的 ignored 生成目录，但没有独立技能 Markdown 文件。JS bundle 内是否包含某段普通文本未作为实现依据。
- 当前报告把 task 文档中的目标与源码现状并列记录，不把设计目标当成已实现行为；尤其是七步 cap、mandatory cache、raw registry、技能工具和标签目前只能从设计文件确认，不能从当前 `Main/src` 确认。
- `ai` 及其 provider 包的 lockfile engine 要求包含 Node `>=22`（`Main/package-lock.json:68-73,101-105,117-122,2364-2369`），而 Vite 8.1.4 要求 `^20.19.0 || >=22.12.0`（`Main/package-lock.json:6757-6759`）；根 `package.json` 的 `>=20.0.0` 声明未细分这些依赖的实际 engine 区间。

# Main/ 代码审计 · 修复 TODO 任务列表

> 生成日期：2026-07-28
> 审计方法：多子代理分批审计（12 分区 × 3 维度组）+ 独立交叉验证
> 总审计文件：109 个（src 53 + test 36 + e2e 6 + config 10 + 其他 4）
> 验证结果：14 条关键发现中 12 条 CONFIRMED + 2 条 DOWNGRADED + 0 条 REJECTED

---

## 🔴 致命问题（必须修复，阻断合并）

### TODO-01: tsconfig 缺少 strict 模式
- **分区**: P12-build-config
- **位置**: `tsconfig.app.json:2-24` + `tsconfig.node.json:2-23`
- **问题**: 缺少 `"strict": true`，strictNullChecks/noImplicitAny 等全部为 false，类型安全形同虚设
- **修复**: 在 compilerOptions 顶部添加 `"strict": true`
- **验证状态**: ✅ CONFIRMED

### TODO-02: API Key 明文存储 + sanitize 白名单遗漏
- **分区**: P5-config / P4b-lib-shared
- **位置**: `provider-factory.ts:11,16,21` + `settings.ts:38` + `sanitize.ts:1-10`
- **问题**: API Key 明文存于 chrome.storage.local；sanitize.ts SENSITIVE_KEYS 遗漏 `apikey`/`api-key`/`api_key`
- **修复**: 扩充 SENSITIVE_KEYS 白名单；validateProviderConfig 增加 apiKey 字符集校验
- **验证状态**: ✅ CONFIRMED

### TODO-03: MutationObserver 永不 disconnect
- **分区**: P2-content
- **位置**: `src/content/index.tsx:67-81`
- **问题**: content script 的 MutationObserver 在模块生命周期内永不 disconnect，SPA 长会话累积内存/CPU 泄漏
- **修复**: 添加 `pagehide` 清理钩子
- **验证状态**: ✅ CONFIRMED

### TODO-04: ErrorDisplay 重试按钮无效
- **分区**: P6-components-core
- **位置**: `src/components/ErrorDisplay.tsx:16-19`
- **问题**: "重试"按钮与"关闭"按钮功能完全相同，handleRetry 仅清除错误不重发消息
- **修复**: 实现真实重发逻辑或改为"知道了"按钮
- **验证状态**: ✅ CONFIRMED

### TODO-05: chrome.permissions.request 在 for...of 中脱离用户手势
- **分区**: P7-components-settings
- **位置**: `src/components/model-settings/SettingsPanel.tsx:185-221`
- **问题**: 多自定义 provider 时第二个起脱离用户手势上下文，永远保存失败
- **修复**: 先同步收集所有 origin pattern，再一次性批量 `chrome.permissions.request`
- **验证状态**: ✅ CONFIRMED

### TODO-06: useResizable 模块顶层 window 访问
- **分区**: P8-hooks-utils
- **位置**: `src/hooks/useResizable.ts:47-48`
- **问题**: `DEFAULT_MAX_WIDTH = window.innerWidth` 在模块顶层执行，SSR/早期注入会抛 ReferenceError
- **修复**: `typeof window !== 'undefined' ? window.innerWidth : Number.MAX_SAFE_INTEGER`
- **验证状态**: ✅ CONFIRMED

### TODO-07: Panel-settings.test.tsx 伪测试
- **分区**: P10-test-b
- **位置**: `test/components/Panel-settings.test.tsx:105-294`
- **问题**: 8 个用例均未渲染 `<Panel>` 组件，直接调用 chrome.runtime.connect mock 验证 mock 自身
- **修复**: 用 `@testing-library/react` render 组件，通过 fireEvent 触发设置开关
- **验证状态**: ✅ CONFIRMED

### TODO-08: sanitize.ts 零测试覆盖
- **分区**: P4b-lib-shared
- **位置**: `src/lib/shared-types/sanitize.ts`（全文件）
- **问题**: 核心安全函数（脱敏敏感字段）完全无测试
- **修复**: 新建 `test/lib/shared-types/sanitize.test.ts`
- **验证状态**: ✅ CONFIRMED

---

## 🟠 严重问题（建议修复，影响功能或稳定性）

### TODO-09: stream.ts void handleChatMessage 无 catch
- **分区**: P1-background
- **位置**: `src/background/stream.ts:571,574,577`
- **问题**: `void` 丢弃 Promise，try 块外异常变为 unhandled rejection
- **修复**: 添加 `.catch()` 兜底
- **验证状态**: ✅ CONFIRMED

### TODO-10: slang-understand triedKeywords 覆盖 bug
- **分区**: P3-tools
- **位置**: `src/tools/slang-understand.ts:195-197`
- **问题**: `update({ triedKeywords: [normalized] })` 覆盖而非追加，清空之前工具累积的关键词
- **修复**: 改为读取-合并-去重模式（参照 query-expand.ts）
- **验证状态**: ✅ CONFIRMED

### TODO-11: 所有 bilibili-client fetch 无超时
- **分区**: P4a-lib-bili
- **位置**: `hot.ts:30` / `search.ts:109` / `suggest.ts:30` / `tags.ts:37` / `wbi.ts:109,136`
- **问题**: 所有网络请求无 `AbortSignal.timeout`，B站慢响应导致 SW 永久阻塞
- **修复**: 添加 `signal: AbortSignal.timeout(15_000)`
- **验证状态**: ✅ CONFIRMED

### TODO-12: session-memory set 抛异常不返回 false
- **分区**: P5-config
- **位置**: `src/config/session-memory.ts:82`
- **问题**: `chrome.storage.session.set` 抛异常时函数不返回 false 而是 reject，违反 Promise<boolean> 契约
- **修复**: 包裹 try-catch，失败时 return false
- **验证状态**: ✅ CONFIRMED

### TODO-13: manifest 缺少 action 字段
- **分区**: P12-build-config
- **位置**: `manifest.json:1-36`
- **问题**: MV3 扩展无 action 时点击工具栏图标无响应
- **修复**: 添加 `"action": { "default_icon": {...} }`
- **验证状态**: ✅ CONFIRMED（P12 审计发现）

### TODO-14: handleTestConnection 零测试覆盖
- **分区**: P1-background
- **位置**: `test/background/stream.test.ts`（缺失）
- **问题**: P5-A 任务 1.1 新增的核心函数 handleTestConnection 零测试覆盖
- **修复**: 补充 test_connection 的成功/失败/超时/断连测试
- **验证状态**: ✅ CONFIRMED（P1 审计发现）

### TODO-15: TestConnectionButton port.postMessage 未 try/catch
- **分区**: P7-components-settings
- **位置**: `src/components/model-settings/TestConnectionButton.tsx:153`
- **问题**: Port 断开时 postMessage 抛异常，按钮卡在 testing 态
- **修复**: 同步包 try/catch
- **验证状态**: ✅ CONFIRMED（P7 审计发现）

### TODO-16: ask-clarification + bilibili-search 零测试覆盖
- **分区**: P3-tools
- **位置**: `test/tools/ask-clarification.test.ts` + `test/tools/bilibili-search.test.ts`（均缺失）
- **问题**: 两个核心工具模块零测试覆盖
- **修复**: 新建测试文件
- **验证状态**: ✅ CONFIRMED（P3 审计发现）

### TODO-17: working-memory update TOCTOU 竞态
- **分区**: P3-tools
- **位置**: `src/tools/working-memory.ts:43-57`
- **问题**: read-then-write 非原子，并发 update 导致 lost update
- **修复**: 串行化队列或 SC-1 编排层保证串行
- **验证状态**: ✅ CONFIRMED（P3 审计发现）

### TODO-18: createModel switch 无 default 分支
- **分区**: P5-config
- **位置**: `src/config/provider-factory.ts:7-25`
- **问题**: 脏数据绕过类型检查时隐式返回 undefined
- **修复**: 添加 default 分支抛出明确错误
- **验证状态**: ✅ CONFIRMED（P5 审计发现）

### TODO-19: ErrorBoundary 异常信息未脱敏
- **分区**: P2-content
- **位置**: `src/content/error-boundary.tsx:24,46`
- **问题**: 原始 error.message 渲染到 Shadow DOM，可能含 API Key 等敏感信息
- **修复**: 添加 redact() 脱敏函数
- **验证状态**: ✅ CONFIRMED（P2 审计发现）

### TODO-20: VideoCard.parseTitle 正则清洗 HTML 不可靠
- **分区**: P6-components-core
- **位置**: `src/components/VideoCard.tsx:34-61`
- **问题**: 手写正则清洗 HTML 标签，遗漏 svg/math/img onerror 等危险标签（React 默认转义兜底）
- **修复**: 只保留 em 关键字提取，其余一律纯文本
- **验证状态**: ✅ CONFIRMED（P6 审计发现）

### TODO-21: vite 8 与 vitest 2 / crxjs 2 版本兼容性存疑
- **分区**: P12-build-config
- **位置**: `package.json:24-44`
- **问题**: vite ^8.1.1 + vitest ^2.1.9（设计用于 vite 5/6）+ @crxjs/vite-plugin ^2.7.1
- **修复**: 运行 `npm ls vite` 验证依赖树
- **验证状态**: ✅ CONFIRMED（P12 审计发现）

---

## 🟡 警告问题（推荐修复，影响可维护性或边缘场景）

### TODO-22: titleRequestedRef 边界竞态（降级）
- **分区**: P2-content
- **位置**: `src/content/chat-context.tsx:686`
- **问题**: connection 在 add 之后、postMessage 之前断开时，conversationId 被标记但请求未发出
- **修复**: 将 add 移到连接可用判断块内
- **验证状态**: ⬇️ DOWNGRADED from 🔴 to 🟡（边界竞态，非硬错误）

### TODO-23: TestConnectionButton provider 切换边缘泄漏（降级）
- **分区**: P7-components-settings
- **位置**: `src/components/model-settings/TestConnectionButton.tsx:106-170`
- **问题**: testing 进行中 provider 变化时旧 listener 未清理（边缘竞态）
- **修复**: 添加 provider 变化时清理的 effect
- **验证状态**: ⬇️ DOWNGRADED from 🔴 to 🟡（边缘竞态）

### TODO-24: stream.ts result.stream as 断言缺防御
- **分区**: P1-background
- **位置**: `src/background/stream.ts:332`
- **问题**: `as AsyncIterable` 断言无运行时校验
- **修复**: 加 `if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') throw`

### TODO-25: stream.ts Unicode 标题切片边界
- **分区**: P1-background
- **位置**: `src/background/stream.ts:478-479`
- **问题**: `slice(0, N)` 按 UTF-16 码元切片，emoji surrogate pair 可能被截断
- **修复**: `Array.from(rawTitle).slice(0, N).join('')`

### TODO-26: query-expand searchSuggest/searchHot 串行执行
- **分区**: P3-tools
- **位置**: `src/tools/query-expand.ts:104-109`
- **问题**: 注释声称"并行"但实际串行
- **修复**: 改用 `Promise.all`

### TODO-27: LLM 调用无超时（llm-json.ts / analyze-covers.ts）
- **分区**: P3-tools
- **位置**: `src/tools/llm-json.ts:117-155` + `src/tools/analyze-covers.ts:282-302`
- **问题**: generateObject/generateText/streamText 均无 abortSignal
- **修复**: 添加 `abortSignal: AbortSignal.timeout(30_000)`

### TODO-28: video-rerank 30 路并发无限制
- **分区**: P3-tools
- **位置**: `src/tools/video-rerank.ts:92-107`
- **问题**: Promise.allSettled 对 30 个视频并发 fetchVideoTags，易触发 B站风控
- **修复**: 分批并发，每批 5 个

### TODO-29: analyze-covers fetchCoverAsDataUrl SSRF 风险
- **分区**: P3-tools
- **位置**: `src/tools/analyze-covers.ts:196-208`
- **问题**: 未验证 picUrl 协议白名单
- **修复**: 添加 `isAllowedCoverUrl` 校验

### TODO-30: sanitize.ts 循环引用栈溢出
- **分区**: P4b-lib-shared
- **位置**: `src/lib/shared-types/sanitize.ts:12-36`
- **问题**: 递归遍历无深度限制，循环引用导致栈溢出
- **修复**: 添加 WeakSet 检测循环引用

### TODO-31: save-orchestrator 触发点5 缺少卸载保护
- **分区**: P4b-lib-shared
- **位置**: `src/lib/history/save-orchestrator.ts:262-281`
- **问题**: useEffect 无 cleanup，与触发点4 不一致
- **修复**: 添加 cancelled 标志保护

### TODO-32: manifest 缺少 CSP / web_accessible_resources
- **分区**: P12-build-config
- **位置**: `manifest.json`
- **问题**: 缺少显式 CSP；可能阻塞 Shadow DOM 资源加载
- **修复**: 添加 CSP 和 web_accessible_resources

### TODO-33: vitest 缺少 coverage 配置
- **分区**: P12-build-config
- **位置**: `vitest.config.ts:9-13`
- **修复**: 添加 `coverage: { provider: 'v8', reporter: ['text', 'html'] }`

### TODO-34: search.test.ts + wbi.test.ts 完全缺失
- **分区**: P4a-lib-bili
- **位置**: `test/bilibili-client/search.test.ts` + `test/bilibili-client/wbi.test.ts`（均缺失）
- **问题**: 152 行核心搜索 + 274 行 WBI 签名完全无测试
- **修复**: 新建测试文件

### TODO-35: Cookie 拼接注入风险
- **分区**: P4a-lib-bili
- **位置**: `search.ts:120` / `tags.ts:82`
- **问题**: `headers.Cookie = 'SESSDATA=' + sessdata` 未校验 sessdata 格式
- **修复**: 添加 SESSDATA_PATTERN 正则校验

### TODO-36: settings-migration.ts 浅拷贝引用共享
- **分区**: P5-config
- **位置**: `src/config/settings-migration.ts:102`
- **问题**: `{ ...DEFAULT_SETTINGS }` 浅拷贝，providers 数组与模块级常量共享引用
- **修复**: `providers: DEFAULT_SETTINGS.providers.map(p => ({ ...p }))`

### TODO-37: 多组件 storage/chrome API 调用未捕获 rejection
- **分区**: P6-components-core
- **位置**: `App.tsx:26-32,46-50` + `ChatInput.tsx:16-33` + `HistoryDropdown.tsx` 多处
- **问题**: chrome.storage.local.get/set 未 .catch()
- **修复**: 补 .catch 降级处理

---

## 🔵 建议改进（可选，提升代码质量）

### TODO-38: collectBuiltInHostnames 每次调用重新计算
- **分区**: P5-config / P6
- **位置**: `origin-pattern.ts:109-123,154`
- **修复**: 用 IIFE 缓存为模块级常量

### TODO-39: SettingsPanel 100+ 行内联 CSSProperties 每次 render 重建
- **分区**: P7-components-settings
- **位置**: `SettingsPanel.tsx:246-346`
- **修复**: 不变样式提到模块顶层，依赖 state 的用 useMemo

### TODO-40: inferErrorCode 用 includes 检测状态码
- **分区**: P1-background
- **位置**: `port-protocol.ts:96-101`
- **修复**: 改用正则边界匹配 `/\b401\b/`

### TODO-41: eslint globals 缺少 serviceworker
- **分区**: P12-build-config
- **位置**: `eslint.config.js:18-20`
- **修复**: 添加 `globals.serviceworker`

### TODO-42: 硬编码 storage key 字符串散布
- **分区**: P6-components-core
- **位置**: Panel.tsx / App.tsx / ToggleButton.tsx 多处
- **修复**: 集中到 `src/lib/constants.ts`

### TODO-43: package.json 缺少 engines / sideEffects
- **分区**: P12-build-config
- **修复**: 添加 `"engines": { "node": ">=20.0.0" }` 和 `"sideEffects": false`

### TODO-44: MessageList 高频流式重渲染
- **分区**: P6-components-core
- **位置**: `MessageList.tsx:64-96`
- **修复**: 流式状态隔离到最后一条消息的 memo 子组件

### TODO-45: splitSystemMessage 静默丢弃多条 system 消息
- **分区**: P3-tools
- **位置**: `llm-json.ts:96-105`
- **修复**: 合并所有 system 消息

---

## 部分覆盖矩阵

| 部分 | ①语法 | ②类型 | ⑤空指针 | ⑥逻辑 | ⑦并发 | ⑧性能 | ⑩错误处理 | ⑫测试 | ③命名 | ④导入 | ⑨安全 | ⑪配置 |
|------|-------|-------|---------|-------|-------|-------|----------|-------|-------|-------|-------|-------|
| P1-background | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| P2-content | ✅ | ⚠️ | ✅ | ⚠️ | ❌ | ⚠️ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| P3-tools | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| P4a-lib-bili | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ |
| P4b-lib-shared | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ | ✅ | ⚠️ | ❌ | ⚠️ |
| P5-config | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| P6-components-core | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ |
| P7-components-settings | ✅ | ⚠️ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| P8-hooks-utils | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| P9-test-a | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| P10-test-b | ✅ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| P11-e2e | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| P12-build-config | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ |

## 修复优先级建议

1. **P0（阻断合并）**: TODO-01 (tsconfig strict), TODO-05 (权限手势), TODO-06 (window 访问), TODO-07 (伪测试)
2. **P1（安全关键）**: TODO-02 (API Key 明文+sanitize), TODO-08 (sanitize 零测试), TODO-03 (MutationObserver 泄漏)
3. **P2（功能缺陷）**: TODO-04 (ErrorDisplay 重试), TODO-09 (unhandled rejection), TODO-10 (triedKeywords 覆盖), TODO-11 (fetch 无超时), TODO-12 (session-memory 异常), TODO-15 (postMessage 未 catch), TODO-18 (createModel 无 default)
4. **P3（测试补全）**: TODO-14 (handleTestConnection 测试), TODO-16 (ask-clarification/bilibili-search 测试), TODO-34 (search/wbi 测试)
5. **P4（配置/规范）**: TODO-13 (manifest action), TODO-21 (版本兼容), TODO-32 (CSP), TODO-33 (coverage), TODO-35 (Cookie 注入)
6. **P5（优化改进）**: TODO-22~45 逐步推进

## 未覆盖说明

- `playwright.config.ts` 在 P11 中未逐行审计（P12 中已覆盖）
- `node_modules/` 和 `dist/` 不在审计范围
- `.opencode/` 和 `.swarm/` 配置目录不在审计范围

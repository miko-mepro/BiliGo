# BiliAgent 已开发功能盘点表

> 来源：BiliAgent 仓库 全量代码扫描
> 日期：2026-07-11
> 用途：迁移到 Vercel AI SDK 架构时的功能移植参照表

---

## 一、基础设施层（4 包）

| # | 功能 | 包/文件 | 迁移影响 |
|---|------|---------|---------|
| 1 | **WBI 签名鉴权** | bilibili-client/src/wbi.ts (274行) - MD5 签名、6h key 缓存、自动刷新 | 无需改动，纯工具函数 |
| 2 | **视频搜索** | bilibili-client/src/search.ts (152行) - searchVideo() + 风控/网络错误类 | 无需改动 |
| 3 | **热门搜索词** | bilibili-client/src/hot.ts (61行) - searchHot(limit) | 无需改动 |
| 4 | **搜索建议** | bilibili-client/src/suggest.ts (57行) - searchSuggest(term) | 无需改动 |
| 5 | **视频标签获取** | bilibili-client/src/tags.ts (76行) - fetchVideoTags(bvid) | 无需改动 |
| 6 | **共享类型** | shared-types/src/index.ts (173行) - ChatMessage/ToolCall/BilibiliVideoCard 等 | 无需改动 |
| 7 | **Provider 配置类型** | shared-types/src/provider.ts (100行) - 9 个内置 provider 定义 | 需适配 AI SDK |
| 8 | **日志脱敏** | shared-types/src/sanitize.ts (37行) - cookie/auth/key 过滤 | 无需改动 |

---

## 二、LLM Provider 层（将被删除）

| # | 功能 | 文件 | 行数 | 迁移去向 |
|---|------|------|------|---------|
| 9 | **OpenAI Adapter** | llm-provider/src/adapters/openai.ts | 444 | @ai-sdk/openai |
| 10 | **Anthropic Adapter** | llm-provider/src/adapters/anthropic.ts | ~300 | @ai-sdk/anthropic |
| 11 | **Gemini Adapter** | llm-provider/src/adapters/gemini.ts | ~300 | @ai-sdk/google |
| 12 | **SSE 流解析** | adapter 内部 parseSse() + tool_call delta 拼接 | ~200 | AI SDK 内部 |
| 13 | **OpenRouter Provider** | llm-provider/src/provider.ts | 427 | @ai-sdk/openai (兼容) |
| 14 | **Vision 检测** | llm-provider/src/vision.ts | 19 | AI SDK 原生 |
| 15 | **Provider 工厂** | llm-provider/src/factory.ts | 50 | createModel() |
| 16 | **ChatProvider 接口** | llm-provider/src/types.ts | 27 | AI SDK LanguageModel |
| 17 | **自动回退** | adapter 内 shouldRetryWithFallback | ~30 | AI SDK middleware |
| 18 | **错误归一化** | adapter 内 normalizeError + retryAfter 解析 | ~50 | AI SDK 错误处理 |

---

## 三、Agent 工具层（7 个 tool）

| # | 功能 | 文件 | 行数 | 迁移方式 |
|---|------|------|------|---------|
| 19 | **slang_understand（黑话理解）** | agent-tools/understand.ts | 133 | 包装为 tool() |
| 20 | **query_expand（查询扩展）** | agent-tools/expand.ts | 152 | 包装为 tool() |
| 21 | **bilibili_search（视频搜索）** | router.ts:198-217 内联 | ~20 | 包装为 tool() |
| 22 | **video_rerank（智能重排）** | agent-tools/rerank.ts | 159 | 包装为 tool() |
| 23 | **ask_clarification（澄清引导）** | router.ts:284-302 内联 | ~19 | 包装为 tool() |
| 24 | **analyze_covers（封面分析）** | background/cover-analysis.ts | 254 | 包装为 tool() 或 SW 内部 |
| 25 | **working-memory（记忆系统）** | agent-tools/working-memory.ts | 58 | 会话级状态 |
| 26 | **俚语字典** | agent-tools/slang-dictionary.json | 200+ 条 | 无需改动 |
| 27 | **标签分类表** | agent-tools/tag-categories.json | 300+ 条 | 无需改动 |
| 28 | **LLM JSON 调用** | agent-tools/llm-json.ts | 71 | 改用 generateObject() |

### 工具详情

#### slang_understand（黑话理解）

- 识别网络俚语、缩写、梗文化，标准化为可搜索意图
- 内置 200+ 俚语字典 slang-dictionary.json
- 字典命中走本地匹配，未命中走 LLM 调用
- 输出：{ original, normalized, explanation, matchedDict }
- 写入 WorkingMemory.triedKeywords

#### query_expand（查询扩展）

- 基于意图生成多个关键词和标签候选
- 调用 Bilibili 搜索建议 (searchSuggest) 和热门词 (searchHot) 作为辅助上下文
- 内置 300+ 标签分类表 tag-categories.json
- LLM 生成 { keywords[], tags[], categories[], rationale }
- 限制：keywords <= 8, tags <= 5, categories <= 3

#### bilibili_search（视频搜索）

- 调用 searchVideo(keyword, opts, sessdata)
- 支持 5 种排序：综合/点击/最新/弹幕/收藏
- 可选封面分析 (analyze_covers)
- 从 chrome.cookies 获取 SESSDATA
- 返回 BilibiliVideoCard[]

#### video_rerank（智能重排）

- 基于 LLM 语义相似度对搜索结果重排
- 最多 30 个候选视频
- 调用 fetchVideoTags(bvid) 获取每个视频标签
- LLM 打分 [0,1]，输出 { items[], strategy, trimmed }
- fallback：保持原序，score 递减 0.01

#### ask_clarification（澄清引导）

- 意图模糊/多义时向用户提问
- 输出 { question, options?, reason }
- 每会话最多 1 次

#### analyze_covers（封面分析）

- Vision 模型读取封面图，生成中文描述
- 最多 5 张 (HARD_MAX_COVERS)
- 7 天缓存 (chrome.storage.local)
- 封面下载 -> base64 data URL -> vision LLM
- 支持模型不支持视觉时的降级标记

#### working-memory（记忆系统）

- chrome.storage.session 存储，5 分钟 TTL
- 字段：triedKeywords / rejectedBvids / failureReasons / clarificationCount
- 跟踪已尝试关键词和失败原因

---

## 四、Service Worker 路由层（将被重写）

| # | 功能 | 文件 | 行数 | 迁移去向 |
|---|------|------|------|---------|
| 29 | **消息路由** | background/router.ts | 478 | streamText() 内闭环 |
| 30 | **双 Port 注册** | router.ts:96-128 - bili-agent-chat + bili-agent-llm | ~32 | 单 Port |
| 31 | **tool_call 分发** | router.ts:178-196 - switch-case 5 个 tool | ~19 | AI SDK tools 定义 |
| 32 | **tool 结果回传** | router.ts:157-176 | ~20 | AI SDK 自动 |
| 33 | **封面描述附加** | router.ts:304-338 - attachCoverDescriptions | ~35 | tool execute 内 |
| 34 | **SESSDATA 获取** | router.ts:357-364 - getSessdata() | ~8 | 不变 |
| 35 | **内存 WorkingMemory Store** | router.ts:458-478 | ~21 | 不变或用 AI SDK state |
| 36 | **Port 心跳** | router.ts 内 postToPort 断连检测 | ~10 | 简化 |

---

## 五、Content Script - 聊天核心

| # | 功能 | 文件 | 行数 | 迁移方式 |
|---|------|------|------|---------|
| 37 | **ChatContext 状态管理** | ChatContext.tsx | 1104 | 大幅简化 |
| 38 | **手写 tool loop** | ChatContext.tsx:782-857 - streamViaLlmAdapter | ~75 | AI SDK streamText |
| 39 | **MAX_TOOL_ROUNDS** | ChatContext.tsx:11 - 5 轮限制 | 1 | stopWhen: isStepCount(5) |
| 40 | **双 Port LLM 通信** | ChatContext.tsx:877-959 - chatViaBackground | ~82 | 单 Port 流式 |
| 41 | **tool 执行 Port** | ChatContext.tsx:961-1027 - resolveToolCall | ~66 | SW 内部执行 |
| 42 | **流式 delta 渲染** | ChatContext.tsx:455-458 | ~4 | 不变 |
| 43 | **reasoning 流式** | ChatContext.tsx:469-472 | ~4 | AI SDK reasoning |
| 44 | **tool_start 提示** | ChatContext.tsx:474-481 - onToolStart | ~8 | step stream |
| 45 | **视频结果注入** | ChatContext.tsx:482 - onVideos | ~1 | step stream |
| 46 | **insight 注入** | ChatContext.tsx:483-493 - understanding/expansion/rerank/clarification | ~11 | step stream |
| 47 | **错误归一化** | ChatContext.tsx:1042-1097 - normalizeStreamError/friendlyErrorMessage | ~56 | AI SDK error |
| 48 | **系统 prompt** | ChatContext.tsx:105-119 - 5 步工作流指令 | ~15 | system 参数 |
| 49 | **tool 定义** | ChatContext.tsx:20-103 - 5 个 BILIBILI_TOOLS | ~84 | AI SDK tool() |
| 50 | **中断生成** | ChatContext.tsx:522-524 - stopGeneration | ~3 | AbortSignal |
| 51 | **会话持久化** | ChatContext.tsx:722-741 - hydrate/conversation storage | ~20 | 不变 |

### 系统 Prompt 原文

```
你是 Bilibili 视频搜索助手。请严格按以下工作流处理用户请求：

1. **理解黑话**：如果用户输入包含网络梗、俚语、缩写（如"退退退/绝绝子/yyds/破防"），先调用 slang_understand 把意图标准化。
2. **扩展查询**：调用 query_expand 把标准化后的意图扩展成多个候选关键词/标签。
3. **搜索视频**：调用 bilibili_search 执行搜索。仅在用户明确说"按封面搜/看封面"时才把 analyze_covers 设为 true。
4. **智能重排**：当 bilibili_search 返回多于 3 个结果时，调用 video_rerank 重排，把最相关的放最前面。
5. **展示或澄清**：如果你对结果有信心，直接用自然语言总结并展示；如果意图非常模糊或多义且本会话还没追问过，调用 ask_clarification 追问（每会话最多 1 次）。

硬性规则：
- 单次会话工具调用不超过 5 轮，超过就停止调用工具直接回答。
- 不要跳过第 1、2 步直接搜索；除非用户输入已经是非常具体、明确的标准中文关键词。
- 每次工具调用前先简短说明你的计划，再发起调用。
- 当用户只是闲聊或问与视频搜索无关的问题时，可以直接回答，不调用任何工具。
```

### ChatState 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| messages | ChatMessage[] | 对话消息列表 |
| videos | BilibiliVideoCard[] | 当前搜索结果视频 |
| isLoading | boolean | 加载状态 |
| error | ErrorPayload \| null | 错误信息 |
| streamingContent | string | 流式文本累积 |
| streamingReasoning | string | 推理过程文本 |
| activity | AgentActivity \| null | 当前活动状态 |
| hydrated | boolean | 是否已从存储恢复 |
| conversationId | string | 会话 ID |
| understandings | TimedUnderstanding[] | 黑话理解结果 |
| expansions | TimedExpansion[] | 查询扩展结果 |
| reranks | TimedRerank[] | 重排结果 |
| clarification | ClarificationRequest \| null | 澄清请求 |

### ChatAction 类型

| Action | 说明 |
|--------|------|
| ADD_MESSAGE | 添加消息 |
| SET_LOADING | 设置加载状态 |
| SET_ERROR | 设置错误 |
| SET_VIDEOS | 设置视频列表 |
| APPEND_STREAMING | 追加流式文本 |
| APPEND_REASONING | 追加推理文本 |
| SET_ACTIVITY | 设置活动状态 |
| ADD_STEP | 添加工具步骤 |
| CLEAR_STREAMING | 清空流式 |
| UPDATE_LAST_MESSAGE | 更新最后消息 |
| CLEAR_MESSAGES | 清空消息 |
| HYDRATE | 从存储恢复 |
| REHYDRATE | 强制恢复（加载历史） |
| ADD_UNDERSTANDING | 添加理解结果 |
| ADD_EXPANSION | 添加扩展结果 |
| ADD_RERANK | 添加重排结果 |
| SET_CLARIFICATION | 设置澄清 |
| CLEAR_CLARIFICATION | 清空澄清 |

---

## 六、Content Script - UI 组件

| # | 功能 | 文件 | 行数 | 迁移方式 |
|---|------|------|------|---------|
| 52 | **App 根组件** | App.tsx | 199 | 不变 |
| 53 | **Panel 主面板** | Panel.tsx | 510 | 不变 |
| 54 | **ChatInput 输入框** | ChatInput.tsx | 151 | 不变 |
| 55 | **ChatMessage 消息气泡** | ChatMessage.tsx | 132 | 不变 |
| 56 | **MessageList 消息列表** | MessageList.tsx | 201 | 不变 |
| 57 | **VideoCard 视频卡片** | VideoCard.tsx | 123 | 不变 |
| 58 | **FilterSortControls 排序筛选** | FilterSortControls.tsx | 120 | 不变 |
| 59 | **ErrorDisplay 错误展示** | ErrorDisplay.tsx | 89 | 不变 |
| 60 | **AgentInsightCard 洞察卡片** | AgentInsightCard.tsx | 172 | 不变 |
| 61 | **ToggleButton 开关按钮** | ToggleButton.tsx | 122 | 不变 |
| 62 | **SettingsPanel 设置面板** | SettingsPanel.tsx | 219 | 不变 |
| 63 | **HistoryDropdown 历史下拉** | HistoryDropdown.tsx | 284 | 不变 |
| 64 | **ProviderList 提供商列表** | model-settings/ProviderList.tsx | 163 | 不变 |
| 65 | **ProviderForm 提供商表单** | model-settings/ProviderForm.tsx | 152 | 不变 |
| 66 | **TestConnectionButton 测试连接** | model-settings/TestConnectionButton.tsx | 99 | 改用 AI SDK |

### UI 组件详情

#### App.tsx - 根组件

- 面板开关状态持久化 (bili-agent-panel-open)
- 跨标签页同步面板状态 (chrome.storage.onChanged)
- 历史同步 (HistorySync) - 跨标签页历史索引变更通知
- 点击面板外部关闭
- 交互状态跟踪 (isInteractingRef)
- 事件分发：HISTORY_NEW_CHAT_EVENT / HISTORY_LOAD_EVENT / HISTORY_SAVE_EVENT

#### Panel.tsx - 主面板

- 可拖拽 (useDraggable) + 可缩放 (useResizable)
- 智能定位：根据 ToggleButton 位置自动选择左/右侧
- 尺寸约束：min 280x300，自适应视口
- 两个视图：聊天 / 设置
- 历史下拉集成
- 新建对话 / 加载历史 / 删除 / 重命名 / 清空全部

#### ChatMessage.tsx - 消息气泡

- 流式渲染（打字机效果）
- reasoning 折叠展开
- tool steps 时间线
- activity 指示器（thinking/responding/tool）
- Markdown 渲染

#### VideoCard.tsx - 视频卡片

- 播放量格式化（万）
- 标题 <em class="keyword"> 高亮
- 危险标签过滤（script/style/iframe 等）
- 点击打开视频

#### AgentInsightCard.tsx - 洞察卡片

- 4 种类型：understanding / expansion / rerank / clarification
- clarification 支持选项点击回调
- 可折叠
- B 站粉色风格

#### SettingsPanel.tsx - 设置面板

- 两个分区：通用 / 模型
- 通用：主题模式（auto/light/dark）
- 模型：Provider 列表 + Provider 表单 + 测试连接
- 保存状态反馈

#### ProviderForm.tsx - 提供商表单

- 字段：name / format(openai/anthropic/gemini) / baseUrl / apiKey / model
- URL 格式校验
- apiKey 非空校验（ollama 除外）
- 触发验证标记 (touched)

---

## 七、Content Script - Hooks

| # | 功能 | 文件 | 行数 | 迁移方式 |
|---|------|------|------|---------|
| 67 | **useDraggable 拖拽** | hooks/useDraggable.ts | 341 | 不变 |
| 68 | **useResizable 缩放** | hooks/useResizable.ts | 288 | 不变 |
| 69 | **useTheme 主题** | hooks/useTheme.ts | 94 | 不变 |
| 70 | **useStreamConsumer SSE 消费** | hooks/useStreamConsumer.ts | 158 | 可能废弃 |

### Hooks 详情

#### useDraggable

- 支持轴限制 (x/y/both)
- 支持边界约束 (bounds)
- 拖拽阈值 (5px)
- 支持外部 handle (handleRef)
- 拖拽回调：onDragStart / onDrag / onDragEnd
- 支持在拖拽中使用 transform
- 位置持久化

#### useResizable

- 8 方向缩放：n/s/e/w/ne/nw/se/sw
- 最小/最大尺寸约束
- 键盘缩放支持 (resizeByKeyboard)
- 缩放回调：onResizeStart / onResize / onResizeEnd

#### useTheme

- 三种模式：auto / light / dark
- auto 模式监听 prefers-color-scheme
- 跨上下文同步 (chrome.storage.onChanged)
- 返回 resolved theme ('light' | 'dark')

---

## 八、Content Script - 历史记录系统

| # | 功能 | 文件 | 行数 | 迁移方式 |
|---|------|------|------|---------|
| 71 | **存储原语** | history/store.ts | 126 | 不变 |
| 72 | **跨标签页同步** | history/sync.ts | 65 | 不变 |
| 73 | **保存编排器** | history/save-orchestrator.ts | 159 | 不变 |
| 74 | **对话保存/加载/删除** | history/store.ts 内 | ~100 | 不变 |
| 75 | **标题自动生成** | ChatContext.tsx:577-592 - LLM summarize | ~16 | 改用 AI SDK |
| 76 | **历史索引** | history/store.ts - getHistoryIndex/writeHistoryIndex | ~20 | 不变 |
| 77 | **最多 50 条历史** | history/store.ts:14 - MAX_HISTORY | 1 | 不变 |

### 历史系统详情

#### store.ts - 存储原语

- saveConversation(data, tempTitle) - 保存对话，返回 ConversationRecord
- loadConversation(id) - 加载完整对话 (ConversationData)
- deleteConversation(id) - 删除单条
- clearAllHistory() - 清空全部
- updateTitle(id, title) - 更新标题
- getHistoryIndex() - 获取索引列表
- writeHistoryIndex(index) - 写入索引
- 索引 key: bili-agent-history-index
- 数据 key: bili-agent-history:{id}
- 最多 50 条，超出自动截断
- 数据格式版本: version: 2

#### sync.ts - 跨标签页同步

- HistorySync 类
- 监听 chrome.storage.onChanged
- syncId 机制避免自身写入触发回调
- pending write ID 追踪 (200ms TTL)
- start(callback) / stop()
- trackedWrite(index) - 带追踪的写入

#### save-orchestrator.ts - 保存编排器

- useConversationSaver hook
- 4 个保存触发点：
  1. 本地缓存防抖 (300ms) - state 变更时
  2. HISTORY_SAVE_EVENT 监听 - 面板关闭时
  3. beforeunload 监听 - 页面卸载时
  4. 首次启用历史的迁移 - 索引为空 + 存在存储对话时
- 最多持久化 200 条消息 (MAX_PERSISTED_MESSAGES)
- 当前对话存储 key: bili-agent-conversation

#### ConversationData 格式

```typescript
interface ConversationData {
  version: 2;
  id: string;
  messages: ChatMessage[];
  videos: BilibiliVideoCard[];
  understandings: Array<SlangUnderstandResult & { receivedAt: number }>;
  expansions: Array<QueryExpandResult & { receivedAt: number }>;
  reranks: Array<RerankResult & { receivedAt: number }>;
  createdAt: number;
  lastActiveAt: number;
}
```

#### ConversationRecord 格式

```typescript
interface ConversationRecord {
  id: string;
  title: string;
  titleFinal: boolean;
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
}
```

---

## 九、Content Script - 工具

| # | 功能 | 文件 | 行数 | 迁移方式 |
|---|------|------|------|---------|
| 78 | **视频排序** | utils/sort-filter.ts - sortVideos() | ~25 | 不变 |
| 79 | **视频日期筛选** | utils/sort-filter.ts - filterByDate() | ~20 | 不变 |
| 80 | **视频时长筛选** | utils/sort-filter.ts - filterByDuration() | ~20 | 不变 |
| 81 | **时长解析** | utils/sort-filter.ts - parseDurationToSeconds() | ~20 | 不变 |
| 82 | **轻量 LLM 调用** | lib/lightweight-llm.ts | 54 | 改用 AI SDK |

### 工具详情

#### sort-filter.ts

- SortField: 'play' | 'pubdate' | 'duration' | 'favorites'
- DateFilter: 'all' | 'week' | 'month' | 'year'
- DurationFilter: 'all' | 'short' | 'medium' | 'long'
- parseDurationToSeconds(duration) - 解析 MM:SS 或 HH:MM:SS
- sortVideos(videos, sortField) - 降序排序
- filterByDate(videos, filter) - 按发布时间筛选
- filterByDuration(videos, filter) - 按时长筛选
- applySortAndFilter(videos, sortField, dateFilter, durationFilter) - 组合应用

#### lightweight-llm.ts

- callLightweightLLM({ task, messages, options }) - 轻量 LLM 调用
- 无工具循环，无流式，单次请求-响应
- 10 秒超时
- 通过 chrome.runtime.sendMessage 发送到 SW
- 用途：对话标题生成

---

## 十、设置与配置

| # | 功能 | 文件 | 行数 | 迁移方式 |
|---|------|------|------|---------|
| 83 | **设置读写** | settings.ts | 41 | 不变 |
| 84 | **设置迁移** | settings-migration.ts | 52 | 需新迁移逻辑 |
| 85 | **chrome.storage.local 持久化** | 多处 | - | 不变 |
| 86 | **chrome.storage.session 会话记忆** | session-memory.ts | 59 | 不变 |
| 87 | **速率限制** | settings.ts / background.ts 内 | - | 不变 |
| 88 | **面板开关状态持久化** | App.tsx:32-58 | ~27 | 不变 |

### 设置详情

#### BiliAgentSettings

```typescript
interface BiliAgentSettings {
  providers: ProviderConfig[];
  activeProviderId: string | null;
  themeMode: ThemeMode; // 'auto' | 'light' | 'dark'
}
```

#### ProviderConfig

```typescript
interface ProviderConfig {
  id: string;
  name: string;
  format: ApiFormat; // 'openai' | 'anthropic' | 'gemini'
  baseUrl: string;
  apiKey: string;
  model: string;
  isBuiltIn: boolean;
  isCustom: boolean;
}
```

#### 9 个内置 Provider

| ID | 名称 | API 格式 | 基础 URL |
|----|------|----------|----------|
| openai | OpenAI 官方 | openai | https://api.openai.com/v1 |
| anthropic | Anthropic 官方 | anthropic | https://api.anthropic.com/v1 |
| gemini | Google Gemini | gemini | https://generativelanguage.googleapis.com/v1beta |
| deepseek | DeepSeek | openai | https://api.deepseek.com/v1 |
| moonshot | Moonshot/Kimi | openai | https://api.moonshot.cn/v1 |
| zhipu | 智谱 GLM | openai | https://open.bigmodel.cn/api/paas/v4 |
| qwen | 通义千问 | openai | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| openrouter | OpenRouter | openai | https://openrouter.ai/api/v1 |
| ollama | Ollama 本地 | openai | http://localhost:11434/v1 |

#### 设置迁移逻辑

- 已有 providers 字段 -> 直接使用
- 旧 openRouterApiKey 字段 -> 迁移为 openrouter provider
- 空/损坏 -> 默认 9 个内置 provider

---

## 十一、扩展基础设施

| # | 功能 | 文件 | 行数 | 迁移方式 |
|---|------|------|------|---------|
| 89 | **Shadow DOM 挂载** | content/index.tsx | 53 | 不变 |
| 90 | **Constructable Stylesheets** | content/styles.ts | 1734 | 不变 |
| 91 | **MV3 manifest** | manifest.json | 34 | 不变 |
| 92 | **Vite 构建** | vite.config.ts + scripts/fix-content-script.mjs | - | 不变 |
| 93 | **视频打开** | background.ts:18-23 - openVideo | ~6 | 不变 |

### 基础设施详情

#### Shadow DOM 挂载

- Host ID: bili-agent-host
- 零尺寸定位 (position: fixed; width: 0; height: 0; z-index: 10000)
- Shadow DOM open 模式 (attachShadow({ mode: 'open' }))
- adoptedStyleSheets 注入样式（CSP 安全）
- 防重复注入检查
- 注入时机：document_idle

#### MV3 manifest

- permissions: storage, cookies
- host_permissions: bilibili.com + 8 个 LLM API 域名 + localhost + 通配
- content_scripts: 仅 bilibili.com
- background: service worker, type module
- minimum_chrome_version: 116

#### 构建管线

- Vite 构建 -> normalize-extension-output 插件
- scripts/fix-content-script.mjs 内联 settings 代码到 content script
- 原因：Chrome CSP 不允许 content script 动态加载
- 构建输出：packages/extension/dist/

---

## 十二、测试

| # | 类别 | 文件数 | 覆盖范围 |
|---|------|--------|---------|
| 94 | 单元测试 | 29 个 .test.ts/.tsx | adapter/router/agent-tools/ChatContext/components/hooks/history/settings |
| 95 | E2E 测试 | 4 个 .spec.ts | smoke/qa-visual/history-dropdown/agent-flow |

### 单元测试清单

| 文件 | 测试目标 |
|------|---------|
| settings.test.ts | 设置读写 |
| settings-migration.test.ts | 设置迁移 |
| sanity.test.ts | 基础健全性 |
| build-output.test.ts | 构建产物 |
| background.test.ts | SW 消息处理 |
| router.test.ts | tool 路由分发 |
| cover-analysis.test.ts | 封面分析 |
| session-memory.test.ts | 会话记忆 |
| understand.test.ts | 黑话理解 |
| expand.test.ts | 查询扩展 |
| rerank.test.ts | 智能重排 |
| ChatContext.test.tsx | 聊天上下文 |
| AgentInsightCard.test.tsx | 洞察卡片 |
| FilterSortControls.test.tsx | 排序筛选 |
| MessageList.test.tsx | 消息列表 |
| SettingsPanel.test.tsx | 设置面板 |
| VideoCard.test.tsx | 视频卡片 |
| TestConnectionButton.test.tsx | 测试连接 |
| ProviderList.test.tsx | 提供商列表 |
| ProviderForm.test.tsx | 提供商表单 |
| sort-filter.test.ts | 排序筛选逻辑 |
| lightweight-llm.test.ts | 轻量 LLM |
| save-orchestrator.test.ts | 保存编排器 |
| sync.test.ts | 跨标签页同步 |
| store.test.ts | 历史存储 |
| useTheme.test.ts | 主题 hook |
| useResizable.test.tsx | 缩放 hook |
| useDraggable.test.tsx | 拖拽 hook |
| useStreamConsumer.test.tsx | SSE 消费 hook |

### E2E 测试清单

| 文件 | 测试场景 |
|------|---------|
| smoke.spec.ts | 基础冒烟测试 |
| qa-visual.spec.ts | 视觉 QA |
| history-dropdown.spec.ts | 历史下拉功能 |
| agent-flow.spec.ts | Agent 工具流 |

---

## 迁移影响汇总

| 迁移影响等级 | 功能数 | 说明 |
|------------|--------|------|
| **删除替换** | 10 项 (#9-18) | llm-provider 全包 -> @ai-sdk/* |
| **重写** | 8 项 (#29-36, #38-41) | router.ts + ChatContext tool loop + 双 Port -> 单 Port + streamText |
| **适配改写** | 5 项 (#7, #28, #49, #66, #75) | ProviderConfig 类型 / llm-json / tool 定义 / TestConnection / 标题生成 |
| **包装迁移** | 7 项 (#19-25) | 7 个 agent tool -> tool() 定义 |
| **不变** | 65 项 | bilibili-client / shared-types / 全部 UI 组件 / hooks / history / utils / 基础设施 |

**总功能数：95 项，其中需要改动的 30 项，不变的 65 项。**

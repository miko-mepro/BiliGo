# BiliGo

AI 驱动的 Bilibili 视频搜索助手 —— Chrome 浏览器扩展。

## 功能

- **自然语言视频搜索**：用日常语言描述你想看的视频，AI 帮你理解并转换搜索
- **七大内置 Agent 能力**：黑话理解、查询扩展、视频搜索、封面分析、智能重排、记忆系统、澄清引导
- **封面视觉分析**：AI 读取视频封面图，描述封面内容，快速判断视频调性
- **流式聊天 UI**：实时打字机效果，逐字输出
- **多提供商模型支持**：内置 9 个 LLM 提供商（OpenAI、Anthropic、Gemini、DeepSeek、Moonshot、智谱、通义千问、OpenRouter、Ollama），支持自定义 OpenAI 兼容 API
- **WBI 鉴权**：完整实现 Bilibili WBI 签名算法

## 架构

```
Chrome Extension (React Shadow DOM) → Service Worker (Agent Tools) → LLM Provider API
                                                                    → Bilibili API
```

- 纯前端架构，无需自建后端服务
- Content Script 通过 Shadow DOM 隔离 UI 样式
- Service Worker 通过 Chrome Port 与 Content Script 通信
- Agent Tools 在 Service Worker 中执行，直接调用 LLM 和 Bilibili API

## 技术栈

TypeScript · React 19 · Chrome Manifest V3 · Vite · Vitest · Playwright

## 快速开始

```bash
# 进入主目录
cd Main

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 类型检查
npm run typecheck

# 测试
npm test

# E2E 测试
npm run test:e2e
```

## 内置 Agent 能力

| 能力 | 作用 |
|------|------|
| **黑话理解** | 识别网络俚语、缩写、梗文化，标准化用户意图 |
| **查询扩展** | 基于意图生成多个关键词和标签候选 |
| **视频搜索** | 调用 Bilibili API，支持综合排序、点击排序等 |
| **封面分析** | Vision 模型读取封面图，生成中文描述 |
| **智能重排** | 语义相似度计算，重排视频结果 |
| **记忆系统** | 会话级记忆，存储用户偏好、搜索历史、失败原因 |
| **澄清引导** | 多义场景下主动询问，引导用户精准表达 |

完整搜索闭环：**理解黑话 → 扩展查询 → 搜索视频 → 分析封面 → 智能重排 → 精准展示或澄清引导**

## 内置 LLM 提供商

| 名称 | API 格式 |
|------|----------|
| OpenAI | openai |
| Anthropic | anthropic |
| Google Gemini | gemini |
| DeepSeek | openai |
| Moonshot/Kimi | openai |
| 智谱 GLM | openai |
| 通义千问 | openai |
| OpenRouter | openai |
| Ollama 本地 | openai |

支持在扩展设置中自定义任意 OpenAI 兼容 API。

## 项目结构

```
Main/                  # Chrome 扩展主目录
├── src/
│   ├── background/    # Service Worker（Port 协议、流处理）
│   ├── content/       # Content Script（Shadow DOM 挂载、Port 连接）
│   ├── components/    # React UI 组件（Panel、Chat、VideoCard 等）
│   ├── hooks/         # 自定义 Hooks（拖拽、缩放、主题）
│   ├── lib/           # 库（Bilibili API 客户端、历史记录、共享类型）
│   ├── tools/         # Agent 工具（搜索、重排、黑话、封面分析等）
│   ├── skills/        # 技能系统（渐进式技能加载）
│   ├── config/        # 配置（Provider 管理、设置迁移）
│   └── utils/         # 工具函数
├── e2e/               # Playwright E2E 测试
├── test/              # Vitest 单元测试
└── dist/              # 构建产物
```
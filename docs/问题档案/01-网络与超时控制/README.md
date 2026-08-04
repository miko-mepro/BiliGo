# 01-网络与超时控制

## 分类说明

本类问题集中在 Chrome 扩展的网络通信链路、超时控制和错误分类上，涉及连接测试、聊天流式请求、Port 通信和工具内网络失败的错误处理。这些问题共同影响用户在使用扩展时遇到的网络异常的诊断能力：部分错误文案无法区分根因，部分链路缺少独立超时，部分通信通道缺少断线检测。

调查范围覆盖四条网络链路：

1. 对话开始前的连接测试链路（设置页点击"测试连接"）。
2. 对话开始后的 AI 流式请求链路（聊天发送）。
3. content script 与 service worker 之间的 `chrome.runtime.Port` 通信。
4. AI 工具内的 Bilibili 网络请求（搜索、查询扩展等）。

## 包含问题

| 编号 | 问题名称 | 严重程度 | 代码位置 |
| --- | --- | --- | --- |
| N-1 | 连接测试错误分类粗粒度，文案无法区分根因 | MEDIUM | `Main/src/background/port-protocol.ts:96-132`, `Main/src/background/stream.ts` |
| N-2 | 聊天流缺少独立的总超时 | HIGH | `Main/src/background/stream.ts:315-329` |
| N-3 | 设置页 Port 未注册断线处理，缺少心跳机制 | MEDIUM | `Main/src/components/Panel.tsx:425-445`, `Main/src/components/model-settings/TestConnectionButton.tsx:115-189` |
| N-4 | Bilibili 工具网络失败语义与连接测试不一致 | MEDIUM | `Main/src/lib/bilibili-client/search.ts:94-112`, `Main/src/tools/bilibili-search.ts:90-127`, `Main/src/background/stream.ts:368-380` |

## 涉及代码模块

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| Port 协议层 | `Main/src/background/port-protocol.ts` | 定义消息类型，错误码推断（`inferErrorCode`） |
| 流处理层 | `Main/src/background/stream.ts` | 连接测试路由、聊天流式请求、工具结果推送 |
| 设置面板 | `Main/src/components/Panel.tsx` | 设置 Port 建立与销毁 |
| 连接测试按钮 | `Main/src/components/model-settings/TestConnectionButton.tsx` | 前端超时兜底、结果监听 |
| Bilibili 客户端 | `Main/src/lib/bilibili-client/search.ts` | 抛出 `BilibiliNetworkError` |
| 搜索工具 | `Main/src/tools/bilibili-search.ts` | 工具调用入口，异常透传 |
| Port 连接管理 | `Main/src/content/port-connection.ts` | 聊天 Port 的 ping/pong 和 `onDisconnect` 检测 |

## 共性问题特征

### 特征一：错误分类粒度不足

N-1 和 N-4 共同体现网络层错误分类粒度不足的问题。`inferErrorCode`（`port-protocol.ts:96-132`）将未被识别为 401/403 或 429 的异常统一归类为 `NETWORK_ERROR`，UI 显示"网络连接失败"。但 Provider 地址错误、模型不存在、DNS 解析失败等不同根因都可能落入同一分类，用户无法从文案判断应检查哪个环节。

Bilibili 工具的网络失败则走完全不同的 `tool-error` 路径，显示"工具 bilibili_search 执行失败"并终止流，与连接测试的文案语义不一致。两条链路面对相似的网络异常，却呈现不同的用户感知。

### 特征二：超时机制覆盖不完整

仓库中 `AbortSignal.timeout` 的调用位置包括标题生成（10秒）、连接测试（10秒）、Bilibili 请求（10秒）和工具/视觉请求（30秒），但唯独聊天 `streamText`（`stream.ts:315-329`）没有设置总超时。如果上游请求既不返回数据也不主动抛错，聊天可能长期保持等待状态。Port 心跳的 60 秒 pong 超时检测的是通道存活，不能证明上游 AI 请求仍在推进，因此不能替代流请求超时。

### 特征三：两条 Port 链路能力不一致

设置 Port 和聊天 Port 的断线检测能力存在差异：

- 聊天 Port 使用 `connectChatPort`，包含 ping/pong、60 秒 pong 超时和 `onDisconnect` 状态通知（`port-connection.ts:58-115`）。
- 设置 Port 在 `Panel.tsx:425-445` 只建立和销毁，`TestConnectionButton.tsx:132-148` 只注册 `onMessage`，没有注册 `port.onDisconnect`，也没有心跳机制。

这导致设置 Port 在请求发送后断开时，前端只能依赖 12 秒兜底超时，无法及时感知断线。

## 修复方向参考

- 统一网络错误分类语义，区分 DNS 错误、TLS 错误、HTTP 状态码错误、超时和 Provider 配置错误。
- 为聊天流补充独立总超时，参考连接测试的 10 秒和工具请求的 30 秒设定合理阈值。
- 为设置 Port 注册 `onDisconnect` 处理，统一两条 Port 链路的断线检测能力。
- 任何修复均应参阅原始文档 `docs/网络连接错误问题记录.md` 中的复现所需最小证据，确认运行时触发场景后再实施。

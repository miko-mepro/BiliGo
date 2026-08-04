# [N-3] 设置 Port 无断线检测

## 基本信息
- **严重程度**: MEDIUM
- **问题类型**: 状态管理 / 断线检测
- **确认状态**: 已确认两条 Port 链路的断线检测能力不一致；未确认这是否就是用户当前观察到的每一次偶发错误
- **来源文档**: 网络连接错误问题记录.md
- **发现日期**: 2026-08-01
- **关联问题**: N-2

## 问题描述
原生 Port 本身提供 `onDisconnect`，但 `Panel.tsx` 只建立和销毁设置 Port；`TestConnectionButton` 只注册 `onMessage`，没有注册 `port.onDisconnect`。

相比之下，聊天 Port 使用 `connectChatPort`，包含 ping/pong、60 秒 pong 超时和 `onDisconnect` 状态通知。设置 Port 缺少这一层断线反馈。

## 代码位置
- `Main/src/components/Panel.tsx:425-445`（设置 Port 的建立与销毁，未注册 onDisconnect）
- `Main/src/components/model-settings/TestConnectionButton.tsx:132-148`（连接测试只注册 onMessage，未注册 port.onDisconnect）

## 根因分析
设置 Port 与聊天 Port 的链路健壮性设计不一致：

```ts
// TestConnectionButton.tsx 关键逻辑示意
port.onMessage.addListener(handleMessage);
// 未注册 port.onDisconnect.addListener(...)
```

聊天 Port 通过 `connectChatPort` 建立了完整的心跳与断线检测链路：

- ping/pong 周期检测通道存活
- 60 秒 pong 超时兜底
- `onDisconnect` 主动通知状态

而设置 Port 仅依赖 `onMessage` 监听响应，既无心跳也无 `onDisconnect`。当 service worker 端因任何原因终止（崩溃、休眠、被浏览器回收）时，`TestConnectionButton` 无法第一时间感知断开，只能等待 12 秒 `Promise.race` 超时后才向用户反馈。

需要澄清的是：缺少 `onDisconnect` 并不是所有断开场景都会等待 12 秒的直接原因，部分场景下 Port 层会更快抛出；缺少心跳也不是该 12 秒等待的直接原因--聊天心跳的 60 秒阈值反而更长。真正的不一致在于：设置 Port 完全没有接入 `onDisconnect` 这条本可立即反馈断线的原生通道。

## 影响范围
- **用户体验影响**：缺少 `onDisconnect` 处理会延迟部分断线反馈，但不是所有断开场景都会等待 12 秒；缺少心跳也不是该 12 秒等待的直接原因，聊天心跳的 60 秒阈值反而更长。综合来看，用户在设置页测试连接时，部分断线场景反馈偏慢。
- **技术债务影响**：设置 Port 与聊天 Port 的链路健壮性设计不一致，形成两条标准。后续维护设置 Port 相关功能时容易遗漏断线处理。
- **与其他问题的关联**：与 N-2（聊天流缺少总超时）共同构成"超时/断线反馈不完整"的问题族，但二者机制不同--N-2 是上游卡死超时，N-3 是通道断开反馈。

## 复现路径（如有）
1. 在设置页点击"测试连接"发起一次连接测试。
2. 在等待响应期间，通过开发者工具手动终止 service worker。
3. 观察设置 Port 是否立即感知断开并反馈"连接已断开"。
4. 对比聊天 Port 在 service worker 终止时的反馈速度。

## 待验证假设（如有）
- 假设1：用户在设置页偶发"连接超时"实际由 service worker 终止后未触发 `onDisconnect` 引起，最终由 12 秒 `Promise.race` 兜底反馈。需要运行时日志确认 service worker 终止与反馈之间的实际间隔。
- 假设2：部分场景下 `port.onMessage` 在断开时会收到一个错误事件，但当前 `TestConnectionButton` 未处理该路径。需要核实 `onMessage` 回调的参数形态。

## 建议的修复方向
为设置页 Port 注册 `onDisconnect` 监听器，在 Port 断开时立即显示"连接已断开"而非等待 12 秒超时：

1. 在 `TestConnectionButton` 的 Port 建立后，立即注册 `port.onDisconnect.addListener`，在回调中清理 listener/timer 并更新 UI 状态。
2. 在 `Panel.tsx` 的设置 Port 生命周期管理中，统一接入 `onDisconnect`，避免销毁时遗留监听。
3. 不必照搬聊天 Port 的 ping/pong 心跳（设置请求是一次性的，心跳收益有限），重点接入原生 `onDisconnect` 即可。
4. 修复后需确认 12 秒 `Promise.race` 是否仍作为兜底保留，避免双重超时语义冲突。

修复仅描述思路，不包含具体实现代码。

## 参考资料
- 相关测试用例：设置 Port 断线检测用例（待补充）
- 相关设计文档：网络连接错误问题记录.md
- 关联问题：N-2 聊天流缺少总超时

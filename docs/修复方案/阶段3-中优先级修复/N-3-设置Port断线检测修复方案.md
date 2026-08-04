# N-3 设置 Port 断线检测缺失 - 修复方案

## 问题标识

- **问题编号**: N-3
- **严重程度**: MEDIUM
- **问题类型**: 状态管理 / 断线检测
- **所属阶段**: 阶段3 - 中优先级修复
- **修复状态**: pending
- **问题档案**: `docs/问题档案/01-网络与超时控制/N-3-设置Port无断线检测.md`
- **调查依据**: `docs/网络连接错误问题记录.md`
- **发现日期**: 2026-08-01
- **关联问题**: N-2（聊天流缺少总超时，机制不同但同属断线/超时反馈族）、R-3（连接测试结果过期覆盖，共用 `TestConnectionButton` 状态管理）

## 静态确认的代码缺陷

本修复方案针对的代码缺陷已通过静态代码审查完全确认，不需要运行时复现即可落地代码层修复。缺陷链路如下：

1. **设置 Port 建立层只建立和销毁**：`Main/src/components/Panel.tsx:425-445` 在设置视图打开时调用 `chrome.runtime.connect({ name: "bili-agent-chat" })` 建立设置专用 Port，关闭设置时执行 `port.disconnect()`。整个过程只建立了 Port 生命周期管理，未注册 `port.onDisconnect.addListener`，无法感知 SW 端主动断开或浏览器回收 SW 导致的 Port 断开。
2. **连接测试层只注册 onMessage**：`Main/src/components/model-settings/TestConnectionButton.tsx:132-148` 在 `connectionPromise` 内部只调用 `port.onMessage.addListener(onMessage)` 监听 `connection_result` 回复，未调用 `port.onDisconnect.addListener`。当 Port 在请求发送后、结果返回前断开时，`onMessage` 永远不会触发，只能等待 12 秒 `Promise.race` 超时兜底。
3. **聊天 Port 已具备完整断线检测**：`Main/src/content/port-connection.ts:99-104` 的 `connectChatPort` 同时注册了 `port.onMessage.addListener(messageListener)` 和 `port.onDisconnect.addListener(disconnectListener)`，并在 `fireDisconnect` 中清理 timers 并通知上层。两条 Port 链路的断线检测能力明显不一致。

需要澄清的边界（来自问题档案 N-3 第 37 行与网络连接错误问题记录第 90 行）：

- 缺少 `onDisconnect` 并不是所有断开场景都会等待 12 秒的直接原因。若断开发生在 `postMessage` 调用时，会同步抛错并被 `:164-172` 的 try/catch 捕获，立即显示"连接已断开"。
- 缺少心跳也不是该 12 秒等待的直接原因。聊天心跳的 60 秒 `PONG_TIMEOUT_MS` 阈值反而更长，心跳机制面向的是长连接存活检测，对设置页一次性请求收益有限。
- 真正的不一致在于：设置 Port 完全没有接入 `onDisconnect` 这条本可立即反馈断线的原生通道。当 Port 在请求已成功发送、随后断开且未收到 `connection_result` 时，前端只能等待 12 秒兜底超时。

## 触发边界

满足以下全部条件即触发"断线反馈延迟"：

1. 用户在设置页点击"测试连接"，`port.postMessage({ type: "test_connection", provider })` 成功发送（未同步抛错）。
2. 在 SW 返回 `connection_result` 之前，设置 Port 断开（SW 崩溃、被浏览器回收、或外部主动 disconnect）。
3. 由于未注册 `onDisconnect`，前端无法感知断开，`connectionPromise` 永远不 resolve。
4. 12 秒后 `timeoutPromise` 先 resolve，`Promise.race` 返回 `{ ok: false, error: "连接超时" }`，UI 显示"连接超时"。

不触发的情况：

- 断开发生在 `postMessage` 调用时：`postMessage` 同步抛错，被 `:164-172` try/catch 捕获，立即显示"连接已断开"。
- SW 正常返回 `connection_result`：`onMessage` listener 触发，`connectionPromise` resolve，正常更新状态。
- 设置 Port 未断开但 SW 处理超时：SW 端 10 秒 `AbortSignal.timeout` 触发后回传失败结果，前端在 10 秒内收到 `connection_result`。

## 修复目标

**为设置 Port 注册 `onDisconnect` 处理，使设置 Port 在请求发送后断开时能立即感知并反馈，不再只依赖 12 秒兜底超时。**

具体目标分解：

1. 在 `TestConnectionButton` 的 `connectionPromise` 内部，注册 `port.onDisconnect.addListener`，在 Port 断开时立即 resolve 失败结果并清理 listener/timer。
2. 在 `Panel.tsx` 的设置 Port 生命周期管理中，统一接入 `onDisconnect` 处理，避免销毁时遗留监听（设置 Port 关闭时主动 disconnect 不应触发误报）。
3. 区分 `onDisconnect` 即时反馈与心跳机制：设置请求是一次性的，心跳收益有限，不照搬聊天 Port 的 ping/pong 心跳，重点接入原生 `onDisconnect` 即可。
4. 保留 12 秒 `Promise.race` 兜底超时，作为 `onDisconnect` 未触发时的最后防线，避免双重超时语义冲突。
5. 统一 listener/timer 的 cleanup 路径，保证 `onDisconnect`、`onMessage`、超时 timer 三者任一触发后，其余两者被正确清理，不产生残留监听或定时器泄漏。

## 依赖关系

- **硬依赖**：无。N-3 的代码缺陷已由静态证据完全确认，不依赖运行时证据即可完成代码层修复和单元测试。
- **软依赖**：N-3 的 E2E 冒烟验证（验证 SW 终止后前端立即反馈）依赖阶段0 恢复 content script 挂载能力。在阶段0 完成前，N-3 可标记为 `needs_review`，代码层面修复不阻塞。
- **协调关系**：N-3 与 R-3 共用 `TestConnectionButton` 状态管理。两者共同涉及 `TestConnectionButton.tsx:115-189` 的 `handleClick`、`cleanup` 和 `connectionPromise`。**N-3 与 R-3 应联合审查但可分别验收**：N-3 专注 `onDisconnect` 即时反馈通道，R-3 专注请求代次/取消/Provider 变化保护。两者共同修改 cleanup 路径时需统一检查 listener、timer、onDisconnect listener 和取消标志，避免分别修改造成二次竞态。
- **关联问题**：N-2（聊天流缺少总超时）同属"超时/断线反馈不完整"问题族，但机制不同——N-2 是上游卡死超时，N-3 是通道断开反馈，两者独立修复。

## 精确修改范围

### 文件1：`Main/src/components/model-settings/TestConnectionButton.tsx`

**修改位置A**：`connectionPromise` 内部，第 132-148 行。

**当前代码**：

```ts
const connectionPromise = new Promise<ConnectionResult>((resolve) => {
    const onMessage = (msg: unknown) => {
        if (
            typeof msg === "object" &&
            msg !== null &&
            (msg as Record<string, unknown>).type === "connection_result"
        ) {
            const result = msg as {
                type: "connection_result";
            } & ConnectionResult;
            resolve({ ok: result.ok, error: result.error });
        }
    };
    listenerRef.current = onMessage;
    port.onMessage.addListener(onMessage);
});
```

**修改要点**：在 `connectionPromise` 内部，于注册 `onMessage` 的同时注册 `port.onDisconnect.addListener`。当 Port 断开时，立即 resolve 失败结果 `{ ok: false, error: "连接已断开" }`，并保证 `onMessage` listener 和超时 timer 在断开后被清理。需将 `onDisconnect` listener 引用保存到 ref（或与 `onMessage` listener 引用一并管理），以便 `cleanup` 函数能正确移除。

**修改位置B**：`cleanup` 函数，第 79-88 行。

**当前代码**：

```ts
const cleanup = useCallback(() => {
    if (listenerRef.current !== null) {
        port.onMessage.removeListener(listenerRef.current);
        listenerRef.current = null;
    }
    if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }
}, [port]);
```

**修改要点**：在 `cleanup` 中增加移除 `onDisconnect` listener 的逻辑。新增一个 ref（如 `disconnectListenerRef`）保存当前 `onDisconnect` listener 引用，`cleanup` 时一并移除并置空。保证 `onDisconnect`、`onMessage`、超时 timer 三者任一触发后调用 `cleanup`，其余两者被正确清理。

**修改位置C**：`handleClick` 的状态更新分支，第 175-188 行。

**当前代码**：`Promise.race` 返回后根据 `result.ok` 更新 `setStatus`/`setErrorMessage`/`setIsTimeout`，最后调用 `cleanup`。

**修改要点**：`onDisconnect` 触发的 resolve 会返回 `{ ok: false, error: "连接已断开" }`，该结果会走 `else` 分支显示"连接失败：连接已断开"。需确认 `isTimeout` 的判定逻辑：`onDisconnect` 触发的失败不应被标记为超时（`result.error === "连接超时"` 才标记超时），`"连接已断开"` 自然不匹配，行为正确。此分支无需改动，但需在注释中说明 `onDisconnect` 与超时的区分逻辑。

### 文件2：`Main/src/components/Panel.tsx`

**修改位置**：设置 Port 的建立 effect，第 425-445 行。

**当前代码**：

```ts
useEffect(() => {
    if (!isSettingsOpen) return;
    let port: chrome.runtime.Port | null = null;
    try {
        port = chrome.runtime.connect({ name: "bili-agent-chat" });
        setSettingsPort(port);
    } catch {
        setSettingsPort(null);
    }
    return () => {
        if (port) {
            try {
                port.disconnect();
            } catch {
                // port 已断开，忽略
            }
        }
        setSettingsPort(null);
    };
}, [isSettingsOpen]);
```

**修改要点**：在 `Panel.tsx` 的设置 Port 生命周期管理中，评估是否需要在此层注册 `onDisconnect`。考虑到 `TestConnectionButton` 已在自身注册 `onDisconnect` 处理连接测试期间的断开，`Panel.tsx` 层的 `onDisconnect` 主要用于设置 Port 在非测试期间断开时的状态同步（如 `settingsPort` 变为无效）。

**设计决策**：`Panel.tsx` 层注册 `onDisconnect` 时需区分"主动 disconnect"与"被动断开"。当前 cleanup 中主动调用 `port.disconnect()` 会触发 `onDisconnect`，需避免主动断开时误报错误。可采用在主动 disconnect 前设置标志位的方式，`onDisconnect` 回调中检查标志位决定是否更新状态。若评估后认为 `Panel.tsx` 层的 `onDisconnect` 收益有限（设置 Port 仅在设置页打开期间存活，断开后用户重新打开设置页会重建 Port），可仅在 `TestConnectionButton` 层注册 `onDisconnect`，`Panel.tsx` 层保持现状但补充注释说明设计取舍。

### 不在修改范围内的内容

- 不照搬聊天 Port 的 ping/pong 心跳机制：设置请求是一次性的，心跳收益有限，且聊天心跳的 60 秒阈值反而更长，不适用于设置页的 12 秒超时场景。问题档案 N-3 第 59 行已明确"不必照搬聊天 Port 的 ping/pong 心跳"。
- 不修改 SW 端的 `setupPortListener` 或 `handleTestConnection`：SW 端已正确路由 `test_connection` 消息并有失败回传路径，断线检测缺陷在前端侧。
- 不修改 `FRONTEND_TIMEOUT_MS`（12 秒）：保留作为 `onDisconnect` 未触发时的兜底，避免双重超时语义冲突。
- 不修改 `connectChatPort`：聊天 Port 的断线检测已完整，不在本次修复范围。

## 设计取舍：onDisconnect 即时反馈 vs 心跳机制

### 为何接入 onDisconnect

`onDisconnect` 是 Chrome MV3 Port 的原生断线反馈通道。当 SW 崩溃、被浏览器回收或外部主动 disconnect 时，`port.onDisconnect` 会被触发。接入此通道可使前端在 Port 断开时立即感知，无需等待 12 秒兜底超时。这是与聊天 Port 对齐的最小修复，收益明确、实现成本低。

### 为何不接入心跳

聊天 Port 的心跳机制（`PING_INTERVAL_MS = 25_000` ping 间隔 + `PONG_TIMEOUT_MS = 60_000` pong 超时）面向的是长连接存活检测，适用于对话期间持续流式传输的场景。设置页的连接测试是一次性请求-响应模型：

1. **请求一次性**：用户点击"测试连接"后只需等待一个 `connection_result` 回复，无需维持长连接存活。
2. **超时阈值不匹配**：聊天心跳的 60 秒 pong 超时远大于设置页的 12 秒兜底超时。若用心跳的 60 秒阈值，反而会延长断线反馈；若缩短心跳阈值，又需 SW 端配合处理 ping/pong，增加复杂度。
3. **收益有限**：`onDisconnect` 已覆盖 SW 崩溃/回收场景，心跳的增量收益不足以抵消其实现成本和 SW 端改动。

因此，本方案只接入 `onDisconnect`，不引入心跳。

### 12 秒兜底超时的保留

保留 `FRONTEND_TIMEOUT_MS = 12_000` 的 `Promise.race` 兜底超时，作为 `onDisconnect` 未触发时的最后防线。`onDisconnect` 和 12 秒超时的语义不冲突：

- `onDisconnect`：Port 断开时立即反馈"连接已断开"。
- 12 秒超时：Port 未断开但 SW 长时间未回复时反馈"连接超时"。

两者覆盖不同的失败模式，`Promise.race` 中哪个先到用哪个，互不干扰。

## listener/timer cleanup 规划

当前 `cleanup` 函数只清理 `onMessage` listener 和超时 timer。N-3 新增 `onDisconnect` listener 后，cleanup 路径需统一管理三类资源：

| 资源 | 保存位置 | 触发清理的时机 |
| --- | --- | --- |
| `onMessage` listener | `listenerRef.current` | `onMessage` resolve / `onDisconnect` / 超时 / 卸载 / Provider 变化 |
| `onDisconnect` listener | 新增 `disconnectListenerRef.current`（或与 `listenerRef` 合并管理） | `onMessage` resolve / `onDisconnect` / 超时 / 卸载 / Provider 变化 |
| 超时 timer | `timerRef.current` | `onMessage` resolve / `onDisconnect` / 卸载 / Provider 变化 |

**cleanup 原则**：

1. 任一资源触发后，立即调用 `cleanup` 移除其余两个资源，避免残留监听或定时器。
2. `cleanup` 需幂等：多次调用不抛错，已置空的 ref 跳过移除。
3. `onDisconnect` listener 内部 resolve 后，需确保不会重复 resolve（`Promise` 只 resolve 一次，但 listener 仍需移除避免泄漏）。
4. 与 R-3 协同：R-3 在 cleanup 中增加取消标志（代次标记），N-3 在 cleanup 中增加 `onDisconnect` listener 移除。两者共同修改 `cleanup` 函数时，需保证 cleanup 的执行顺序和幂等性不受影响。

## 分步执行

### 步骤1：新增 onDisconnect listener ref

- 在 `TestConnectionButton` 中新增 `disconnectListenerRef`，用于保存当前 `onDisconnect` listener 引用。
- 类型与 `listenerRef` 一致：`useRef<(() => void) | null>(null)`。
- 添加中文注释说明该 ref 用于在 cleanup 时移除 `onDisconnect` listener。

### 步骤2：connectionPromise 内注册 onDisconnect

- 在 `connectionPromise` 的 executor 中，于 `port.onMessage.addListener(onMessage)` 之后，注册 `port.onDisconnect.addListener(onDisconnect)`。
- `onDisconnect` 回调内：立即 `resolve({ ok: false, error: "连接已断开" })`。
- 将 `onDisconnect` 回调赋值给 `disconnectListenerRef.current`。
- 添加中文注释说明 `onDisconnect` 用于 Port 断开时的即时反馈，与 `onMessage` 和超时 timer 共同构成三路竞速。

### 步骤3：扩展 cleanup 函数

- 在 `cleanup` 中增加移除 `onDisconnect` listener 的逻辑：检查 `disconnectListenerRef.current !== null`，调用 `port.onDisconnect.removeListener`，置空 ref。
- 保持 cleanup 的幂等性：已置空的 ref 跳过。
- 添加中文注释说明 cleanup 现在管理三类资源（onMessage listener、onDisconnect listener、超时 timer）。

### 步骤4：确认状态更新分支无需改动

- 检查 `handleClick` 的 `:175-188` 状态更新分支。
- 确认 `onDisconnect` 触发的 `{ ok: false, error: "连接已断开" }` 走 `else` 分支，显示"连接失败：连接已断开"。
- 确认 `isTimeout` 判定 `result.error === "连接超时"` 不匹配"连接已断开"，`isTimeout` 为 `false`，行为正确。
- 添加注释说明 `onDisconnect` 与超时的区分逻辑。

### 步骤5：评估 Panel.tsx 层是否需要 onDisconnect

- 评估 `Panel.tsx:425-445` 设置 Port 建立层是否需要注册 `onDisconnect`。
- 若注册，需区分"主动 disconnect"与"被动断开"，避免主动断开时误报。
- 若不注册，补充注释说明设计取舍：设置 Port 仅在设置页打开期间存活，断开后用户重新打开设置页会重建 Port，`Panel.tsx` 层的 `onDisconnect` 收益有限。

### 步骤6：编写单元测试

- 为 `onDisconnect` 即时反馈路径编写单元测试，覆盖 Port 断开后立即显示"连接已断开"。
- 为 cleanup 移除 `onDisconnect` listener 编写单元测试，覆盖卸载/Provider 变化后不残留监听。
- 为三路竞速（onMessage / onDisconnect / 超时）编写单元测试，覆盖任一先到时其余两者被清理。

### 步骤7：E2E 冒烟验证（依赖阶段0）

- 在阶段0 恢复 E2E 挂载能力后，补充断线即时反馈验证。
- 在设置页点击"测试连接"发起测试，在等待响应期间通过 DevTools 手动终止 SW，验证前端立即显示"连接已断开"而非等待 12 秒超时。

## 测试建议

### 单元测试

覆盖 `TestConnectionButton` 的 `onDisconnect` 路径：

| 测试场景 | 操作 | 预期行为 |
| --- | --- | --- |
| Port 断开后即时反馈 | 点击测试连接，触发 `port.onDisconnect` | 状态变为 `fail`，显示"连接失败：连接已断开"，`isTimeout` 为 `false` |
| onDisconnect 触发后清理 onMessage | 触发 `onDisconnect` 后检查 `port.onMessage.removeListener` | `onMessage` listener 被移除 |
| onDisconnect 触发后清理 timer | 触发 `onDisconnect` 后推进假定时器 | 不再触发超时 resolve（timer 已清理） |
| onMessage 先到时清理 onDisconnect | 触发 `connection_result` 后检查 `port.onDisconnect.removeListener` | `onDisconnect` listener 被移除 |
| 超时先到时清理 onDisconnect | 推进假定时器至 12 秒后检查 `port.onDisconnect.removeListener` | `onDisconnect` listener 被移除 |
| 卸载后清理 onDisconnect | 组件卸载后检查 `port.onDisconnect.removeListener` | `onDisconnect` listener 被移除 |
| Provider 变化后清理 onDisconnect | Provider 变化触发 cleanup 后检查 `port.onDisconnect.removeListener` | `onDisconnect` listener 被移除 |
| 三路竞速幂等 | 连续触发 onDisconnect + onMessage + 超时 | 仅第一次 resolve 生效，不抛错，不重复状态更新 |

### E2E 测试（依赖阶段0）

在阶段0 恢复 content script 挂载后执行：

1. 打开设置页，点击"测试连接"发起测试。
2. 在等待响应期间，通过 DevTools 手动终止 service worker。
3. 验证前端在 Port 断开后立即显示"连接失败：连接已断开"（而非等待 12 秒后显示"连接超时"）。
4. 验证控制台无 listener 泄漏告警。

## 验收标准

1. **onDisconnect 即时反馈生效**：设置 Port 在连接测试期间断开时，前端立即显示"连接失败：连接已断开"，不再等待 12 秒兜底超时。
2. **onMessage 正常路径不受影响**：SW 正常返回 `connection_result` 时，状态更新行为与修复前一致。
3. **超时兜底保留**：Port 未断开但 SW 长时间未回复时，12 秒后仍显示"连接超时"，`onDisconnect` 与超时语义不冲突。
4. **isTimeout 区分正确**：`onDisconnect` 触发的失败 `isTimeout` 为 `false`，显示"连接失败：连接已断开"；超时触发的失败 `isTimeout` 为 `true`，显示"连接超时"。
5. **三路竞速 cleanup 幂等**：`onMessage`/`onDisconnect`/超时 timer 任一先触发后，其余两者被正确清理，不产生残留监听或定时器泄漏，多次调用 `cleanup` 不抛错。
6. **卸载/Provider 变化清理**：组件卸载或 Provider 变化时，`onDisconnect` listener 被正确移除，不残留监听。
7. **不引入心跳**：修复不照搬聊天 Port 的 ping/pong 心跳机制，设置请求保持一次性请求-响应模型。
8. **单元测试覆盖**：`onDisconnect` 即时反馈、三路竞速 cleanup、卸载/Provider 变化清理路径均有单元测试覆盖。
9. **与 R-3 协同**：N-3 与 R-3 共用的 `cleanup` 函数和 `connectionPromise` 经联合审查，listener/timer/onDisconnect listener/取消标志统一管理，无二次竞态。

## 运行时验证

以下假设需在阶段0 恢复 E2E 挂载能力后采集运行时证据：

- **N-V4 假设**：用户点击"测试连接"时设置 Port 是否已断开。需在阶段0 完成后采集 service worker 控制台的 `onDisconnect` 事件时间证据，确认断开与用户观察到"连接超时"之间的实际间隔。
- **假设1**（来自问题档案 N-3）：用户在设置页偶发"连接超时"实际由 SW 终止后未触发 `onDisconnect` 引起，最终由 12 秒 `Promise.race` 兜底反馈。需运行时日志确认 SW 终止与反馈之间的实际间隔，验证修复后是否改为即时反馈。
- **假设2**（来自问题档案 N-3）：部分场景下 `port.onMessage` 在断开时会收到一个错误事件。需核实 `onMessage` 回调的参数形态，确认是否需要在 `onMessage` 内额外处理断开错误事件。

运行时验证不阻塞代码层修复。在运行时证据采集前，N-3 标记为 `needs_review`。

## 风险与回滚

### 风险

1. **onDisconnect 误触发**：`Panel.tsx` 主动调用 `port.disconnect()` 关闭设置 Port 时会触发 `onDisconnect`。若 `TestConnectionButton` 仍在等待 `connectionPromise`，可能误显示"连接已断开"。缓解：`Panel.tsx` 关闭设置 Port 时 `TestConnectionButton` 随之卸载，卸载触发的 cleanup 会先移除 `onDisconnect` listener。但需确认卸载与 disconnect 的时序，避免 cleanup 未执行前 `onDisconnect` 先触发。若存在时序问题，可在 `onDisconnect` 回调中检查组件是否仍在 testing 状态。
2. **onDisconnect 与 onMessage 竞速**：Port 断开时，`onDisconnect` 和最后一条 `onMessage` 可能同时触发。`Promise` 只 resolve 一次，先到者生效，但两个 listener 都需移除。缓解：`cleanup` 幂等设计保证两者都被移除。
3. **onDisconnect listener 泄漏**：若 `cleanup` 未正确移除 `onDisconnect` listener，Port 断开后 listener 残留在已断开的 Port 上。Chrome MV3 的 Port 断开后 listener 不会持续占用内存（Port 对象本身会被 GC），但仍是代码规范问题。缓解：单元测试覆盖卸载/Provider 变化后的 `removeListener` 调用。
4. **与 R-3 共用 cleanup 的冲突**：N-3 在 cleanup 中增加 `onDisconnect` listener 移除，R-3 在 cleanup 中增加取消标志。两者共同修改 cleanup 时需保证执行顺序和幂等性。缓解：N-3 与 R-3 联合审查，统一 cleanup 的资源管理顺序。
5. **React 18 严格模式双调用**：`useEffect` 的 cleanup 在严格模式下会被双调用，`onDisconnect` listener 的注册和移除需保证幂等。缓解：`cleanup` 幂等设计，ref 置空后跳过移除。

### 回滚方案

如果修复引入回归问题，回滚步骤：

1. **回滚 `TestConnectionButton.tsx`**：移除 `connectionPromise` 内的 `port.onDisconnect.addListener` 注册，移除 `disconnectListenerRef`，将 `cleanup` 恢复为只清理 `onMessage` listener 和超时 timer。
2. **回滚 `Panel.tsx`**（若步骤5 选择了注册 `onDisconnect`）：移除设置 Port 建立层的 `onDisconnect` 注册，恢复为原始的只建立和销毁逻辑。
3. **回滚测试**：移除因 `onDisconnect` 新增的单元测试。

回滚后，设置 Port 断线检测恢复到修复前的状态（Port 断开时仍需等待 12 秒兜底超时），但不会引入新的功能问题。回滚是纯代码还原操作，不涉及数据迁移。

## 完成状态

- **状态**: needs_review
- **状态变更条件**:
  - 代码实现完成并自检通过 -> `in_progress`
  - 单元测试覆盖 `onDisconnect` 即时反馈、三路竞速 cleanup、卸载/Provider 变化清理 -> `needs_review`（已达成）
  - 与 R-3 联合审查通过且 E2E 冒烟验证通过（依赖阶段0）-> `completed`
- **状态变更记录**: 2026-08-03：`TestConnectionButton` 接入 `onDisconnect` 和请求级 cleanup，18 个组件测试通过；E2E 断线时间证据待阶段0通道。

## 联合审查说明

N-3 与 R-3 共用 `TestConnectionButton` 的 `handleClick`、`cleanup` 和 `connectionPromise`，应联合审查：

- **N-3 专注**：`onDisconnect` 即时反馈通道的接入和 listener/timer cleanup 扩展。
- **R-3 专注**：请求代次标记/取消标志的引入和过期结果保护。
- **共用点**：`cleanup` 函数同时管理 N-3 的 `onDisconnect` listener 和 R-3 的取消标志，两者的资源移除顺序和幂等性需统一检查。
- **分别验收**：N-3 的验收标准聚焦 `onDisconnect` 即时反馈和三路竞速 cleanup；R-3 的验收标准聚焦请求代次和过期结果保护。两者可分别验收，但联合审查确保 cleanup 无二次竞态。

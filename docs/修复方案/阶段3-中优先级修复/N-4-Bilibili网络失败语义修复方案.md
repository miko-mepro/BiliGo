# N-4 Bilibili 网络失败语义 - 修复方案

## 问题标识

- **问题编号**: N-4
- **严重程度**: MEDIUM
- **问题类型**: 错误语义 / UI 呈现
- **所属阶段**: 阶段3 - 中优先级修复
- **修复状态**: needs_review
- **问题档案**: `docs/问题档案/01-网络与超时控制/N-4-Bilibili工具网络失败语义不一致.md`
- **调查依据**: `docs/网络连接错误问题记录.md`
- **发现日期**: 2026-08-01
- **关联问题**: N-1(连接测试错误分类粗粒度,N-4 的硬依赖)

## 关键事实校准:BilibiliNetworkError 的真实结构

在进入方案前必须先确认 `BilibiliNetworkError` 的实际结构,因为它决定 N-4 能否接入 N-1 的错误分类:

已通过静态代码验证(`Main/src/lib/bilibili-client/search.ts:38-46`):

```ts
export class BilibiliNetworkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "BilibiliNetworkError";
    this.cause = cause;
  }
}
```

- `BilibiliNetworkError` 继承 `Error`,`name` 为 `"BilibiliNetworkError"`。
- 构造函数接收 `message: string` 和可选的 `cause?: unknown`。
- `cause` 可能携带底层网络错误对象(例如 fetch 失败的 `TypeError`,其 `cause` 可能含 Node `code`)。

**抛出点**(`search.ts:94-112`):

```ts
async function fetchSearch(url: URL, sessdata: string | undefined): Promise<Response> {
  try {
    const response = await wbiFetch(url, { ... });
    if (!response.ok) {
      throw new BilibiliNetworkError(`Bilibili search request failed: HTTP ${response.status}`);
    }
    return response;
  } catch (error) {
    if (error instanceof BilibiliNetworkError) {
      throw error;
    }
    throw new BilibiliNetworkError(`Bilibili search request failed: ${stringifyError(error)}`, error);
  }
}
```

两种抛出路径:

1. **HTTP 非 2xx**:抛 `BilibiliNetworkError(message)`,**无 cause**。message 格式为 `"Bilibili search request failed: HTTP {status}"`。
2. **底层网络异常**(fetch 抛 TypeError 等):抛 `BilibiliNetworkError(message, error)`,**cause 携带原始错误对象**。message 格式为 `"Bilibili search request failed: {stringifyError(error)}"`。

**其他抛出点**:`BilibiliNetworkError` 也在 `tags.ts:44` 和 `hot.ts:37` 抛出,结构一致。本方案以 `search.ts` 为主要路径,但分类逻辑需覆盖所有 `BilibiliNetworkError` 抛出点。

## 关键事实校准:tool-error 路径的真实行为

已通过静态代码验证(`Main/src/background/stream.ts:368-380`):

```ts
case 'tool-error': {
  const errorText = String(part.error)
  const code = inferErrorCode(errorText)
  const toolContextMessage = `工具 ${part.toolName} 执行失败: ${errorText}`
  postToPort(port, session, {
    type: 'error',
    message: toolContextMessage,
    code,
  })
  break streamLoop
}
```

- `part.error` 被 `String()` 拍平为文本(第 369 行)。**注意:`part.error` 的实际类型取决于 AI SDK 的 tool-error part 定义,可能是 Error 对象或字符串。** 若是 Error 对象,`String(error)` 只返回 `error.message`(对于 Error 子类是 `error.toString()` 即 `name: message`),`error.code`、`error.cause` 等结构化字段丢失。
- `inferErrorCode(errorText)` 基于文本分类(当前 N-1 的分类逻辑)。
- message 使用 `toolContextMessage`(带工具名前缀),不使用 `friendlyMessage`(第 374 行注释说明:friendlyMessage 对已知 code 返回固定文案会丢弃工具名上下文)。
- **`break streamLoop`**(第 380 行):tool-error 后终止当前流,后续推送 `done`。

因此,Bilibili 网络失败在当前链路中:
1. `BilibiliNetworkError` 被 `executeBilibiliSearch`(`bilibili-search.ts:90-127`)原样抛出(不转换)。
2. AI SDK 捕获该异常,转为 `tool-error` part。
3. `stream.ts:368-380` 把 `part.error` 拍平为文本,走 `inferErrorCode` 分类,但 message 用 `toolContextMessage`(显示"工具 bilibili_search 执行失败: ...")。
4. 流终止,用户只收到工具失败提示。

**关键约束**:`part.error` 进入 `stream.ts` 时,可能已是 `String` 化的文本(AI SDK 转换),也可能是原始 Error 对象。N-4 的分类逻辑必须能处理这两种情况。这需运行时确认(见"运行时验证")。

## 静态确认的链路

以下链路已通过静态代码审查确认:

1. **抛出源头**:`Main/src/lib/bilibili-client/search.ts:94-112` 的 `fetchSearch` 在 HTTP 非 2xx 或底层网络异常时抛 `BilibiliNetworkError`。`tags.ts:44` 和 `hot.ts:37` 也有相同抛出。
2. **工具执行体透传**:`Main/src/tools/bilibili-search.ts:90-127` 的 `executeBilibiliSearch` 调用 `searchVideo`(第 105 行),`searchVideo` 内部调用 `fetchSearch`。`executeBilibiliSearch` 没有 try-catch 包裹 `searchVideo`,异常原样抛出给 AI SDK。
3. **AI SDK 转为 tool-error**:`stream.ts:368-380` 的 `tool-error` case 处理工具执行失败,把 `part.error` 拍平为文本,分类,推送 error 消息,终止流。
4. **不经过连接测试路径**:Bilibili 工具网络失败不走 `handleTestConnection`,不经过连接测试的 `inferErrorCode` + `friendlyMessage` 路径。两者的错误语义完全割裂。

## 根因分析

N-4 的根因与 N-1 不同,但共享同一错误归类出口:

- **N-1 的根因**:`inferErrorCode` 分类粒度不足,把多种根因合并为 `NETWORK_ERROR`。
- **N-4 的根因**:`BilibiliNetworkError` 根本没有接入 `inferErrorCode` 的结构化分类路径。它在 `stream.ts:369` 被 `String()` 拍平为文本后,才走 `inferErrorCode`,但此时 `cause` 链已丢失,只能基于文本("Bilibili search request failed: HTTP 500" 或 "Bilibili search request failed: fetch failed")匹配。
- **共同根因**:网络层错误分类没有统一的语义层,不同调用路径(连接测试 vs 工具调用)各自处理网络异常,导致用户无法从文案推断实际根因。

因此,N-4 必须依赖 N-1 先建立统一错误分类基础设施(包括入口签名扩展、cause 链检查、分类层级),再将 `BilibiliNetworkError` 接入该分类。

## 网络错误与业务工具错误的区分

N-4 的核心设计挑战是区分两类本质不同的工具错误:

| 错误类型 | 来源 | 当前行为 | 期望行为 |
| --- | --- | --- | --- |
| **网络错误** | `BilibiliNetworkError`(底层 fetch 失败、DNS、TLS、连接拒绝) | 显示"工具 bilibili_search 执行失败: ..."并终止流 | 显示网络错误文案(如"网络连接失败"或 N-1 细化的 DNS/TLS/超时文案),提示用户检查网络或 B站可达性 |
| **业务工具错误** | `BilibiliApiError`(B站业务码错误,如 -352 风控)、`BilibiliRiskError`、工具参数校验失败 | 同上,显示"工具执行失败" | 显示业务工具错误文案(如"触发风控"、"B站接口异常"),提示用户检查业务上下文 |
| **其他工具错误** | AI SDK 内部错误、工具执行体逻辑错误 | 同上 | 维持"工具执行失败"文案,不归类为网络错误 |

**区分依据**:

1. **`BilibiliNetworkError`**:通过 `error instanceof BilibiliNetworkError` 或 `error.name === 'BilibiliNetworkError'` 识别。识别后,提取其 `cause` 字段(若有)走 N-1 的网络错误分类;若无 cause(HTTP 非 2xx),按 HTTP 状态码分类。
2. **`BilibiliApiError`**:通过 `error instanceof BilibiliApiError` 或 `error.name === 'BilibiliApiError'` 识别。该类有 `code?: number` 字段(B站业务码),映射到 `bilibili_api` 或 `bilibili_risk` 分类(当前 `friendlyMessage` 已支持这两个 code)。
3. **`BilibiliRiskError`**:通过 `error.name === 'BilibiliRiskError'` 识别,`code` 固定为 -352,映射到 `bilibili_risk`。
4. **其他 Error**:不识别为 Bilibili 网络错误或业务错误,维持当前 `toolContextMessage` 文案。

**不能假定所有 `tool-error` 都是网络错误**。工具执行体可能抛出参数校验错误(如 `bilibili-search.ts:97` 的 `'bilibili_search requires a keyword argument'`)、逻辑错误或 AI SDK 内部错误。这些错误应维持"工具执行失败"语义,不应归类为网络错误。

## 修复目标

**使 Bilibili 工具网络失败接入 N-1 定义的统一错误分类,与 Provider 连接测试的语义一致;同时区分网络错误与业务工具错误,使用户能从文案判断是网络问题、业务问题还是工具逻辑问题。**

具体目标分解:

1. **接入 N-1 统一分类**:`BilibiliNetworkError` 的 `cause` 链经过 N-1 的 `inferErrorCode` 结构化分类,映射到 `DNS_ERROR`、`CONNECTION_REFUSED`、`TLS_ERROR`、`TIMEOUT_ERROR` 等网络错误分类。
2. **区分网络与业务错误**:`BilibiliNetworkError` 归类为网络错误,`BilibiliApiError`/`BilibiliRiskError` 归类为业务工具错误,其他 Error 维持"工具执行失败"语义。
3. **差异化文案**:网络错误显示网络类文案(与连接测试一致),业务错误显示业务文案(如"触发风控"、"B站接口异常"),其他工具错误维持"工具执行失败"。
4. **流终止行为评估**:评估是否在 tool-error 后允许模型继续生成解释,而非直接终止流。该决策需运行时确认当前终止时机对用户体验的影响。
5. **不把猜测写成事实**:当前代码不能证明模型在 tool-error 后会继续生成解释,也不能证明用户一定把"工具执行失败"理解为"没有搜索结果"。本方案不把这些假设写成已确认事实。

## 依赖关系

- **硬依赖**:N-1。N-4 必须等待 N-1 完成统一错误分类基础设施(入口签名扩展、cause 链检查、分类层级、文案映射)后才能接入。若 N-1 未完成,N-4 缺少分类基础设施,无法将 `BilibiliNetworkError` 映射到细化的网络错误分类。
- **N-1 完成标志**:N-1 的 `inferErrorCode` 已支持 `unknown` 入参(可访问 `cause` 链),`friendlyMessage` 已包含 `DNS_ERROR`、`CONNECTION_REFUSED`、`TLS_ERROR`、`TIMEOUT_ERROR` 等新增分类的文案。
- **无其他硬依赖**:N-4 的设计不依赖运行时证据,可在 N-1 完成后基于静态确认推进实施。但 `part.error` 的实际类型(是 Error 对象还是字符串)需运行时确认(见"运行时验证")。

## 精确修改范围

### 文件1:`Main/src/background/stream.ts`

**修改位置**:`tool-error` case(第 368-380 行)。

**当前代码**:

```ts
case 'tool-error': {
  const errorText = String(part.error)
  const code = inferErrorCode(errorText)
  const toolContextMessage = `工具 ${part.toolName} 执行失败: ${errorText}`
  postToPort(port, session, {
    type: 'error',
    message: toolContextMessage,
    code,
  })
  break streamLoop
}
```

**修改要点**:

1. **判断 `part.error` 是否为 `BilibiliNetworkError`**:若 `part.error` 是 Error 对象且 `name === 'BilibiliNetworkError'`(或 `instanceof BilibiliNetworkError`,需 import),走网络错误分类路径。
2. **网络错误分类**:调用 N-1 的 `inferErrorCode(part.error)`(传入原始错误对象,使分类逻辑能访问 `cause` 链),得到 `DNS_ERROR`/`CONNECTION_REFUSED`/`TLS_ERROR`/`TIMEOUT_ERROR` 等 code。
3. **业务错误分类**:若 `part.error` 是 `BilibiliApiError` 或 `BilibiliRiskError`,映射到 `bilibili_api`/`bilibili_risk`。
4. **文案选择**:网络错误使用 `friendlyMessage(code, ...)`(与连接测试一致);业务错误使用 `friendlyMessage(code, ...)`;其他工具错误维持 `toolContextMessage`。
5. **流终止行为**:当前 `break streamLoop` 在 tool-error 后终止流。是否保留该行为需评估(见"流终止行为评估")。

**修改后的逻辑示意(非最终实现代码)**:

```ts
case 'tool-error': {
  const error = part.error
  // 判断是否为 Bilibili 网络错误(需运行时确认 part.error 是否为 Error 对象)
  if (isBilibiliNetworkError(error)) {
    // 走 N-1 的网络错误分类,访问 cause 链
    const code = inferErrorCode(error) // N-1 扩展后的入口
    const friendlyMsg = friendlyMessage(code, getErrorMessage(error))
    postToPort(port, session, {
      type: 'error',
      message: friendlyMsg, // 网络文案,与连接测试一致
      code,
    })
  } else if (isBilibiliBusinessError(error)) {
    // 业务错误:bilibili_api / bilibili_risk
    const code = error.name === 'BilibiliRiskError' ? 'bilibili_risk' : 'bilibili_api'
    const friendlyMsg = friendlyMessage(code, getErrorMessage(error))
    postToPort(port, session, {
      type: 'error',
      message: friendlyMsg,
      code,
    })
  } else {
    // 其他工具错误:维持 toolContextMessage
    const errorText = String(error)
    const code = inferErrorCode(errorText)
    const toolContextMessage = `工具 ${part.toolName} 执行失败: ${errorText}`
    postToPort(port, session, {
      type: 'error',
      message: toolContextMessage,
      code,
    })
  }
  break streamLoop
}
```

### 文件2:`Main/src/tools/bilibili-search.ts`

**修改位置**:`executeBilibiliSearch` 函数(第 90-127 行)。

**当前代码**:无 try-catch,`searchVideo` 异常原样抛出。

**修改要点**:评估是否在 `executeBilibiliSearch` 中包裹 try-catch,将 `BilibiliNetworkError` 转换为更明确的错误类型,或在抛出前补充上下文。**但该修改需谨慎**:若 `executeBilibiliSearch` 转换错误类型,可能影响 `stream.ts` 的 `instanceof` 判断。建议优先在 `stream.ts` 侧识别 `BilibiliNetworkError`,`bilibili-search.ts` 保持透传,避免双重转换。

**不在修改范围**(若选择 `stream.ts` 侧识别):`bilibili-search.ts` 不修改,异常原样抛出给 AI SDK。

### 不在修改范围内的内容

- 不修改 `BilibiliNetworkError` 类定义:该类的 `cause` 字段已存在,N-4 复用即可,无需扩展类结构。
- 不修改 `fetchSearch` 的抛出逻辑:抛出行为正确,问题在消费端(`stream.ts`)未识别。
- 不修改 `wbiFetch`:底层 fetch 逻辑不在 N-4 范围内。
- 不修改 `inferErrorCode` 和 `friendlyMessage`:这两个函数由 N-1 修复,N-4 只调用,不修改。
- 不修改 `handleTestConnection`:连接测试路径不在 N-4 范围内。

## 流终止行为评估

当前 `tool-error` 后 `break streamLoop` 终止流,用户只收到工具失败提示,没有模型后续解释。N-4 需评估是否改为允许模型继续生成:

**保留终止流(当前行为)**:
- 优点:实现简单,错误反馈明确。
- 缺点:用户只收到"工具执行失败"或网络错误文案,没有模型对失败原因的解释。
- 适用:网络错误场景,用户需手动重试,模型继续生成意义不大。

**允许模型继续生成**:
- 优点:模型可基于 tool-error 信号生成解释(如"B站搜索失败,可能是网络问题,建议...")。
- 缺点:实现复杂,需评估 AI SDK 是否支持 tool-error 后继续流;模型可能生成不准确解释。
- 适用:业务错误场景(如风控),模型可建议用户登录 B站。

**建议**:本方案不预设该决策,列为运行时验证项。需运行时确认:

1. AI SDK 在 tool-error 后是否支持继续流(需查阅 AI SDK 文档或运行时测试)。
2. 当前终止流的实际用户体验(用户是否只收到工具失败提示,还是有其他反馈)。
3. 模型在 tool-error 后继续生成是否能提供有价值的解释。

在运行时确认前,本方案保留 `break streamLoop` 行为,不改为继续流。

## 精确修改范围:part.error 类型的运行时确认

`stream.ts:369` 的 `String(part.error)` 假设 `part.error` 可能不是 Error 对象。N-4 的分类逻辑需确认 `part.error` 的实际类型:

- **若 `part.error` 是 Error 对象**:`instanceof BilibiliNetworkError` 判断有效,可访问 `cause` 链。
- **若 `part.error` 是字符串**:`instanceof` 判断无效,只能基于文本匹配。此时 N-4 的网络错误分类退化到文本匹配(与 N-1 的文本回退一致)。
- **若 `part.error` 是 AI SDK 包装的错误对象**:可能 `instanceof BilibiliNetworkError` 失败(AI SDK 可能重新包装),需通过 `error.name === 'BilibiliNetworkError'` 或 message 特征匹配。

**该确认必须运行时进行**,因为 AI SDK 的 tool-error part 定义和实际传递的 error 对象结构需在浏览器中验证。在确认前,N-4 的分类逻辑需同时支持 Error 对象和字符串两种情况(双重判断:`instanceof` + `name` 匹配 + 文本回退)。

## 分步执行

### 步骤1:确认 N-1 已完成

- 确认 N-1 的 `inferErrorCode` 已支持 `unknown` 入参(可访问 `cause` 链)。
- 确认 `friendlyMessage` 已包含 `DNS_ERROR`、`CONNECTION_REFUSED`、`TLS_ERROR`、`TIMEOUT_ERROR` 等分类的文案。
- N-1 未完成时,N-4 不进入实施。

### 步骤2:运行时确认 part.error 类型(依赖阶段0)

- 在阶段0 恢复 E2E 后,触发一次 Bilibili 工具网络失败,在 service worker 控制台记录 `part.error` 的实际类型和结构。
- 确认 `part.error` 是 Error 对象、字符串还是 AI SDK 包装的错误对象。
- 该确认决定 N-4 的分类逻辑是否可用 `instanceof` 判断。

### 步骤3:实现 tool-error 分类逻辑

- 修改 `stream.ts:368-380` 的 `tool-error` case,按"网络错误与业务工具错误的区分"实现分类。
- 网络错误(`BilibiliNetworkError`)走 N-1 的 `inferErrorCode(error)`,文案用 `friendlyMessage(code, ...)`。
- 业务错误(`BilibiliApiError`/`BilibiliRiskError`)映射到 `bilibili_api`/`bilibili_risk`。
- 其他工具错误维持 `toolContextMessage`。
- 添加注释说明分类依据和 part.error 类型的运行时确认状态。

### 步骤4:评估流终止行为

- 评估是否保留 `break streamLoop` 或允许模型继续生成。
- 该评估依赖运行时确认(见"流终止行为评估"),在确认前保留终止流。

### 步骤5:编写单元测试

- 为 `BilibiliNetworkError` 走网络分类编写单元测试。
- 为 `BilibiliApiError`/`BilibiliRiskError` 走业务分类编写单元测试。
- 为其他工具错误维持 `toolContextMessage` 编写单元测试。
- 为 `part.error` 是字符串的情况编写回退测试。

### 步骤6:运行时验证(依赖阶段0)

- 触发 Bilibili 工具网络失败,验证 UI 显示网络文案而非"工具执行失败"。
- 采集 N-V1 假设证据。

## 测试建议

### 单元测试:tool-error 分类

| 测试场景 | part.error 输入 | 预期 code | 预期 message |
| --- | --- | --- | --- |
| `BilibiliNetworkError` 带 cause ENOTFOUND | `new BilibiliNetworkError('fetch failed', { code: 'ENOTFOUND' })` | `DNS_ERROR` | 域名解析失败,请检查 Base URL 或网络 |
| `BilibiliNetworkError` 带 cause ECONNREFUSED | `new BilibiliNetworkError('fetch failed', { code: 'ECONNREFUSED' })` | `CONNECTION_REFUSED` | 连接被拒绝,请检查 Base URL 或服务状态 |
| `BilibiliNetworkError` HTTP 500 无 cause | `new BilibiliNetworkError('Bilibili search request failed: HTTP 500')` | `SERVER_ERROR` 或 `NETWORK_ERROR` | 服务端异常,请稍后重试 或 网络连接失败(取决于 N-1 分类) |
| `BilibiliNetworkError` 无 cause 文本 fetch failed | `new BilibiliNetworkError('fetch failed')` | `NETWORK_ERROR` | 网络连接失败 |
| `BilibiliApiError` 带 code -352 | `new BilibiliRiskError()`(name 为 BilibiliRiskError) | `bilibili_risk` | 触发风控,请稍后再试或登录 B站 |
| `BilibiliApiError` 带其他 code | `new BilibiliApiError('api error', -509)` | `bilibili_api` | B站接口异常 |
| 普通 Error(非 Bilibili) | `new Error('unexpected failure')` | 经 `inferErrorCode` 分类 | `工具 bilibili_search 执行失败: unexpected failure` |
| 字符串错误 | `'some error string'` | 经 `inferErrorCode` 分类 | `工具 bilibili_search 执行失败: some error string` |
| 参数校验错误 | `new Error('bilibili_search requires a keyword argument')` | `UNKNOWN_ERROR` 或 `NETWORK_ERROR`(文本回退) | `工具 bilibili_search 执行失败: bilibili_search requires a keyword argument` |

### 单元测试:流终止行为

| 测试场景 | 输入 | 预期行为 |
| --- | --- | --- |
| tool-error 后终止流 | BilibiliNetworkError | 推送 error 消息后 `break streamLoop`,后续推送 `done` |
| tool-error 后允许继续(若评估决定) | BilibiliNetworkError | 推送 error 消息后不终止流,模型继续生成(需 AI SDK 支持) |

### E2E 测试(依赖阶段0)

1. 配置一个可正常聊天的 Provider。
2. 模拟 Bilibili 接口不可达(例如断网或拦截 bilibili 请求)。
3. 在聊天中触发一次需要搜索 Bilibili 的对话。
4. 验证 UI 显示网络文案(如"网络连接失败"或细化文案)而非"工具 bilibili_search 执行失败"。
5. 验证流是否被终止(或模型是否继续生成解释,取决于步骤4 评估)。
6. 采集 `part.error` 的实际类型和结构,确认 instanceof 判断是否有效。

## 验收标准

1. **接入 N-1 统一分类**:`BilibiliNetworkError` 的 `cause` 链经过 N-1 的 `inferErrorCode` 结构化分类,映射到细化的网络错误分类(`DNS_ERROR`、`CONNECTION_REFUSED`、`TLS_ERROR`、`TIMEOUT_ERROR` 等)。
2. **区分网络与业务错误**:`BilibiliNetworkError` 归类为网络错误,显示网络文案;`BilibiliApiError`/`BilibiliRiskError` 归类为业务错误,显示业务文案;其他 Error 维持"工具执行失败"语义。
3. **文案与连接测试一致**:Bilibili 网络失败显示与 Provider 连接测试语义一致的文案,用户能区分网络问题与搜索无结果。
4. **不把猜测写成事实**:本方案不声称"模型在 tool-error 后会继续生成解释"或"用户一定把工具失败理解为没有搜索结果",这些假设列为运行时验证项。
5. **part.error 类型双重判断**:分类逻辑同时支持 `part.error` 是 Error 对象(用 instanceof/name 判断)和字符串(用文本回退)两种情况。
6. **流终止行为明确**:流终止行为(保留或允许继续)有明确决策和运行时确认依据,不预设。
7. **N-1 依赖确认**:N-4 实施前确认 N-1 已完成统一错误分类基础设施。
8. **单元测试覆盖**:`BilibiliNetworkError`、`BilibiliApiError`/`BilibiliRiskError`、其他 Error、字符串错误的分类路径均有单元测试覆盖。

## 运行时验证

以下事项不能仅凭静态代码确认,需在阶段0 恢复 E2E 后采集运行时证据:

1. **`part.error` 的实际类型**:AI SDK 的 tool-error part 中 `error` 字段是 Error 对象、字符串还是 AI SDK 包装的错误对象。该确认决定 `instanceof BilibiliNetworkError` 判断是否有效。
2. **N-V1 假设**:具体是哪个 Provider、哪个 URL 或哪个模型请求失败。需采集非敏感信息(不记录 API Key、Cookie)。
3. **流终止后的实际 UI 呈现**:用户在 tool-error 后是否只收到工具失败提示,还是有其他反馈(如 Port 断开、后续 chunk)。需录制完整对话序列。
4. **模型在 tool-error 后的生成能力**:AI SDK 是否支持 tool-error 后继续流,模型是否能基于 tool-error 信号生成有价值的解释。
5. **`BilibiliNetworkError` 的 cause 链实际结构**:底层 fetch 失败时,`cause` 实际携带哪些字段(是否有 Node `code`)。需在浏览器中触发 Bilibili 网络失败并检查 Error 对象。
6. **用户感知**:用户是否把"工具执行失败"理解为"没有搜索结果"。需用户测试确认。

**运行时验证边界声明**:在运行时证据采集完成前,本方案不把以下假设写成已确认事实:

- "Bilibili 网络失败一定能被精确分类为 DNS/TLS/超时"(取决于 cause 链实际结构)。
- "模型在 tool-error 后会继续生成解释"(取决于 AI SDK 支持和运行时行为)。
- "用户把工具失败理解为没有搜索结果"(取决于用户测试)。

这些是待验证假设,不是已确认事实。

## 风险与回滚

### 风险

1. **part.error 类型不确定**:若 `part.error` 实际是字符串而非 Error 对象,`instanceof BilibiliNetworkError` 判断无效,N-4 的分类逻辑退化到文本匹配,无法访问 cause 链。缓解:分类逻辑同时支持 Error 对象和字符串双重判断;运行时确认后调整判断策略。
2. **AI SDK 包装错误对象**:若 AI SDK 把 `BilibiliNetworkError` 重新包装为内部 Error 类型,`instanceof` 判断可能失败。缓解:增加 `error.name === 'BilibiliNetworkError'` 判断作为补充;运行时确认 AI SDK 的包装行为。
3. **N-1 分类基础设施变更风险**:若 N-1 的分类层级或文案映射在 N-4 实施前发生变化,N-4 需同步调整。缓解:N-4 实施前确认 N-1 的最终分类设计,在步骤1 强制确认。
4. **业务错误分类的完备性**:当前只识别 `BilibiliApiError`/`BilibiliRiskError`,若 Bilibili 客户端新增其他业务错误类型,N-4 需同步扩展。缓解:分类逻辑对未识别的 Bilibili 错误回退到 `bilibili_api` 文案,不误归类为网络错误。
5. **流终止行为变更的兼容性**:若评估决定允许模型继续生成,需确认 AI SDK 支持 tool-error 后继续流,否则 `break streamLoop` 移除后可能产生未定义行为。缓解:该决策依赖运行时确认,在确认前保留终止流。
6. **文案变更影响用户认知**:Bilibili 网络失败从"工具执行失败"改为网络文案,用户可能需要适应期。缓解:网络文案保持简洁明确,指向具体检查方向。
7. **HTTP 状态码分类的边界**:Bilibili HTTP 500 是 B站服务端错误,归类为 `SERVER_ERROR` 还是 `NETWORK_ERROR` 需决策。建议归为 `SERVER_ERROR`(服务端异常),因为根因在 B站而非用户网络。但该决策需确认 N-1 的分类边界是否支持。

### 回滚方案

如果修复引入回归问题,回滚步骤:

1. **回滚 `stream.ts`**:将 `tool-error` case 恢复为原始的 `String(part.error)` + `inferErrorCode(errorText)` + `toolContextMessage` 逻辑,移除 Bilibili 错误分类判断。
2. **保留 `bilibili-search.ts`**(若未修改):该文件保持透传,无需回滚。
3. **保留测试**:新增分类的单元测试可保留(标记为 `skip`),便于后续重新接入。

回滚后,Bilibili 工具网络失败恢复到显示"工具 bilibili_search 执行失败"并终止流的原始行为,与连接测试语义割裂。回滚是纯代码还原操作,不涉及数据迁移。

## 完成状态

- **状态**: pending
- **状态变更条件**:
  - N-1 已完成 + 代码实现完成并自检通过 -> `in_progress`
  - 单元测试覆盖完成(含网络错误、业务错误、其他错误、字符串回退) -> `needs_review`（已达成）
  - 代码审查通过 + part.error 类型运行时确认 + 运行时验证通过(依赖阶段0) -> `completed`
- **状态变更记录**: 2026-08-03：tool-error 接入统一网络/业务错误语义，43 个 stream 测试通过；`part.error` 真实运行时形态和 N-V1 证据待阶段0通道。

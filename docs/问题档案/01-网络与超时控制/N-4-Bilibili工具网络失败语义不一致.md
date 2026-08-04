# [N-4] Bilibili 工具网络失败语义不一致

## 基本信息
- **严重程度**: MEDIUM
- **问题类型**: 错误语义 / UI 呈现
- **确认状态**: 已确认错误语义在 Bilibili 请求和 Provider 连接测试之间不一致；需要运行时复现确认实际 UI 呈现
- **来源文档**: 网络连接错误问题记录.md
- **发现日期**: 2026-08-01
- **关联问题**: N-1

## 问题描述
`bilibili_search` 会抛出 `BilibiliNetworkError`，`bilibili-search.ts` 不转换该异常；它会回到 AI SDK 的 tool-error 路径，由 `stream.ts` 统一显示"工具 bilibili_search 执行失败"，随后终止当前流并发送 done。

这导致 Bilibili 网络失败在 UI 上呈现为"工具执行失败"而非"网络连接失败"，与 Provider 连接测试的语义割裂。用户可能把网络失败理解成普通工具问题。

## 代码位置
- `Main/src/lib/bilibili-client/search.ts:94-112`（抛出 BilibiliNetworkError 的源头）
- `Main/src/tools/bilibili-search.ts:90-127`（工具执行体，未转换 BilibiliNetworkError）
- `Main/src/background/stream.ts:368-380`（tool-error 路径统一展示"工具执行失败"）

## 根因分析
Bilibili 工具的网络失败路径与 Provider 连接测试走了完全不同的错误出口：

```ts
// bilibili-search.ts 关键逻辑示意
try {
  const results = await bilibiliSearch(query);  // 可能抛 BilibiliNetworkError
  return results;
} catch (err) {
  // 未将 BilibiliNetworkError 转换为可被 inferErrorCode 识别的类型
  throw err;  // 原样抛回 AI SDK
}
```

抛回的异常进入 AI SDK 的 tool-error 路径，由 `stream.ts` 统一处理为"工具 bilibili_search 执行失败"。该路径不调用 `inferErrorCode`，因此不会展示"网络连接失败"分类，而是展示工具执行失败并终止本次流。

与之对比，Provider 连接测试的异常会经过 `inferErrorCode`，能区分鉴权、限流、网络等不同根因。两条路径的错误语义完全割裂。

需要注意：当前代码不能证明模型会继续生成解释，也不能证明模型一定理解"没有搜索结果"的含义。终止本次流后，用户的体验可能是：消息发出后只收到"工具执行失败"，没有任何进一步说明。

## 影响范围
- **用户体验影响**：该路径不会直接展示"网络连接失败"分类，而是展示工具执行失败并终止本次流；用户可能把网络失败理解成普通工具问题。当前代码不能证明模型会继续生成解释或一定被理解为"没有搜索结果"。
- **技术债务影响**：Bilibili 工具与 Provider 连接测试的错误语义割裂，后续若新增其他工具，容易沿用"工具执行失败"这一笼统路径，进一步稀释错误语义。
- **与其他问题的关联**：与 N-1（连接测试错误分类粗粒度）共享同一错误归类出口。N-1 的问题是分类太粗，N-4 的问题是根本没接入分类，两者共同构成"错误语义不统一"的问题族。

## 复现路径（如有）
1. 配置一个可正常聊天的 Provider。
2. 模拟 Bilibili 接口不可达（例如断网或拦截 bilibili 请求）。
3. 在聊天中触发一次需要搜索 Bilibili 的对话。
4. 观察 UI 是否显示"工具 bilibili_search 执行失败"而非"网络连接失败"。
5. 观察流是否被终止且无后续模型解释。

## 待验证假设（如有）
- 假设1：用户把 Bilibili 网络失败误判为工具故障，是因为 tool-error 路径未区分网络失败与其他工具错误。需要运行时复现确认实际 UI 呈现与用户感知。
- 假设2：模型在 tool-error 后仍能基于"工具失败"信号生成解释，但当前终止流的实现可能截断了模型后续输出。需要核实流终止时机与模型生成窗口。

## 建议的修复方向
统一 Bilibili 网络失败的错误语义，考虑将 `BilibiliNetworkError` 转换为可被 `inferErrorCode` 识别的错误类型，或在 tool-error 路径中区分网络失败与其他工具错误：

1. 在 `bilibili-search.ts` 的 catch 中，将 `BilibiliNetworkError` 转换为带网络语义的错误类型，使其能被 `inferErrorCode` 识别。
2. 或在 `stream.ts` 的 tool-error 路径中，根据错误类型区分"网络失败"与"工具逻辑失败"，前者展示网络类文案，后者维持"工具执行失败"。
3. 评估是否在 tool-error 后允许模型继续生成解释，而非直接终止流，以避免用户只收到工具失败提示而没有任何说明。
4. 修复后需与 N-1 的错误分类细化保持一致，避免两条路径再次语义割裂。

修复仅描述思路，不包含具体实现代码。

## 参考资料
- 相关测试用例：Bilibili 工具网络失败语义用例（待补充）
- 相关设计文档：网络连接错误问题记录.md
- 关联问题：N-1 连接测试错误分类粗粒度

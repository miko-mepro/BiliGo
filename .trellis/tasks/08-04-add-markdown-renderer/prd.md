# 添加 Markdown 渲染器

## Goal

为 AI 回复添加 Markdown 渲染，解决 `**` 等 Markdown 语法在纯文本中直接暴露给用户的问题。

## Requirements

- 安装 `react-markdown` + `rehype-sanitize` + `remark-gfm`
- 仅 AI 回复渲染 Markdown，用户消息保持纯文本
- 在 `ChatMessage.tsx` 中用独立 `<div className="bili-agent-message__markdown">` 包裹 AI 回复内容
- 在 `styles.ts` 中新增 `.bili-agent-message__markdown` 样式块（h1-h6、code、blockquote、table、ul/ol、a）
- 在 `stream.ts` SYSTEM_PROMPT 末尾添加一句提示，让模型可选用 Markdown 格式回复
- 流式渲染时延迟 100～200ms，减少频繁重排

## 安全约束

- 禁止原始 HTML 渲染
- 链接仅允许 http/https 协议，新标签页打开，加 `noopener noreferrer`
- 禁止渲染图片，保留图片描述文字即可
- 使用 `rehype-sanitize` 做 XSS 防护

## 可接受标准

- [ ] `**粗体**` 等 Markdown 语法在 UI 中正确渲染，不再显示裸 `**`
- [ ] 表格、列表、删除线等 GFM 扩展正常渲染
- [ ] 用户消息保持纯文本，不受影响
- [ ] 流式输出时 UI 更新流畅，无明显卡顿
- [ ] 链接新标签页打开，`rel="noopener noreferrer"`
- [ ] 图片和原始 HTML 不会被渲染
- [ ] SYSTEM_PROMPT 已更新提示模型使用 Markdown
- [ ] 构建无错误，lint 通过

## 参考

- `.trellis/tasks/research/markdown-renderer-frontend.md` — 技术选型研究
- `.trellis/big-question/optimize-response-style.md` — 关联任务（回复风格优化，依赖此任务完成后实施）
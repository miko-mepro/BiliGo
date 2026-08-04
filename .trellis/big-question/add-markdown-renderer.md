# 待办：添加 Markdown 渲染器

## 问题
AI 回复在 UI 中以纯文本渲染，`**` 等 markdown 语法直接暴露给用户，视觉突兀。

## 方案
- 安装 `react-markdown` + `remark-gfm`
- 改 `ChatMessage.tsx:154`：`<p>` → `<ReactMarkdown>`
- 改 `styles.ts:828-832`：展开为完整 markdown 样式
- 改 `stream.ts:32-44` SYSTEM_PROMPT：提示模型可用 markdown

## 研究参考
`.trellis/tasks/research/markdown-renderer-frontend.md`

## 状态
**待排期** — 2026-08-04 记录
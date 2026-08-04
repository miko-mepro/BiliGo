# 添加 Markdown 渲染器 - 技术设计

## 技术选型

| 项 | 决策 | 理由 |
|---|---|---|
| 渲染库 | `react-markdown` | CSP 安全，不需要 `dangerouslySetInnerHTML`，React 19 兼容 |
| 安全插件 | `rehype-sanitize` | XSS 防护，配合 `react-markdown` 无需额外依赖 |
| GFM 扩展 | `remark-gfm` | 支持表格、删除线、任务列表等 LLM 常用输出格式 |

## 渲染范围

- 仅 AI 回复（`message.role === 'assistant'`）渲染 Markdown
- 用户消息保持纯文本 `<p>` 标签
- 思考过程（reasoning）保持纯文本，不渲染

## 组件改动

### ChatMessage.tsx

```
<!-- 当前 -->
<div className="bili-agent-message__bubble">
  <p className="bili-agent-message__text">{displayContent}</p>
</div>

<!-- 改为 -->
<div className="bili-agent-message__bubble">
  {isAssistant ? (
    <div className="bili-agent-message__markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        urlTransform={allowedUrlTransform}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: () => null,  /* 禁止渲染图片 */
        }}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  ) : (
    <p className="bili-agent-message__text">{displayContent}</p>
  )}
</div>
```

### urlTransform 处理

只允许 `http://` 和 `https://` 协议，其他协议（javascript:、file: 等）返回空字符串。

## 样式改动

在 `styles.ts` 中新增 `.bili-agent-message__markdown` 样式块，包含：

- 基础文本：`font-size: 14px; line-height: 1.6;`
- 标题：h1～h6 渐进缩小的字号
- 列表：ul/ol 缩进和标记样式
- 代码块：`code` 和 `pre` 等宽字体、背景色、滚动条
- 引用：`blockquote` 左边框线
- 表格：`table` 边框线、交替行背景
- 链接：`a` 颜色和下划线
- 段落间距：`p + p` 上边距

## 流式渲染优化

流式输出时，内容更新频繁。使用 `useMemo` 或防抖（100～200ms）避免每次 delta 都触发全量重新渲染。

方案：在 `ChatMessageItem` 组件内，对 `displayContent` 做延迟处理：

```
const debouncedContent = useDeferredValue(displayContent);
// 或
const [renderedContent, setRenderedContent] = useState(displayContent);
// 节流：100ms 内只更新一次
```

## SYSTEM_PROMPT 更新

在 `stream.ts:32-44` SYSTEM_PROMPT 末尾追加：

```
「回复可以使用 Markdown 格式（标题、列表、表格、粗体等）来增强可读性。」
```

## 安全边界

- 原始 HTML 禁止渲染（`react-markdown` 默认行为）
- 链接仅允许 http/https，新标签页打开，`target="_blank" rel="noopener noreferrer"`
- 图片不渲染，保留文字描述
- `rehype-sanitize` 作为最后防线

## 涉及文件

| 文件 | 改动类型 |
|---|---|
| `Main/package.json` | 新增依赖 |
| `Main/src/components/ChatMessage.tsx` | 替换 `<p>` 为 `<ReactMarkdown>` |
| `Main/src/content/styles.ts` | 新增 `.bili-agent-message__markdown` 样式块 |
| `Main/src/background/stream.ts` | SYSTEM_PROMPT 末尾追加提示 |
| `Main/package-lock.json` | 自动更新 |
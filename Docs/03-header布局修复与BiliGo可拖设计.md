# 03 - Header 布局修复与 BiliGo 可拖设计

## 1. 背景与问题

用户反馈两个相关问题：

1. **按钮间空白**：header 中"新建（+）/设置（⚙）/关闭（×）"三个按钮之间存在明显空白区域，视觉松散。
2. **BiliGo 区域不能拖**：用户希望整个 header 除了三个按钮都能拖动，含 BiliGo 标题；但当前点击 BiliGo 仅触发 `toggleHistory`（展开/收起历史下拉），拖不动面板。

## 2. 现状分析

### 2.1 header DOM 结构

```
.bili-agent-panel__header   (flex, justify-content: space-between)
├── .bili-agent-panel__heading          (BiliGo + chevron)
│   ├── .bili-agent-panel__title        (BiliGo SVG)
│   ├── .bili-agent-panel__badge        (Settings, 仅设置页)
│   └── .bili-agent-panel__history-toggle  (chevron, 仅非设置页)
├── button.bili-agent-panel__new-chat-button   (+)
├── button.bili-agent-panel__settings-button   (⚙)
├── button.bili-agent-panel__close-button      (×)
└── <HistoryDropdown>                          (非设置页, 末尾, data-no-drag)
```

### 2.2 关键样式（`Main/src/content/styles.ts`）

```css
.bili-agent-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;   /* ← 主因 */
  /* ... */
}

.bili-agent-panel__heading {
  flex: 0 0 auto;
  width: max-content;
  max-width: 50%;
  cursor: pointer;
}
```

### 2.3 拖动机制（`Main/src/hooks/useDraggable.ts` + `Panel.tsx`）

- `useDraggable` 通过 `handleRef={dragHandleRef}` 把整个 `.bili-agent-panel__header` 作为拖把
- `Panel.tsx:255` 的 `handleHeaderPointerDown` 做命中过滤：
  ```ts
  if (target.closest("button, a, input, textarea, select, [data-no-drag]")) {
    return;   // 放行，不进拖动
  }
  handlePointerDown(e);
  ```
- `.bili-agent-panel__heading` 标了 `data-no-drag`（`Panel.tsx:475`）--**这就是 BiliGo 区域不能拖的根因**
- `useDraggable` 内置阈值区分机制：
  - `DRAG_THRESHOLD = 5`（`useDraggable.ts:26`）
  - 移动 <5px：`hasStarted` 仍为 false，不进拖动；`pointerup` 不装 clickSuppressor，原生 `click` 正常派发
  - 移动 ≥5px：进入拖动；`pointerup` 时 `wasDragging=true`，装一次 capture 阶段 `click` 抑制器（`useDraggable.ts:254-262`）吃掉尾部 click，防止误触发 `toggleHistory`
- **结论**：阈值区分机制已完备，无需新增任何逻辑

## 3. 空白区域根因

`justify-content: space-between` 把首元素（`__heading`）推到最左、末元素推到最右、中间元素均匀分布。`__heading` 的 `width: max-content` 让它只占自身内容宽度（BiliGo 文字约 90px），剩余空间被 `space-between` 均匀分到三个按钮之间，尤其面板较宽时中间空白最大。

## 4. 设计方案

### 4.1 消除按钮间空白

**方案**：给 `.bili-agent-panel__heading` 设 `margin-right: auto`，其余保持不变。

**原理**：
- `margin-right: auto` 在 flex 行内会吸收所有剩余主轴空间，把 heading 推到最左、右侧元素紧贴右边缘
- `space-between` 在首个子元素有 `margin-right:auto` 时等效于 `flex-start + margin-right:auto`：三按钮作为一簇靠右紧贴，间隙由 `gap` 或按钮自身 padding 决定，不再被 `space-between` 均匀撑开
- 改动 1 行 CSS，行为最稳

**备选（未采用）**：改 `justify-content: flex-end + gap: 8px`，更显式但改动更大，且需同步调整 `__heading` 的 `margin-right: auto` 才能让 heading 靠左--多改一处不如直接 `margin-right:auto`。

### 4.2 BiliGo 区域可拖 + 点击仍展开历史

**方案**：删除 `.bili-agent-panel__heading` 上的 `data-no-drag` 属性（`Panel.tsx:475`）。

**原理**：
- 删除后 `handleHeaderPointerDown` 的命中过滤不再拦截 heading，`pointerdown` 进入 `useDraggable` 流程
- 移动 <5px -> 不触发拖动 -> `click` 正常派发 -> `onClick={toggleHistory}` 生效
- 移动 ≥5px -> 进入拖动 -> `clickSuppressor` 吃掉尾部 click -> 不误触发 `toggleHistory`
- **无需新增阈值逻辑**，复用现有 `DRAG_THRESHOLD` + `clickSuppressor`

**副作用确认**：
- `heading` 内的 `svg > text` "BiliGo" 随父级变为可拖；点击它等同于点击 heading（事件冒泡），仍走阈值区分
- chevron 图标（`.bili-agent-panel__history-toggle`）无 `data-no-drag`，但它无独立 `onClick`，点击行为由 heading 冒泡承担，删除 heading 的 `data-no-drag` 后一致

### 4.3 三按钮仍不可拖（无需改动）

`handleHeaderPointerDown` 已过滤 `button`，三个按钮天然放行点击，不需改动。

### 4.4 HistoryDropdown 不受影响（无需改动）

`HistoryDropdown`（`HistoryDropdown.tsx:222`）自带 `data-no-drag`，删除 heading 的 `data-no-drag` 后，下拉浮层仍被自身 `data-no-drag` 保护，不受影响。

### 4.5 与"文案不可选"任务的协同

上一任务（`Docs/02-文案不可选设计.md`）已设计三处文案 `user-select: none`。BiliGo 区域变为可拖后，拖动时浏览器选中文本会干扰手感；本次给 `.bili-agent-panel__title` 加 `user-select: none` 反而正协同--两项任务无冲突，可一并实施。

## 5. 改动清单

| # | 文件 | 改动 | 行数 |
|---|------|------|------|
| 1 | `Main/src/content/styles.ts` | `.bili-agent-panel__heading` 加 `margin-right: auto;` | +1 |
| 2 | `Main/src/components/Panel.tsx` | 删除 `__heading` 上的 `data-no-drag` 属性 | -1 |
| 3 | `Main/src/content/styles.ts` | `.bili-agent-panel__title` 加 `user-select: none`（含前缀，与 02 文档合并实施） | +3 |
| 4 | `Main/src/content/styles.ts` | `.bili-agent-message-list__empty-text` 加 `user-select: none`（含前缀） | +3 |
| 5 | `Main/src/content/styles.ts` | `.bili-agent-message-list__empty-hint` 加 `user-select: none`（含前缀） | +3 |
| 6 | `Main/src/content/styles.ts` | 新增 `.bili-agent-panel__title svg` 与 `.bili-agent-panel__title text` 规则各加 `user-select: none`（含前缀） | +8 |

总计：约 +19 / -1 行。

## 6. 验证

### 6.1 视觉验证
- 打开面板，观察 header：BiliGo 在左、三按钮作为一簇靠右紧贴，中间无多余空白
- 拖动 BiliGo 区域：面板跟随移动
- 点击 BiliGo 区域（不移动）：历史下拉展开/收起
- 在 BiliGo 区域按下后移动 ≥5px 再松开：面板拖动，历史下拉不误展开
- 三按钮仍可独立点击，不触发拖动

### 6.2 回归验证
- 消息气泡正文、视频卡片标题仍可被选中复制（未被 4-6 项波及）
- 现有测试不受影响：
  - `MessageList.test.tsx:255` 仅断言文本存在，不涉及选择行为
  - `useDraggable.test.tsx` / `useResizable.test.tsx` 验证 userSelect 状态管理，本次不动 hook
- e2e（`qa-visual.spec.ts:95` "BiliGo title present in panel header"）断言 SVG 文本存在，本次不改 SVG 结构

## 7. 风险与回滚

- **风险**：低
  - CSS 单行 `margin-right:auto` 兼容性极佳
  - 删除 `data-no-drag` 复用已有阈值机制，无新逻辑
  - `user-select: none` 已有同款写法（`.bili-agent-panel__search`）
- **回滚**：
  - 删除 `margin-right: auto` 恢复空白布局
  - 恢复 `data-no-drag` 属性恢复 BiliGo 不可拖
  - 删除 `user-select` 规则恢复可选

## 8. 关联文档

- `Docs/02-文案不可选设计.md`：三处文案 `user-select: none` 的独立设计，本次一并实施其 CSS 部分

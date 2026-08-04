# 优化 AI 回复风格

## Goal

Markdown 渲染器上线后，调整 AI 回复风格，使其更口语化、更简洁、去掉敬语。

## 依赖

- **必须先等** `08-04-add-markdown-renderer` 上线
- Markdown 渲染后 `**` 等格式在 UI 中正确渲染，不再突兀，因此 `**` 可以保留，不需要在回复风格层面禁用

## Requirements

- 更口语化，少用书面结构
- 更简洁，只说结论不解释
- 去掉敬语（您/请/建议），用"你"

## 涉及范围

- `Main/src/background/stream.ts` — SYSTEM_PROMPT 中的语气和格式要求
- 如有其他 prompt 模板，一并调整

## 可接受标准

- [ ] AI 回复风格更口语化，不再有模板化书面感
- [ ] 回复只说结论，不堆砌分析过程
- [ ] 不使用"您/请/建议"等敬语，统一用"你"
- [ ] `**` 等 Markdown 格式正常使用，不因风格调整而禁用
- [ ] 不影响搜索准确性和工具调用流程

## 参考

- `.trellis/big-question/optimize-response-style.md` — 原始问题记录
- `08-04-add-markdown-renderer` — 前置依赖任务
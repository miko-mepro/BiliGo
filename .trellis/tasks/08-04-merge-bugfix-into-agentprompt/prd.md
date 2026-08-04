# 将 bugfix 分支合并到当前分支

## Goal

将已完成修复的本地 `bugfix` 分支合并到当前 `Agentprompt` 分支，使当前分支包含聊天流、重排及其回归测试的完整提交历史和代码变更。

## Confirmed Facts

- 当前分支为 `Agentprompt`，分支头为 `2573a41`。
- 目标分支为本地 `bugfix`，分支头为 `be7d28f`。
- 两个分支从 `d885f215` 分叉；`Agentprompt` 独有 8 个提交，`bugfix` 独有 52 个提交。
- 提交级合并预演显示内容冲突位于 `Main/src/background/stream.ts` 和 `Main/test/background/stream.test.ts`；其余已识别文件可自动合并。
- 工作区在本任务开始前已有大量未提交的删除、修改和未跟踪文件，这些变更不属于本任务。

## Requirements

- 在 `Agentprompt` 分支上合并本地 `bugfix` 分支，而不是推送远程或仅挑选部分提交。
- 解决预演发现的冲突时必须合并保留两条分支的有效行为、测试覆盖和独有提交内容，不能用整文件覆盖或单方面选择 `ours`/`theirs` 掩盖冲突。
- 保留任务开始前工作区中的用户变更，不执行 `reset --hard`、清理未跟踪文件或未经授权的 stash/提交操作。
- 若脏工作区阻止安全合并，停止操作并报告阻塞原因，不擅自改变这些工作区变更。
- 合并完成后进行 Git 状态和相关测试验证，并记录无法执行的验证及原因。

## Acceptance Criteria

- [ ] `Agentprompt` 仍为当前分支，且 `bugfix` 分支头已成为当前历史祖先。
- [ ] 合并结果同时保留合并前 `Agentprompt` 分支头和 `bugfix` 分支头的历史与有效内容，任何一方的独有提交都没有被丢弃。
- [ ] 合并完成后不存在未解决的 Git 冲突标记或 unmerged paths。
- [ ] `Main/src/background/stream.ts` 与 `Main/test/background/stream.test.ts` 的冲突已按两分支意图解决，相关测试或等价静态验证通过。
- [ ] 任务开始前的无关工作区变更未被丢弃、覆盖或擅自提交。
- [ ] 合并结果和验证结果已向用户说明；不执行远程推送。

## Out Of Scope

- 不修改与冲突解决无关的业务逻辑，不重构测试或清理历史代码。
- 不创建远程分支、不推送、不合并其他分支。
- 不处理任务开始前已有的无关脏工作区变更。

# 阶段3 S-1 A1 收尾

## Goal

Close the remaining review findings for the Stage 3 S-1 A1 implementation without
changing its established runtime behavior.

## Requirements

- Keep the service-worker ordering contract as `tool_start -> tool_result -> auxiliary -> done`.
- Make the S-1 plan and progress documents consistent with the selected A1 decision,
  `needs_review` status, and the remaining runtime/E2E validation gate.
- Do not claim that separate protocol messages provide atomic UI updates or guarantee
  that browser visual jumps disappear.
- Correct the S-2 impact wording: A1 changes message ordering but does not reduce the
  number of video updates or remove video-triggered scrolling.
- Extend the `query_expand` regression assertion through the terminal `done` message.
- Preserve unrelated dirty worktree changes and do not introduce new protocol/state models.

## Acceptance Criteria

- [x] The S-1 plan contains no contradictory current-state wording after A1 selection;
      historical alternatives are explicitly labeled as such.
- [x] `修复状态追踪.md` and `任务进度总览.md` consistently report S-1 as
      `needs_review`, Stage 3 as `in_progress`, and six Stage 3 runtime gaps pending.
- [x] The `query_expand` test asserts `tool_start < tool_result < insight < done`.
- [x] Relevant tests, typecheck, lint, and `git diff --check` pass.
- [x] No browser/E2E completion claim is made before the Stage 0 runtime channel is used.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

# Channel Implementation Brief

Task: `.trellis/tasks/08-04-bili-progressive-skill-loading`

The implementation was already attempted by a previous OpenCode-native worker. Treat the current uncommitted diff as the starting point and audit it against the task artifacts rather than assuming it is correct.

## Goal

Reconcile the existing implementation with the PRD, design, implementation plan, and manifests. Fix concrete functional, type, build, or test issues in the BiliGo progressive skill-loading feature.

## Scope

- `Main/package.json` and `Main/package-lock.json` for the direct `yaml` dependency and build scripts.
- `Main/scripts/validate-skills.mjs`.
- `Main/.agents/skills/**`.
- `Main/src/skills/**`.
- `Main/src/background/stream.ts`.
- `Main/src/components/ChatMessage.tsx`.
- Focused tests under `Main/test/**`.

Preserve unrelated existing worktree changes, especially the pre-existing Markdown rendering and dependency changes. Do not edit `.opencode/**`, unrelated `.trellis/**`, or generated `Main/dist/**` files.

## Required Checks

- Build validation rejects malformed frontmatter, duplicate names, invalid activation, broken links, traversal/absolute paths, unsupported resources, and size violations.
- The generated registry is deterministic and bundled; runtime reads never use an external filesystem.
- Mandatory skill bodies are cached by `conversationId` before `streamText`; metadata is prompt-visible while autonomous bodies and references remain lazy.
- `load_skill` and `read_skill_file` return structured values for invalid model input and do not add AI SDK steps during mandatory preload.
- Existing search tool flow remains intact and the step cap is 7.
- Timeline labels and tests remain compatible with existing Markdown rendering.

## Verification

Run the relevant commands from `Main/`: `npm run validate:skills`, targeted skill/stream tests, `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` as feasible. Report pre-existing failures separately.

Do not commit, push, merge, reset, or discard unrelated changes. Report modified files, fixes, verification results, and unresolved risks through the channel.

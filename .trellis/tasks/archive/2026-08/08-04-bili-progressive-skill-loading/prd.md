# BiliGo Agent Progressive Skill Loading and Writing Rules

## Goal

Give BiliGo Agent a portable Agent Skills-compatible writing skill while making the skill actually available to end users who only install the built Chrome extension from `Main/dist/`. Mandatory skills must be available for every conversation without permanently placing every optional template and reference in the initial model context.

## Background and Confirmed Facts

- The product source root is `Main/`; the current working directory is the parent `Agent/` repository.
- The extension is built with Vite and CRXJS (`Main/vite.config.ts:1-8`) and loaded by Chrome from the generated `Main/dist/` directory.
- The extension manifest points to the background and content-script source entrypoints that Vite bundles (`Main/manifest.json:8-14`).
- The current model workflow sends the inline `SYSTEM_PROMPT` to `streamText` (`Main/src/background/stream.ts:32-45, 323-330`).
- The current runtime has no filesystem skill discovery or skill loader.
- Assistant Markdown is rendered by `react-markdown` with GFM and sanitization (`Main/src/components/ChatMessage.tsx:167-177`).
- Vite client types and arbitrary extension imports are already enabled (`Main/tsconfig.app.json:7-8`), so raw Markdown imports are technically available.
- `dist/` is generated output and is ignored by Git (`Main/.gitignore:10-13`); users must receive a rebuilt `dist/` to receive skill changes.
- The user requires progressive skill loading to preserve useful conversation context, not a permanently expanded prompt containing every skill and reference.

## Requirements

### Skill format and repository layout

- Store project skills under `Main/.agents/skills/` using the Agent Skills directory convention.
- Discover skills recursively under `Main/.agents/skills/**/SKILL.md` at build time.
- Each skill directory must contain a valid `SKILL.md` whose `name` matches the parent directory and whose `description` is non-empty.
- `SKILL.md` must contain non-empty Markdown instructions after valid YAML frontmatter.
- Every skill must explicitly declare `metadata.activation` as either `mandatory` or `autonomous`.
- Do not add a trigger-time field; mandatory loading occurs at the start of the first streaming request for a conversation.
- Duplicate skill names, malformed frontmatter, invalid activation values, missing linked resources, missing required files, and size violations must fail the npm build. No invalid skill may be silently skipped.
- A referenced relative resource must exist. Unreferenced files in a skill directory may remain for future use.
- Add a direct `yaml` dependency for reliable frontmatter parsing.

### Loading behavior

- At the first streaming request for a conversation, the orchestration layer must load every `mandatory` skill's `SKILL.md` before creating `streamText`.
- Mandatory loading is an internal orchestration step and must not consume AI SDK tool steps.
- Cache mandatory skill contents by conversation identity for the lifetime of the in-memory session. If the MV3 service worker restarts, reload from the bundled registry; never require an external filesystem path.
- Every later model request in the conversation must include the cached mandatory skill body in its system prompt, because a new `streamText` call does not inherit the previous call's system prompt.
- Autonomous skills must expose metadata in the system prompt and support both model-selected loading and explicit user-directed loading.
- `load_skill` loads only the selected skill's `SKILL.md` body. It must not load `references/` automatically.
- Add a read-only `read_skill_file` capability for text resources selected by the instructions in `SKILL.md`. It may read only paths inside the packaged skill directory; it must reject absolute paths, traversal (`..`), binary files, script execution, and files outside the skill root.
- `SKILL.md` and reference files must be returned without YAML frontmatter duplication where metadata is already indexed; the model receives the Markdown instruction body or requested text resource.
- Mandatory tool loading must be invisible in the UI. Autonomous skill and resource calls should be shown in the existing thinking timeline with readable labels.
- Skill tool errors should be returned to the model as structured errors so it can retry or answer safely. Static skill integrity errors must fail during build.

### Resource and context limits

- `SKILL.md` must be at most 500 lines; exceeding the limit fails the build.
- Each reference/resource file must be at most 64 KiB; exceeding the limit fails the build.
- Do not truncate invalid or oversized resources.
- The maximum AI SDK step condition must be 7 steps per `streamText` request, covering the existing workflow plus autonomous skill and resource calls.

### BiliGo writing behavior

- The writing skill must govern final assistant responses only; it must not change tool implementation, code comments, or Git commit messages.
- Responses should follow the user's language, defaulting to Simplified Chinese when no language is clear.
- The default tone is concise, natural, and professional. Short answers should not be forced into headings or decorative sections.
- Use GFM Markdown where it improves scanning: headings, lists, blockquotes, fenced code, links, and small comparison tables.
- Bold markers must wrap text rather than boundary punctuation. For Chinese names with corner quotes, prefer `「**红叔**」` and avoid `**「红叔」**`.
- Use Markdown links with descriptive link text. Do not use raw HTML or image tags in assistant responses.
- Use tables only for small comparisons, not for video lists.
- Include a video recommendation template and a clarification-question template as progressive reference resources.
- For casual chat, unrelated requests, and failures, answer directly or explain the boundary and next action instead of forcing the video-search template or inventing results.

### Build and distribution

- Build-time discovery and validation must be part of the normal npm build path before the extension bundle is emitted.
- The build must embed the validated skill registry/resources into the extension bundle so a user with only `dist/` can load the extension and use the behavior.
- Do not require the end user to install Node.js, access source files, configure an external skill directory, or edit `dist/`.
- Do not manually edit generated `dist/` files.

## Acceptance Criteria

- [ ] A valid `Main/.agents/skills/bili-writing-format/SKILL.md` exists with valid frontmatter, non-empty body, and required `metadata.activation`.
- [ ] Progressive references include `video-reply.md` and `clarification.md`, are referenced by the core skill, and can be read through the constrained resource capability.
- [ ] Build-time discovery finds all nested skills, validates frontmatter/name/activation/body/links/size, rejects duplicates, and fails the npm build for any incomplete skill.
- [ ] A clean `npm run build` embeds the skill registry and resources into `dist/`; loading only that `dist/` directory as an unpacked Chrome extension is sufficient for runtime skill behavior.
- [ ] The first streaming request of a conversation loads mandatory skill bodies before `streamText`; later requests reuse them in their system prompt, including after service-worker restart through bundled recovery.
- [ ] Autonomous skills can be loaded by model tool call or explicit user-directed request, while `load_skill` loads only `SKILL.md` and `read_skill_file` handles referenced text resources.
- [ ] Path traversal, absolute paths, outside-root paths, unsupported binary/script resources, and oversized resources are rejected safely.
- [ ] The final system prompt contains skill metadata but does not eagerly include autonomous skill bodies or reference templates.
- [ ] The existing video-search workflow remains functional with a seven-step per-request limit and skill tool labels in the thinking timeline.
- [ ] Tests cover frontmatter/discovery validation, duplicate names, activation modes, first-request caching, service-worker recovery, tool path restrictions, progressive resource loading, and the Chinese bold-markup rule.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and the relevant e2e suite pass.

## Out of Scope

- Implementing a general-purpose external filesystem skill installer for end users.
- Loading skills from arbitrary URLs or extension-external paths.
- Executing scripts, MCP tools, or binary assets bundled inside a skill.
- Replacing the existing BiliGo search workflow or provider configuration.
- Adding a user-facing skill management UI in this iteration.
- Making the skill system available to external Claude/Codex/Copilot hosts; the `.agents/skills` layout remains portable, but runtime behavior is implemented inside BiliGo.

## Open Questions

- None blocking planning. The next gate is review of `design.md` and `implement.md`; implementation must wait for explicit approval of the final planning summary.

# Implementation Plan

## Ordered Work

1. Add the direct `yaml` dependency and an npm `validate:skills` script plus `prebuild` hook in `Main/package.json`; update the lockfile with the repository package manager.
2. Implement build-time skill discovery/validation under `Main/scripts/`, including recursive discovery, YAML frontmatter validation, directory-name matching, required activation metadata, duplicate detection, relative-resource validation, and size limits.
3. Add the initial skill package under `Main/.agents/skills/bili-writing-format/` with core `SKILL.md`, `references/video-reply.md`, and `references/clarification.md`.
4. Implement the bundled runtime registry with Vite raw imports, metadata listing, frontmatter stripping, mandatory-body loading, resource lookup, and traversal/extension guards.
5. Add `load_skill` and `read_skill_file` AI SDK tools using the existing `tool()` and Zod patterns. Return structured errors for invalid model inputs and keep resources read-only.
6. Refactor `Main/src/background/stream.ts` to build system prompts from the base workflow, skill metadata, and conversation-level mandatory cache; preload mandatory bodies before the first stream; register the two skill tools; and update the per-request step cap to 7.
7. Update `Main/src/components/ChatMessage.tsx` with labels for skill-loading and resource-reading tool events.
8. Add unit coverage for frontmatter/discovery validation, duplicate names, malformed and incomplete skills, mandatory/autonomous behavior, cache reuse/recovery, body-only loading, path traversal, unsupported resources, and structured tool errors.
9. Add or update integration/e2e coverage to confirm skill tool steps do not break video search, cards, streaming text, or the existing mock request assertions.
10. Verify the built `dist/` contains the bundled skill content and can be loaded as an unpacked Chrome extension without source files.

## Validation Commands

Run from `Main/`:

```bash
npm run validate:skills
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e -- e2e/agent-flow.spec.ts
```

Also run targeted tests for the new skill registry and tools before the full suite. Inspect the generated `dist/` for the skill metadata/core text and confirm `dist/manifest.json` remains valid.

## Review Gates

- Build validation must fail on a temporary malformed skill fixture and pass after the fixture is removed.
- A mandatory skill must appear in the first request's generated system prompt and be reused on the next request without a second file parse while still being present in the next model request.
- Autonomous skill metadata must be present without its body; `load_skill` must add only the body, and `read_skill_file` must add only the requested resource.
- Attempts to read `../`, absolute, binary, script, or outside-root resources must return controlled errors.
- The Chinese bold example must use `「**红叔**」`, not `**「红叔」**`.
- Existing tool result ordering and video card behavior must remain unchanged.

## Risk and Rollback Points

- **Vite glob/import behavior:** validate that files outside `src/` but inside the project root are bundled; if raw globs are unsuitable, use a build-generated registry without changing the runtime contracts.
- **Frontmatter parser bundle size:** keep `yaml` usage in the registry/validation boundary and confirm the service-worker bundle remains acceptable.
- **Model step budget:** use 7 steps and verify both the normal search path and search plus autonomous resource path.
- **Service-worker lifecycle:** verify a new worker process can rebuild the mandatory cache from bundled resources on the next request.
- **Prompt size:** keep mandatory core rules concise and references out of the initial prompt.

## Completion Checklist

- [ ] PRD/design/implementation artifacts approved and task started.
- [ ] Skill validator and registry implemented.
- [ ] Core skill and two reference templates implemented.
- [ ] Runtime tools and system prompt integration implemented.
- [ ] Unit, integration/e2e, lint, typecheck, and build checks pass.
- [ ] Final quality check completed.

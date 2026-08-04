# Technical Design

## 1. Architecture

The extension will use a build-validated, bundle-backed skill registry. The registry is authored in `Main/.agents/skills/` using the Agent Skills directory format, but the browser runtime never scans the host filesystem.

```text
Main/.agents/skills/**
        |
        | npm prebuild validation (YAML, links, sizes, duplicates)
        v
Vite raw asset registry in the service-worker bundle
        |
        +--> metadata index in every system prompt
        +--> mandatory SKILL.md bodies on first conversation request
        +--> autonomous SKILL.md bodies through load_skill
        +--> references through read_skill_file
        v
Chrome extension dist/
```

Progressive disclosure applies to model context. Resources may be bundled in the JavaScript output because a Chrome extension cannot depend on an external filesystem; bundling does not place all skill bodies in the model prompt.

## 2. Build-Time Discovery and Validation

Add a Node validation module under `Main/scripts/` and invoke it through an npm `prebuild` script. The validator will:

1. Recursively enumerate skill directories under `.agents/skills/`.
2. Read each `SKILL.md` and parse its YAML frontmatter with the direct `yaml` dependency.
3. Validate the Agent Skills fields (`name`, `description`, directory-name match, naming constraints) and BiliGo's required `metadata.activation` value (`mandatory` or `autonomous`).
4. Validate a non-empty Markdown body, the 500-line `SKILL.md` limit, resource size limits, supported text-resource extensions, and relative links to resources.
5. Reject path traversal, absolute resource links, duplicate skill names, malformed frontmatter, missing referenced resources, and any incomplete skill with a non-zero exit code.

The runtime registry will use Vite raw imports/globs for the validated skill files. The validator and runtime registry share the same normalized path and frontmatter rules so a successful build cannot ship a skill that the runtime cannot resolve.

## 3. Registry and Session Cache

Create a small skill registry module responsible for:

- `SkillMetadata`: skill name, description, activation mode, and available resource paths.
- `SkillDefinition`: metadata plus the raw `SKILL.md` body and bundled resource loaders.
- `listSkillMetadata()`: returns only metadata for the system prompt.
- `loadSkillBody(name)`: returns the frontmatter-stripped Markdown body.
- `readSkillResource(name, relativePath)`: returns an allowed text resource after root and extension checks.

Use the existing `conversationId` from the chat message as the cache key. A module-level map stores mandatory skill bodies for the lifetime of the service-worker process. On each `handleChatMessage` call, the orchestration layer checks the map before building the system prompt. A service-worker restart simply causes the next request to reload from the bundled registry; no persistent storage or external path is required.

The system prompt is built per `streamText` request from:

1. The existing BiliGo workflow instructions.
2. A compact metadata index for all discovered skills.
3. The cached mandatory skill bodies for the current conversation.

Autonomous skill bodies and reference resources are excluded until requested.

## 4. Model Tools

### `load_skill`

Register a generic AI SDK tool with a schema containing the skill name. It returns only the selected skill's Markdown body, without YAML frontmatter. It is available for autonomous skills and is idempotent for mandatory skills if the model explicitly names one.

### `read_skill_file`

Register a separate read-only tool with `{ skill, path }` input. It resolves only resources included in the selected skill directory. It rejects:

- absolute paths;
- `..` traversal or normalized paths outside the skill root;
- `SKILL.md` requests (use `load_skill` for that file);
- unsupported extensions, binary data, and script execution;
- resources not present in the validated bundle.

Both tools return structured success/error values rather than throwing for user/model-supplied invalid input. This allows the model to recover or answer without breaking the stream. Build-time integrity failures remain fatal.

The existing `postToolAuxiliaryMessages` default branch is sufficient: skill tools produce only the normal `tool_start` and `tool_result` timeline events. Add human-readable labels for both tools in `ChatMessage.tsx`.

## 5. Stream Integration

Refactor the current inline system prompt into a base prompt plus a `buildSystemPrompt()` function. Before the first stream for a conversation, load all mandatory bodies into the conversation cache. Then pass the constructed prompt to `streamText`.

Keep `stopWhen: isStepCount(7)`. The count is per `streamText` request and includes the initial model step, so seven steps leave room for the existing search workflow plus one autonomous skill load and one reference read before the final answer.

Update the workflow wording from "single-session tool calls" to "single-request model steps" and explain that skill metadata is available, mandatory bodies are preloaded, and references are read only when the skill requests them.

## 6. Writing Skill Content

Create `Main/.agents/skills/bili-writing-format/` with:

- `SKILL.md`: mandatory core writing rules in Simplified Chinese, including language following, concise professional tone, GFM usage, robust Chinese bold boundaries, link/table/HTML constraints, and scenario selection.
- `references/video-reply.md`: progressive video recommendation template.
- `references/clarification.md`: progressive clarification-question template.

The core file will reference these resources with relative Markdown links and instruct the model to call `read_skill_file` only when a matching scenario needs a template.

## 7. Compatibility and Trade-offs

- `.agents/skills` preserves portability with Codex and other Agent Skills-compatible hosts, while BiliGo's own loader supplies the missing runtime behavior.
- Mandatory bodies are repeated in each request's system prompt after the first load because AI SDK calls do not inherit previous system prompts. The file read/parse is cached; the context contract is explicit.
- Raw resource bundling increases extension bundle size but avoids runtime filesystem permissions and guarantees that a user with only `dist/` has all required content.
- A custom `metadata.activation` field is nested under standard `metadata` to avoid non-standard top-level frontmatter fields.

## 8. Rollback and Failure Boundaries

- If the validator or registry integration fails, revert the new skill loader files and restore the existing inline `SYSTEM_PROMPT` and `isStepCount(5)` behavior.
- Invalid skill content must stop the build before Vite emits a new distribution.
- Runtime skill read errors must remain isolated to the model tool result; existing BiliGo search errors continue through their current error path.
- No migration of persisted user data is required.

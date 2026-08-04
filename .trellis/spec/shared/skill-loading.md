# Bundled Skill Loading Contract

This contract covers BiliGo's Agent Skills-compatible packages and their browser-extension runtime.

## 1. Scope / Trigger

Apply this contract when adding or changing a skill under `Main/.agents/skills/`, the build validator, the generated registry, the background orchestration layer, or the `load_skill` / `read_skill_file` tools.

The extension must work when an end user has only the generated `Main/dist/` directory. Runtime code must not scan the host filesystem or require an external skill directory.

## 2. Signatures

Build commands:

- `npm run validate:skills` validates `Main/.agents/skills/**/SKILL.md` and regenerates `Main/src/skills/generated-skill-registry.ts`.
- `npm run build` runs `validate:skills` through `prebuild` before TypeScript and Vite emit the extension bundle.

Runtime functions:

```typescript
type SkillResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string }

function listSkillMetadata(): SkillMetadata[]
function loadSkillBody(name: string): SkillResult<string>
function readSkillResource(name: string, relativePath: string): SkillResult<string>
```

AI SDK tools expose equivalent inputs:

- `load_skill({ name: string })`
- `read_skill_file({ skill: string, path: string })`

## 3. Contracts

Skill package contract:

- Every skill directory has `SKILL.md` with YAML frontmatter followed by a non-empty Markdown body.
- `name` is lowercase kebab-case, is at most 64 characters, and equals the parent directory name.
- `description` is non-empty.
- `metadata.activation` is exactly `mandatory` or `autonomous`.
- `SKILL.md` is at most 500 lines. Each packaged resource is at most 64 KiB and must be valid UTF-8 text.
- Markdown links that point to local resources must resolve inside the same skill directory. Unreferenced text resources may remain packaged.

Prompt and cache contract:

- Every request receives skill metadata from `listSkillMetadata()`.
- Before the first `streamText` call for a `conversationId`, all mandatory bodies are loaded and cached in memory.
- Every later request rebuilds its system prompt with the cached mandatory bodies; a new `streamText` call never inherits a previous system prompt.
- Autonomous bodies and resources are excluded from the initial prompt and are returned only by their respective tools.
- `stopWhen` remains `isStepCount(7)` for each `streamText` request.

Tool response contract:

- `load_skill` returns only the frontmatter-free `SKILL.md` body.
- `read_skill_file` returns only the selected text resource and never executes it.
- Invalid model input returns `{ success: false, code, error }` to the model rather than throwing from the tool.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing or malformed frontmatter | Build fails with non-zero exit code |
| Empty `name`, `description`, or body | Build fails |
| Name does not match directory or is duplicated | Build fails |
| Invalid activation value | Build fails |
| Missing local link, traversal link, or absolute link | Build fails |
| Unsupported, binary, invalid UTF-8, or oversized resource | Build fails |
| Unknown runtime skill | `SKILL_NOT_FOUND` structured error |
| `SKILL.md` passed to `read_skill_file` | `SKILL_FILE_NOT_READABLE` structured error |
| Absolute path, scheme, backslash, NUL, or `..` path | `INVALID_RESOURCE_PATH` or `RESOURCE_PATH_TRAVERSAL` structured error |
| Missing packaged text resource | `RESOURCE_NOT_FOUND` structured error |

Build validation must finish before the generated registry is replaced. A failed validation must not leave a partially generated registry.

## 5. Good / Base / Bad Cases

- Good: `references/video-reply.md` is linked by `SKILL.md`, passes the size and UTF-8 checks, and is read with `read_skill_file({ skill: 'bili-writing-format', path: 'references/video-reply.md' })`.
- Base: the prompt contains the skill metadata and mandatory writing body, while an autonomous skill body and reference template remain absent until requested.
- Bad: `read_skill_file({ skill: 'bili-writing-format', path: '../SKILL.md' })` must return a structured traversal error and must not read a file outside the packaged skill root.

## 6. Tests Required

- Validator tests assert frontmatter parsing, directory/name matching, activation modes, duplicate names, missing links, size limits, binary rejection, and no registry overwrite after failure.
- Registry tests assert metadata-only listing, frontmatter-free body loading, exact resource loading, structured unknown-resource errors, and path restrictions.
- Stream tests assert mandatory preload occurs before `streamText`, cache reuse is keyed by conversation ID, autonomous content is absent from the initial prompt, both tools are registered, and `isStepCount(7)` is passed through.
- Build verification asserts the generated registry and skill content are present in `dist/` and `dist/manifest.json` remains a valid MV3 manifest.
- E2E verification should cover the existing video-search flow when the extension harness can mount the content script. A harness-wide toggle failure must be reported separately from skill behavior.

## 7. Wrong vs Correct

Wrong:

```typescript
const system = `${BASE_PROMPT}\n${allSkillBodies}`
```

This eagerly expands autonomous skills and reference templates into every model request.

Correct:

```typescript
const bodies = await getCachedMandatorySkillBodies(conversationId)
const system = buildSystemPrompt(bodies)
```

The prompt carries metadata and mandatory bodies only; `load_skill` and `read_skill_file` provide progressive access to autonomous content and selected resources.

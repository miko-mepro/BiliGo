# Skill Loading Research

## Scope

This note records external conventions used to design BiliGo's embedded skill loader. The BiliGo extension does not run Claude Code, Codex, or Copilot, so their discovery directories are compatibility guidance rather than runtime behavior.

## Agent Skills Open Standard

Source: https://agentskills.io/specification

- A skill is a directory containing `SKILL.md` and optional `scripts/`, `references/`, and `assets/` resources.
- `SKILL.md` uses YAML frontmatter followed by Markdown instructions.
- `name` is required, must use lowercase letters, numbers, and hyphens, and must match the parent directory name.
- `description` is required and should describe both the capability and when it should be used.
- The recommended loading model is progressive disclosure: metadata first, instructions after activation, and referenced resources only as needed.
- The specification recommends keeping the core `SKILL.md` concise (under 500 lines) and moving detailed material into references.
- `metadata` is the standard location for additional implementation-specific fields, so BiliGo's `activation` field belongs under `metadata`.

## OpenAI Codex

Source: https://developers.openai.com/codex/skills

- Codex discovers repository skills under `.agents/skills`, with user, admin, and system scopes also available.
- It initially exposes each skill's name, description, and path, then loads the full `SKILL.md` only when selected.
- Skills can be explicitly invoked or selected implicitly from the description.
- A skill directory is the authoring and local discovery unit; plugins are the distribution unit for broader reuse.

## Claude Code

Source: https://code.claude.com/docs/en/skills

- Claude Code discovers project skills under `.claude/skills/<name>/SKILL.md` and personal skills under `~/.claude/skills/`.
- Skills can be invoked by slash command or selected automatically when relevant.
- Skill bodies are loaded when used rather than placed in the initial context, and supporting files are read on demand.
- The runtime provides host-specific discovery and dynamic context injection; a standalone browser extension cannot assume those facilities.

## GitHub Copilot

Source: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills

- Copilot supports project skill roots including `.github/skills`, `.claude/skills`, and `.agents/skills`.
- It reads frontmatter metadata to decide when a skill is relevant, then injects the selected `SKILL.md` into agent context.
- Supporting scripts and references are available from the skill directory when referenced by the skill.
- Tool pre-approval is host-specific; BiliGo should not copy that behavior because its skill resources are read-only and bundled.

## BiliGo Consequences

- `Main/skills/` is not a recognized directory for the external hosts above and is not read by the BiliGo runtime.
- The Chrome extension must package resources during `npm run build`; end users only receive `dist/`.
- BiliGo therefore uses `.agents/skills` for portable authoring, validates and discovers skills at build time, and performs progressive context loading inside its own AI SDK orchestration.
- Mandatory skills are loaded by the orchestrator before the first `streamText` call for a conversation. Autonomous skills use model-facing tools. Reference files use a bounded read tool and never escape the packaged skill root.

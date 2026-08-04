# Git Conventions

> Git commit message format and branch naming conventions.

---

## Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type       | Description                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | New feature                                             |
| `fix`      | Bug fix                                                 |
| `docs`     | Documentation only                                      |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or updating tests                                |
| `chore`    | Build process, dependencies, or tooling                 |
| `style`    | Formatting, missing semicolons, etc.                    |
| `perf`     | Performance improvement                                 |

### Scopes

Scope should identify the affected area:

| Scope      | Description      |
| ---------- | ---------------- |
| `db`       | Database changes |
| `ipc`      | IPC handlers     |
| `ui`       | User interface   |
| `auth`     | Authentication   |
| `project`  | Project module   |
| `settings` | Settings module  |

### Examples

```bash
# Feature
feat(project): add project archive functionality

# Bug fix
fix(db): resolve migration timing issue

# Refactor
refactor(ipc): extract common validation logic

# Documentation
docs: update API documentation

# Chore
chore: upgrade electron to v28
```

---

## Branch Naming

```
type/description
```

### Examples

```bash
# Feature branches
feat/project-archive
feat/dark-mode-support

# Bug fix branches
fix/login-crash
fix/db-migration-order

# Refactor branches
refactor/ipc-structure
refactor/type-definitions
```

---

## Commit Best Practices

### Keep Commits Atomic

Each commit should represent one logical change:

```bash
# GOOD - Separate commits
git commit -m "feat(project): add archive button to UI"
git commit -m "feat(project): implement archive procedure"
git commit -m "test(project): add archive procedure tests"

# BAD - Mixed changes
git commit -m "add archive feature and fix some bugs"
```

### Write Clear Descriptions

```bash
# GOOD - Clear description
feat(auth): add OAuth2 login with Google

# BAD - Vague
feat: update auth
```

### Use Body for Context

```bash
git commit -m "fix(db): handle null timestamps in migration

Previous migration assumed all records had timestamps.
This caused failures when upgrading from v1.0.

Fixes #123"
```

---

## Pre-Commit Checklist

Before committing:

- [ ] Code compiles (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] Commit message follows format
- [ ] Changes are atomic

## Merge Verification

When merging in a linked worktree, resolve Git's control paths through Git
instead of assuming that `.git/` is a directory in the worktree:

```bash
MERGE_HEAD_PATH=$(git rev-parse --git-path MERGE_HEAD)
test ! -e "$MERGE_HEAD_PATH"  # after the merge commit
```

Before merging a branch that adds a path already occupied by an untracked
worktree file, preserve the existing bytes outside the repository and verify
the backup before moving the file aside. Do not delete, reset, or silently
overwrite the worktree copy.

After resolving conflicts, verify all three conditions before committing:

```bash
test -z "$(git diff --name-only --diff-filter=U)"
git merge-base --is-ancestor <pre-merge-current-tip> HEAD
git merge-base --is-ancestor <merged-branch-tip> HEAD
```

The first command proves that no unmerged paths remain; the two ancestry
checks prove that a non-fast-forward merge retained both branch histories.

---

## Pull Request Guidelines

### Title Format

Same as commit message:

```
type(scope): description
```

### Description Template

```markdown
## Summary

Brief description of changes.

## Changes

- Added X
- Fixed Y
- Refactored Z

## Testing

- [ ] Unit tests added/updated
- [ ] Manual testing done

## Screenshots

(if applicable)
```

---

## Summary

| Convention     | Format                     | Example                       |
| -------------- | -------------------------- | ----------------------------- |
| Commit message | `type(scope): description` | `feat(auth): add login`       |
| Branch name    | `type/description`         | `feat/oauth-login`            |
| Commit body    | Optional context           | Multi-line explanation        |
| PR title       | Same as commit             | `feat(auth): add OAuth login` |

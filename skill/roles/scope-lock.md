---
name: apex-forge-scope-lock
description: "Use when debugging or working on a specific module to prevent accidental edits outside the target scope. Lock edits to a directory, unlock when done."
---

# Scope Lock — Session-Scoped Edit Boundary

Restrict all file modifications to a single directory. Prevents accidental edits outside the target scope during focused work.

---

## Commands

### `apex-forge scope-lock <path>`

Lock edits to the specified directory.

1. Resolve `<path>` to an absolute path with a trailing slash.
2. Write it to `.apex/scope-lock.txt` (one line, the absolute path).
3. Announce:

```
SCOPE LOCKED: <absolute-path>/
All Edit/Write operations outside this path will be refused.
Run `apex-forge scope-unlock` to remove the boundary.
```

### `apex-forge scope-unlock`

Remove the lock.

1. If `.apex/scope-lock.txt` exists, read its content, then delete the file.
2. Announce: `SCOPE UNLOCKED (was: <path>). Edits allowed everywhere.`
3. If no lock file exists: `No scope lock is active.`

---

## Protocol — MANDATORY

Before **every** Edit or Write operation, the agent MUST:

1. Check if `.apex/scope-lock.txt` exists in the project root.
2. If it exists, read the locked path.
3. Resolve the target file to an absolute path.
4. Verify the target path starts with the locked path (prefix match with trailing `/`).
5. If outside scope:

```
BLOCKED — Edit outside scope boundary.
  Target:   <target-file>
  Boundary: <locked-path>
Skipping this change. Unlock first if this edit is intentional.
```

6. Do NOT proceed with the edit. Do NOT ask the user to override — refuse outright.
7. If inside scope: proceed normally, no message needed.

### What is checked

- **Edit tool** — `file_path` must be within the locked directory
- **Write tool** — `file_path` must be within the locked directory

### What is NOT checked

- Read, Grep, Glob, Bash — read operations are unrestricted
- Bash write commands (sed, mv, cp) are not intercepted; this is accident prevention, not a security sandbox

---

## When to Use

- **Module debugging** — lock to `src/billing/` so fixes don't leak into `src/auth/`
- **Focused refactoring** — prevent scope creep when renaming across one package
- **Security-sensitive changes** — limit blast radius during access control work
- **Unfamiliar codebase** — constrain edits while exploring to avoid collateral damage

## Notes

- The trailing `/` prevents `src/api` from matching `src/api-legacy`
- Lock persists until explicitly unlocked or the session ends
- To change the boundary, run `scope-lock` again with a new path (overwrites the previous lock)
- Nested locks are not supported — only one boundary at a time

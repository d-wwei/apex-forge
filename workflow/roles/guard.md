---
name: apex-forge-guard
description: Full safety mode — freeze edits to a directory + enable destructive command warnings
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Guard Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX GUARD ROLE ==="
apex_set_stage "guard"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_guard_start_ts=$(date +%s)
apex_telemetry_start "guard"

# ---------------------------------------------------------------------------
# State check
# ---------------------------------------------------------------------------
FREEZE_FILE=".apex/freeze-dir.txt"
GUARD_ACTIVE=false

if [ -f "$FREEZE_FILE" ]; then
  CURRENT_FREEZE=$(cat "$FREEZE_FILE")
  GUARD_ACTIVE=true
  echo "[guard] Existing freeze boundary: ${CURRENT_FREEZE}"
else
  echo "[guard] No freeze boundary active"
fi

echo "[guard] Working directory: $(pwd)"

apex_ensure_dirs
```

# Guard Role

> apex-forge / workflow / roles / guard
>
> Full safety mode. Combines `/apex-freeze` (edit restriction) and
> `/apex-careful` (destructive command warnings) into one activation.

---

## WHAT GUARD DOES

Guard mode activates two protections simultaneously:

1. **Freeze boundary** — restrict all Edit/Write operations to a specific directory
2. **Destructive command warnings** — require explicit confirmation before dangerous commands

This is the "safety on" switch for working in production-adjacent code.

---

## ACTIVATION

### Step 1: Determine the freeze directory

If the user provides a directory argument → use it.

If not, ask:
> "Which directory should edits be restricted to?"
> Common choices:
> - `src/` — only source code
> - `src/features/{name}/` — only a specific feature
> - `.` — current directory (no restriction, but destructive warnings still active)

### Step 2: Validate the directory

- Check that the path exists
- Resolve to absolute path
- Confirm with the user: "Guard will restrict edits to `{absolute_path}`. Confirm?"

### Step 3: Write freeze boundary

Write the resolved absolute path to `.apex/freeze-dir.txt`:
```
{absolute_path}
```

### Step 4: Confirm activation

```
=== GUARD MODE ACTIVE ===

  Freeze boundary: {absolute_path}
  Destructive warnings: ENABLED

  What is locked down:
  - Edit/Write operations outside {directory} will be REFUSED
  - Destructive commands (rm -rf, git reset --hard, etc.) will require confirmation
  - Force push to main/master will be BLOCKED

  To disable:
  - /apex-unfreeze  — remove edit restrictions only
  - Re-run /apex-guard with a different directory to change the boundary
```

---

## ENFORCEMENT RULES

### Edit/Write Freeze

Before ANY Edit or Write tool call, check:

1. Read `.apex/freeze-dir.txt` to get the boundary path
2. Resolve the target file path to absolute
3. Check: does the target path start with the freeze boundary?
   - YES → proceed with the operation
   - NO → **REFUSE** with explanation:

```
BLOCKED: Edit outside freeze boundary.
  Target:   {target_path}
  Boundary: {freeze_path}

  This file is outside the guarded directory.
  To edit this file, either:
  - Run /apex-unfreeze to remove restrictions
  - Run /apex-guard {new_directory} to change the boundary
```

### Destructive Command Warnings

Before executing any of these commands, show a warning:

| Command Pattern | Risk |
|----------------|------|
| `rm -rf` | Recursive file deletion |
| `rm -r` | Recursive file deletion |
| `git reset --hard` | Discards all uncommitted changes |
| `git push --force` | Overwrites remote history |
| `git push -f` | Overwrites remote history |
| `git clean -f` | Deletes untracked files |
| `git checkout -- .` | Discards working directory changes |
| `DROP TABLE` | Database table deletion |
| `DROP DATABASE` | Database deletion |
| `TRUNCATE` | Database data deletion |
| `kubectl delete` | Kubernetes resource deletion |
| `docker rm` | Container removal |
| `docker system prune` | Docker cleanup |

Warning format:
```
WARNING: Destructive command detected.

  Command:    {command}
  Risk:       {what could be lost}
  Safer alt:  {alternative approach}

  Proceed? (yes/no)
```

If user says no → suggest the safer alternative.
If user says yes → execute with the warning logged.

---

## SCOPE

Guard mode persists across the session via `.apex/freeze-dir.txt`.
Destructive command warnings are always active when this file exists.

Guard does NOT:
- Prevent reading files outside the boundary
- Block `git add`, `git commit`, `git push` (non-force)
- Interfere with running tests or build commands

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Guard mode activated with confirmed boundary. |
| **DONE_WITH_CONCERNS** | Guard activated but directory is very broad (e.g., `/`). |
| **BLOCKED** | Specified directory does not exist. |
| **NEEDS_CONTEXT** | User did not specify a directory and needs to choose. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

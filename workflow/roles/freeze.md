---
name: apex-forge-freeze
description: Restrict edit operations to a specific directory — all writes outside the boundary are refused
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Freeze Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX FREEZE ROLE ==="
apex_set_stage "freeze"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_freeze_start_ts=$(date +%s)
apex_telemetry_start "freeze"

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
FREEZE_FILE=".apex/freeze-dir.txt"

if [ -f "$FREEZE_FILE" ]; then
  CURRENT_FREEZE=$(cat "$FREEZE_FILE")
  echo "[freeze] Current freeze boundary: ${CURRENT_FREEZE}"
else
  echo "[freeze] No freeze boundary active"
fi

echo "[freeze] Working directory: $(pwd)"

apex_ensure_dirs
```

# Freeze Role

> apex-forge / workflow / roles / freeze
>
> Restrict all Edit and Write operations to a specific directory.
> Anything outside the boundary is refused.

---

## USAGE

```
/apex-freeze {directory}
```

Examples:
- `/apex-freeze src/` — only allow edits in `src/`
- `/apex-freeze src/features/auth/` — only allow edits in the auth feature
- `/apex-freeze .` — restrict to current working directory

---

## ACTIVATION

### Step 1: Accept directory argument

If a directory argument is provided → use it.
If no argument → ask: "Which directory should edits be restricted to?"

### Step 2: Validate

- Check the directory exists
- Resolve to absolute path using `realpath` or `pwd`-based resolution
- If the path does not exist → report error, do not create the freeze

### Step 3: Write freeze file

Write the absolute path to `.apex/freeze-dir.txt`:
```
/absolute/path/to/directory
```

### Step 4: Confirm

```
Freeze boundary set.

  Directory: {absolute_path}
  All Edit/Write operations outside this directory will be REFUSED.

  To remove: run /apex-unfreeze
  To change: run /apex-freeze {new_directory}
```

---

## ENFORCEMENT

Before EVERY Edit or Write tool call:

1. Check if `.apex/freeze-dir.txt` exists
2. If it exists, read the boundary path
3. Resolve the target file's absolute path
4. Check: target path starts with the boundary path?
   - YES → allow the operation
   - NO → refuse:

```
BLOCKED: File is outside the freeze boundary.
  Target:   {target_path}
  Boundary: {freeze_path}
  Run /apex-unfreeze to remove this restriction.
```

### What freeze does NOT block:
- Reading files anywhere (Read tool)
- Running shell commands (Bash tool)
- Git operations (add, commit, push)
- Creating files inside the boundary

---

## OVERWRITING AN EXISTING FREEZE

If `.apex/freeze-dir.txt` already exists:
- Show the current boundary
- Confirm: "Replace current boundary `{old}` with `{new}`?"
- On confirm → overwrite the file

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Freeze boundary written and confirmed. |
| **BLOCKED** | Directory does not exist. |
| **NEEDS_CONTEXT** | No directory specified by user. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

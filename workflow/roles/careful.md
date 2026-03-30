---
name: apex-forge-careful
description: Destructive command warnings — require explicit confirmation before dangerous operations
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Careful Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX CAREFUL ROLE ==="
apex_set_stage "careful"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_careful_start_ts=$(date +%s)
apex_telemetry_start "careful"

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
CAREFUL_FILE=".apex/careful-mode.txt"

if [ -f "$CAREFUL_FILE" ]; then
  echo "[careful] Careful mode is already active"
else
  echo "[careful] Careful mode is not yet active"
fi

echo "[careful] Working directory: $(pwd)"

apex_ensure_dirs
```

# Careful Role

> apex-forge / workflow / roles / careful
>
> Destructive command warnings. Before executing dangerous operations,
> show what could be lost and ask for explicit confirmation.

---

## ACTIVATION

Write `enabled` to `.apex/careful-mode.txt` to persist the setting.

Confirm:
```
Careful mode ENABLED.
Destructive commands will require explicit confirmation before execution.

To disable: delete .apex/careful-mode.txt
Can be combined with /apex-freeze via /apex-guard for full safety.
```

---

## DESTRUCTIVE COMMAND DETECTION

Before executing any Bash command, scan for these patterns:

### File System

| Pattern | Risk | Safer Alternative |
|---------|------|-------------------|
| `rm -rf` | Recursive deletion of files and directories | `rm -ri` (interactive) or move to trash |
| `rm -r` | Recursive deletion | `rm -ri` or list files first with `find` |
| `rm *` | Glob deletion | List matches first: `ls *`, then confirm |

### Git

| Pattern | Risk | Safer Alternative |
|---------|------|-------------------|
| `git reset --hard` | Discards ALL uncommitted changes permanently | `git stash` to save changes first |
| `git push --force` / `git push -f` | Overwrites remote history, may lose others' work | `git push --force-with-lease` |
| `git clean -f` | Deletes all untracked files | `git clean -n` (dry run) first |
| `git checkout -- .` | Discards all working directory changes | `git stash` first |
| `git branch -D` | Force-deletes a branch even if unmerged | `git branch -d` (safe delete) |
| `git rebase` (on shared branches) | Rewrites history on shared branch | Only rebase local/unshared branches |

### Database

| Pattern | Risk | Safer Alternative |
|---------|------|-------------------|
| `DROP TABLE` | Permanently deletes table and all data | Back up first: `pg_dump` / `mysqldump` |
| `DROP DATABASE` | Permanently deletes entire database | Back up first, confirm database name |
| `TRUNCATE` | Deletes all rows (no rollback in some DBs) | `DELETE FROM` with `WHERE` clause |
| `DELETE FROM` (no WHERE) | Deletes all rows | Add a `WHERE` clause or `LIMIT` |

### Infrastructure

| Pattern | Risk | Safer Alternative |
|---------|------|-------------------|
| `kubectl delete` | Removes Kubernetes resources | `kubectl delete --dry-run=client` first |
| `docker rm` | Removes containers | `docker stop` first, then confirm |
| `docker system prune` | Removes all unused Docker data | `docker system prune --dry-run` first |
| `terraform destroy` | Destroys infrastructure | `terraform plan -destroy` first |

---

## WARNING FORMAT

When a destructive command is detected, show:

```
WARNING: Destructive command detected.

  Command:     {full command}
  Risk:        {what data or state could be lost}
  Reversible:  {yes / no / partial}
  Safer alt:   {alternative command}

  Proceed? Type 'yes' to confirm, anything else to cancel.
```

### Response handling:

- **User says "yes"** → execute the command, log it
- **User says "no" or anything else** → do NOT execute, suggest the safer alternative
- **User says "skip warning" or "I know what I'm doing"** → execute and note that careful mode is still active for future commands

---

## LOGGING

When a destructive command is confirmed and executed, append to `.apex/careful-log.jsonl`:

```json
{
  "ts": "ISO-timestamp",
  "command": "rm -rf dist/",
  "risk": "Recursive deletion of build output",
  "confirmed": true,
  "user_response": "yes"
}
```

This creates an audit trail of dangerous operations.

---

## COMBINING WITH FREEZE

`/apex-guard` activates both `/apex-careful` and `/apex-freeze` together.

When used standalone, `/apex-careful` only adds destructive command warnings.
It does NOT restrict which directories can be edited.

For full protection (edit restrictions + destructive warnings), use `/apex-guard`.

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Careful mode enabled. |
| **DONE** | Careful mode was already active. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

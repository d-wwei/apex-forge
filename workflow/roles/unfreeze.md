---
name: apex-forge-unfreeze
description: Remove the freeze boundary — restore unrestricted edit access to all directories
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Unfreeze Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX UNFREEZE ROLE ==="
apex_set_stage "unfreeze"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_unfreeze_start_ts=$(date +%s)
apex_telemetry_start "unfreeze"

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
FREEZE_FILE=".apex/freeze-dir.txt"

if [ -f "$FREEZE_FILE" ]; then
  CURRENT_FREEZE=$(cat "$FREEZE_FILE")
  echo "[unfreeze] Current freeze boundary: ${CURRENT_FREEZE}"
else
  echo "[unfreeze] No freeze boundary active — nothing to remove"
fi

apex_ensure_dirs
```

# Unfreeze Role

> apex-forge / workflow / roles / unfreeze
>
> Remove the freeze boundary. Restore full edit access.

---

## ACTION

1. Check if `.apex/freeze-dir.txt` exists

2. **If it exists:**
   - Read and display the current boundary
   - Delete the file
   - Confirm:
   ```
   Edit restrictions removed.
   Previous boundary was: {path}
   All directories are now writable.
   ```

3. **If it does not exist:**
   - Report: "No freeze boundary is active. Nothing to remove."

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Freeze file deleted. Edit restrictions removed. |
| **DONE** | No freeze file existed. No action needed. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

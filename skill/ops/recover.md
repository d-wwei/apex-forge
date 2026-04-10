---
name: apex-forge-recover
description: Fix stuck state — clean stale locks, reset blocked tasks, repair corrupted state files
user-invocable: true
---

# Recover

Fix stuck or corrupted Apex Forge state.

```bash
apex recover
```

This command:
- Cleans stale task locks
- Resets tasks stuck in transitional states
- Repairs corrupted `.apex/state.json`
- Removes orphaned worktree references

Run this when:
- Tasks are stuck in `assigned` or `to_verify` with no active agent
- State file shows unexpected values
- Dashboard shows stale data
- After a crash or interrupted session

Present the output to the user. If nothing was stuck, it reports "No issues found."

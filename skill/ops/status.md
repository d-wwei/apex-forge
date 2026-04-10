---
name: apex-forge-status
description: Show current project state — stage, tasks, memory facts, session info
user-invocable: true
---

# Status

Show current Apex Forge project state.

```bash
apex status
```

For machine-readable output:

```bash
apex status --json
```

Present the output clearly. Key fields:
- **Stage**: current pipeline stage (idle, brainstorm, plan, execute, review, ship)
- **Session**: current session ID
- **Tasks**: total count and status breakdown
- **Memory**: number of stored facts

If `.apex/` does not exist, tell the user to run `/apex-forge init` first.

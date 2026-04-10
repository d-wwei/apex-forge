---
name: apex-forge-init
description: Initialize Apex Forge in the current project — creates .apex/ directory with state, tasks, and memory
user-invocable: true
---

# Init

Initialize Apex Forge in the current project.

```bash
apex init
```

If `apex` is not in PATH, use the full path:

```bash
~/.claude/skills/apex-forge/../dist/apex-forge init
```

After init, confirm by running:

```bash
apex status
```

Present the output to the user. If `.apex/` already exists, init is safe to re-run (idempotent).

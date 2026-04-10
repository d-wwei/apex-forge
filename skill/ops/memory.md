---
name: apex-forge-memory
description: Manage project memory — add facts, search, list, prune low-confidence entries
user-invocable: true
argument-hint: "[list|add|search|remove|prune|inject|curate] [args...]"
---

# Memory

Manage Apex Forge project memory. Facts are stored with confidence scores (0.0-1.0) and optional tags.

## Commands

### List facts

```bash
apex memory list
apex memory list --min 0.7    # only facts with confidence >= 0.7
```

### Add a fact

```bash
apex memory add "FACT" CONFIDENCE [TAGS...]
```

Example: `apex memory add "API uses JWT for auth" 0.9 auth api`

### Search facts

```bash
apex memory search "QUERY"
```

### Remove a fact

```bash
apex memory remove FACT_ID
```

### Prune low-confidence facts

```bash
apex memory prune
```

Removes facts below the confidence threshold.

### Inject into context

```bash
apex memory inject
```

Outputs all facts as XML for prompt injection. Use when starting a new session to restore project context.

### Auto-curate

```bash
apex memory curate
```

Auto-extracts facts from recent activity (git log, task history).

## Argument routing

Parse the user's command and run the corresponding `apex memory` subcommand. If no argument given, default to `apex memory list`.

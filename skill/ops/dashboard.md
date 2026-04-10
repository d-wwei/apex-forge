---
name: apex-forge-dashboard
description: Start the visual dashboard for this project, or the Hub to view all projects
user-invocable: true
argument-hint: "[hub]"
---

# Dashboard

Start the Apex Forge visual dashboard.

## Single project dashboard

```bash
apex dashboard &
```

Opens a web UI at an auto-assigned port (deterministic per project path). The URL is printed on startup.

After starting, open the URL in the user's browser:

```bash
open http://localhost:<PORT>
```

## Hub (all projects)

```bash
apex dashboard hub &
```

Fixed at http://localhost:3456. Aggregates all active project dashboards via `~/.apex-forge/registry.json`.

```bash
open http://localhost:3456
```

## Argument routing

- `/apex-forge dashboard` → start project dashboard
- `/apex-forge dashboard hub` → start hub

## Notes

- Each project dashboard auto-registers with the Hub on start, auto-unregisters on exit.
- Same project always gets the same port (path-based hash).
- Run `apex dashboard` in multiple project directories to see them all in the Hub.

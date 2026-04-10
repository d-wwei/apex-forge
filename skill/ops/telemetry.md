---
name: apex-forge-telemetry
description: View usage analytics — skill runs, durations, outcomes
user-invocable: true
argument-hint: "[report|start|end] [args...]"
---

# Telemetry

View and manage Apex Forge usage analytics.

## Commands

### View report

```bash
apex telemetry report
```

Shows skill usage statistics: which skills ran, how long, success/error/abort rates.

### Manual tracking (for skill authors)

```bash
apex telemetry start SKILL_NAME    # start tracking a skill run
apex telemetry end success         # end tracking (success|error|abort)
```

## Argument routing

Parse the user's command. If no argument given, default to `apex telemetry report`.

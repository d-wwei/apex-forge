# Background Companion Skill Update

**Date**: 2026-04-12
**Category**: feature
**Tags**: companion-skills, update, sub-agent, stage-aware, process-isolation

---

## Context

ApexForge relies on 9 companion skills (tasteful-frontend, systematic-debugging, etc.) installed via git clone. When a companion skill releases a major update (e.g., tasteful-frontend v1 → v3.1), there was no mechanism to detect or apply it. Users had to manually run `install.sh update`. The session-start hook only checked for *missing* skills, not *outdated* ones.

## Problem

1. No automatic update detection for companion skills.
2. Version pinning in `bindings.yaml` (`>=1.0.0`) was meaningless — always satisfied, never enforced.
3. Tag pins in `install.sh` (`v1.0.0`) prevented fresh installs from getting latest versions.
4. No guidance mechanism after updates — agents didn't know about new capabilities.

## What Was Tried

**First attempt**: Main agent reads `update-check.json` during init, decides whether to spawn a sub-agent. **Problem**: Update logic in the main agent — if JSON is malformed or check process fails, main agent is contaminated. User feedback: "All update logic should be in the sub-agent."

**Second attempt**: Main agent spawns sub-agent unconditionally, ignores all notifications. **Problem**: Too conservative — if a skill updates between brainstorm and execute, the agent would still use the old version. User feedback: "As long as it doesn't interrupt the current stage, use the new version."

## Solution

Three-layer architecture:

1. **Shell layer** (`install.sh check`): Fast git fetch + compare HEAD vs upstream for each companion. Writes `.apex/update-check.json`. Injection-safe (data piped through stdin, not interpolated into Python source). Guards for missing python3/git/network.

2. **Hook layer** (`session-start`): Fires `install.sh check` in background (`nohup ... &`). Non-blocking.

3. **Protocol layer** (`SKILL.md`): Main agent spawns a background sub-agent unconditionally. Sub-agent handles everything: read JSON, run updates, write upgrade notes. Stage-aware adoption: current stage not interrupted; new versions adopted at next stage boundary via `.apex/upgrade-notes/` mechanism.

## Why It Worked

The key insight came from the user in three rounds of feedback:

1. **Process isolation**: Sub-agent owns all update logic. Main agent never touches it. If sub-agent fails, main agent is unaffected.
2. **Stage-boundary adoption**: Don't ignore updates entirely, but don't interrupt either. Use new version at the natural stage transition — this gives better results without disruption.
3. **Lazy communication**: Information flows through files on disk (upgrade-notes), not through agent notifications. This decouples the timing of "update complete" from "agent needs to know."

## Generalized Pattern: Stage-Boundary Adoption

When a background process produces results that could improve a multi-phase pipeline:
- **Never interrupt** the current phase.
- **Always adopt** at the next phase boundary.
- Communication between background worker and main pipeline should be **file-based** (lazy, pull-based), not **event-based** (eager, push-based).

This pattern applies beyond skill updates — any background improvement (model updates, config changes, new data) can be adopted at stage boundaries.

## Prevention

- Version constraints removed entirely. "Always latest" is the policy.
- Background check runs every session. No manual intervention needed.
- Upgrade notes ensure agents know about new capabilities.

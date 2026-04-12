---
title: "Multi-Agent Orchestration v1"
category: feature
date: 2026-04-12
updated: 2026-04-12
tags: [orchestration, adapter, multi-agent, cross-model, persona, worktree, isolation, validation]
version: 0.2.1
---

# Multi-Agent Orchestration v1

## Context

apex-forge had an orchestrator skeleton (290 lines) that could spawn `claude --print` child
processes but lacked: pluggable agent support, workspace isolation, retry, structured results,
cross-model dispatch, and review personas. The ARCHITECTURE.md RFC (1035 lines) described
the target state but 80% was unimplemented.

The redesign was triggered by a need to support heterogeneous agents (Claude + Codex + Gemini)
for eliminating single-model blind spots, not just for parallel speed.

## Problem

1. Agent spawning was hardcoded to one CLI command
2. No workspace isolation — parallel agents would conflict
3. No retry or failure handling
4. No structured result collection
5. No mechanism for cross-model review (Mode 2)
6. No persona system for multi-perspective evaluation

## What Was Tried

- **Option A (cmux-based)**: Rejected because apex-forge must work without external dependencies
- **Option C (HTTP server)**: Rejected as too heavy for a CLI tool
- **Option B (improve orchestrator)**: Evolved into Protocol + Adapter architecture

Key pivot: separating "what agents do" (protocol) from "how agents run" (adapter).

## Solution

### Architecture: Protocol + Adapter + Skill

Three core concepts + one auxiliary:
- **Task**: What to do
- **Skill**: How to do it (process, format, gates)
- **Adapter**: What runtime to use (RuntimeAdapter interface)
- **Persona** (auxiliary): What perspective to evaluate from (YAML files referenced by Skills)

### Two Dispatch Modes

- **Mode 1 (parallel)**: Same adapter, different tasks → speed
- **Mode 2 (cross-model)**: Different adapters, same task → blind spot elimination

Driven by `dispatch_mode` field in registry templates.

### Key Implementation Decisions

1. RuntimeAdapter as TypeScript interface (not abstract class) — lighter, testable with mocks
2. One adapter file per agent type — each CLI has unique invocation patterns
3. Persona files separate from Skills — reusable across multiple Skills
4. Task Router inside orchestrator, not separate module — logic is <100 lines
5. Event sourcing contract preserved — all mutations through appendEvent + rebuildAndCache

## Why It Worked

The Protocol + Adapter separation was the critical insight. It answered three constraints
simultaneously:
- No mandatory external tools (adapter layer provides graceful degradation)
- Support multiple agent types (each gets its own adapter)
- Core value stays in protocol layer (compounds over time)

Without this separation, we would have been forced to choose between cmux dependency
(powerful but restrictive) and bare spawn (universal but weak).

## Generalized Pattern

> **Protocol-Adapter Separation for Heterogeneous Dependencies**
>
> When a system needs to orchestrate multiple external tools but cannot mandate any
> specific one, split into:
> - **Protocol layer**: Defines WHAT to do (task decomposition, validation criteria,
>   evidence requirements). This is where domain knowledge lives and compounds.
> - **Adapter layer**: Defines HOW to do it (process spawning, output parsing, session
>   management). This is infrastructure that can be swapped.
>
> The protocol layer should be rich enough to be valuable on its own. The adapter layer
> should be thin enough that adding a new adapter is a 100-line exercise.
>
> Apply when: orchestrating heterogeneous external tools, supporting multiple platforms,
> building systems where the "how" changes faster than the "what."

## v0.2.1 Update: End-to-End Isolation & Validation (2026-04-12)

### Context

v0.2.0 established the Protocol+Adapter architecture but could not run end-to-end.
Five last-mile problems blocked production use: agents sharing a git workspace,
agents running in the wrong directory, agents lacking tool permissions, success
determined only by exit code, and no integration tests proving the full flow.

### What Was Tried

1. **Git worktree isolation**: `git worktree add` per task, with fallback to `mkdirSync`
   when not in a git repo. Cleanup via `git worktree remove` with `.git` file detection
   to distinguish worktrees from plain directories. → Worked.

2. **cwd binding**: Added `cwd?: string` to `AdapterConfig` interface; all 3 adapters
   (Claude, Codex, Gemini) pass it through to `spawn()`. Code review caught that the
   retry path and `ClaudeAdapter.resume()` were missing this — a latent production bug
   that would have sent retried agents to the wrong directory. → Fixed.

3. **Permission pre-config**: Considered `--dangerously-skip-permissions` (rejected: too
   broad). Instead, `writePermissionConfig()` generates `.claude/settings.json` in each
   workspace with a curated tool allowlist (Read, Write, Edit, Bash, Glob, Grep, Agent).
   → Cleaner and auditable.

4. **Result validation**: Three-tier check: exit code → `output/result.json` existence →
   JSON structure (must contain `verdict` field). Exit 0 without valid result.json is
   "partial" not "success", triggering retry. → Catches silent agent failures.

5. **E2E tests**: 4 scenarios using `sh -c` as mock agents (no real API calls): parallel
   dispatch, A→B dependency chain, retry on failure, cross-model synthesis. Uses `/tmp`
   to avoid `.apex/` conflicts with other test suites. → 100% pass rate.

### Key Insight

> **Process Isolation Triad**: When an orchestrator spawns child processes, three concerns
> must be solved simultaneously: (1) filesystem isolation (worktree/container), (2) working
> directory binding (cwd), (3) permission pre-granting. Missing any one renders the other
> two useless. This is structurally isomorphic to container isolation (namespace + cgroup +
> seccomp) — the domain is different but the pattern is identical.

### Code Review Value

The multi-persona review stage caught 2 critical bugs (retry cwd, resume cwd) and 4
important issues (cleanup detection, silent fallback logging, partial-vs-failure retry
semantics, adapter-specific permission gating). These were not caught by TDD because the
unit tests exercised each component in isolation but not the retry-with-workspace flow.
This confirms: TDD catches structural errors; review catches integration assumptions.

## Prevention

- When designing orchestration, start with the adapter interface, not the specific tool.
  Define the contract first, implement adapters second.
- Review stage should always check: "Is Mode 2 dispatch implemented for review tasks?"
  Cross-model review is the core differentiator, not parallel speed.
- Don't build workspace isolation last — it's a precondition for correctness, not an enhancement.
- **New (v0.2.1)**: Every code path that calls `adapter.spawn()` must pass `cwd`. Grep for
  `adapter.spawn(` and verify `cwd` is present in the config argument. Retry and resume paths
  are the most commonly missed.
- **New (v0.2.1)**: "Exit 0 = success" is a dangerous assumption for AI agents. Always validate
  output structure, not just process exit code.

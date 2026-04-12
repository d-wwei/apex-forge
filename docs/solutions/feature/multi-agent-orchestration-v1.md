---
title: "Multi-Agent Orchestration v1"
category: feature
date: 2026-04-12
tags: [orchestration, adapter, multi-agent, cross-model, persona]
version: 0.2.0
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

## Prevention

- When designing orchestration, start with the adapter interface, not the specific tool.
  Define the contract first, implement adapters second.
- Review stage should always check: "Is Mode 2 dispatch implemented for review tasks?"
  Cross-model review is the core differentiator, not parallel speed.
- Don't build workspace isolation last — it's a precondition for correctness, not an enhancement.

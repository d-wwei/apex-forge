---
title: Fix Protocol Init Skip — L1 Exemption + Hook Init Detection
scope: Lightweight
status: approved
created: 2026-04-17
approved_by: user (direct request)
---

## Problem Statement

Agent invokes apex-forge skill but skips pipeline initialization (Dashboard Gate, `apex init`, `apex stage set brainstorm`). Root cause: cognitive-kernel L1 output protocol fires unconditionally on "proposing" scenarios, overriding apex-forge's "initialize pipeline first" requirement. Secondary cause: no hook enforces initialization.

## Constraints

- [已验证] cognitive-kernel L1 Step 0 at `/Users/admin/.cognitive-kernel/cognitive-kernel.md:14-31` has no pipeline-awareness clause.
- [已验证] PostToolUse hook `apex-forge-skill-trace.sh` fires after Skill tool — can detect apex-forge was loaded.
- [已验证] cognitive-kernel.md header says "请勿手动编辑" but user has authorized this change.
- L1 exemption must not weaken L1 for non-pipeline scenarios.

## Acceptance Criteria

1. cognitive-kernel L1 Step 0 has a new exemption: when apex-forge pipeline is active but not initialized, the agent must complete pipeline initialization before applying the proposing template.
2. PostToolUse hook detects when Skill tool loads apex-forge and `.apex/state.json` stage is `idle` or missing → injects reminder to run Dashboard Gate and `apex init`.
3. Existing L1 behavior unchanged for non-apex-forge scenarios.

## Solution Shape

- Path 1: Add clause to cognitive-kernel L1 Step 0 防绕过规则 section
- Path 2: Add apex-forge Skill detection to PostToolUse hook

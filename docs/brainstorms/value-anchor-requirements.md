---
title: Strategy 1 — Value Anchor in SKILL.md
scope: Lightweight
status: approved
created: 2026-04-16
approved_by: user (pre-approved in task specification)
---

## Problem Statement

Agent optimizes for "shortest path through gate" (Goodhart effect) rather than producing high-quality artifacts. Need a value anchor at the top of SKILL.md to recalibrate the agent's objective function before any rules are processed.

## Approaches

1. **Add 3 value-anchor sentences before Dashboard Gate** — under 100 words, establishes quality over speed as the primary metric.
2. **Do nothing** — rely on existing gate checks. Rejected because gates check form not substance.

## Acceptance Criteria

1. Three sentences are present in SKILL.md between the `# Apex Forge` heading and the `## Dashboard Gate` section.
2. Total word count of the insertion is under 100 words.
3. The sentences establish: (a) value = production usability not speed, (b) empty artifacts = zero value, (c) artifacts must be self-contained for independent judgment.

## Constraints

- Must not disrupt any existing section anchors or regex patterns used by hooks.
- Must be the first substantive content after the title line.

## Solution Shape

Insert a `## Value Anchor` section (or plain paragraph block) between line 14 and line 16 of SKILL.md with the 3 specified sentences.

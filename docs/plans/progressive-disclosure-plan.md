---
title: Strategy 2 — Progressive Disclosure Plan
scope: Standard
status: approved
created: 2026-04-16
source: docs/brainstorms/progressive-disclosure-requirements.md
tasks: 8
complexity: medium
---

## Problem Frame

SKILL.md (380 lines) and 6 stage files (1890 lines total) exceed LLM attention capacity. Restructure into 3-layer architecture: skeleton → key requirements → full details.

## Decision Log

| Decision | Rationale | Rejected |
|----------|-----------|----------|
| Create ~15 detail files (not 20) | Consolidate small moves into fewer files to reduce nav overhead | 20 granular files — too many for agent to navigate |
| Keep exit gate tables in main files | Gates reference section headings in output artifacts, not stage files — but keeping gate tables helps agent know what's checked | Moving gates to details — agent skips them |
| Accept plan.md at ~100 lines (over 80 target) | Already lean; forcing <80 loses essential required-elements table | Aggressive trimming of plan.md |
| Consolidate all anti-rationalization tables into one detail file | Reduces duplication, single reference point | Per-stage anti-rationalization files |

## File Manifest

### Modified files
| Path | Action |
|------|--------|
| `skill/SKILL.md` | Slim from 380 to <200 lines |
| `skill/stages/brainstorm.md` | Slim from 411 to <100 lines |
| `skill/stages/plan.md` | Slim from 179 to <120 lines |
| `skill/stages/execute.md` | Slim from 263 to <100 lines |
| `skill/stages/review.md` | Slim from 208 to <100 lines |
| `skill/stages/ship.md` | Slim from 488 to <120 lines |
| `skill/stages/compound.md` | Slim from 341 to <100 lines |

### New files (details/)
| Path | Contents |
|------|----------|
| `skill/details/session-resume.md` | Task state reconciliation + background update check + upgrade notes |
| `skill/details/stage-bypass-rules.md` | Explicit stage command bypass rationale + invalid rationalizations |
| `skill/details/pipeline-architecture.md` | Backbone + sidecar model, stage gates SubAgent tables, confidence aggregation |
| `skill/details/phase-violations.md` | Phase violation table + escalation ladder L3 checklist |
| `skill/details/brainstorm-checklist.md` | Full 9-step checklist + multi-issue protocol + roadmap context algorithm |
| `skill/details/brainstorm-anti-patterns.md` | All anti-rationalization tables (consolidated from all stages) |
| `skill/details/brainstorm-decisions-log.md` | Running decisions log format + rules |
| `skill/details/plan-template.md` | Plan artifact doc structure + required elements |
| `skill/details/execute-dispatch.md` | Trivial/Small/Large dispatch strategies + TDD rationalization counters |
| `skill/details/execute-skill-dispatch.md` | Execute-stage skill dispatch flow + invocation trace |
| `skill/details/review-personas.md` | Full persona descriptions + adversarial reviewer techniques |
| `skill/details/review-skill-dispatch.md` | Review skill dispatch flow + design-baseline 2-phase |
| `skill/details/ship-sequence.md` | Pre-flight checks (full scripts) + README/metadata + CI check + iteration summary |
| `skill/details/compound-template.md` | Solution doc template + memory write procedure + completion options |

### Test files
No new test files — this is documentation restructuring. Verification via existing gate tests.

## Task Decomposition

| ID | Description | Files | Complexity | Deps | AC |
|----|-------------|-------|------------|------|-----|
| T1 | Slim SKILL.md: move 8 sections to 4 detail files, delete Tier-Based duplicate | `skill/SKILL.md`, `skill/details/session-resume.md`, `skill/details/stage-bypass-rules.md`, `skill/details/pipeline-architecture.md`, `skill/details/phase-violations.md` | medium | — | AC1 |
| T2 | Slim brainstorm.md: move 5 sections to 3 detail files | `skill/stages/brainstorm.md`, `skill/details/brainstorm-checklist.md`, `skill/details/brainstorm-anti-patterns.md`, `skill/details/brainstorm-decisions-log.md` | medium | — | AC2, AC3, AC4 |
| T3 | Slim plan.md: move artifact template section | `skill/stages/plan.md`, `skill/details/plan-template.md` | small | — | AC2, AC3, AC4 |
| T4 | Slim execute.md: move dispatch + skill dispatch sections | `skill/stages/execute.md`, `skill/details/execute-dispatch.md`, `skill/details/execute-skill-dispatch.md` | medium | — | AC2, AC3, AC4 |
| T5 | Slim review.md: move personas + skill dispatch | `skill/stages/review.md`, `skill/details/review-personas.md`, `skill/details/review-skill-dispatch.md` | medium | — | AC2, AC3, AC4 |
| T6 | Slim ship.md: move pre-flight + sequence + CI sections | `skill/stages/ship.md`, `skill/details/ship-sequence.md` | large | — | AC2, AC3, AC4 |
| T7 | Slim compound.md: move template + memory + completion sections | `skill/stages/compound.md`, `skill/details/compound-template.md` | medium | — | AC2, AC3, AC4 |
| T8 | Verification: run all tests, check line counts, verify gate checks | — | small | T1-T7 | AC5, AC6, AC7 |

## Test Plan

| AC | Scenario | Verification |
|----|----------|-------------|
| AC1 | Given SKILL.md after edit, when counting lines, then < 200 | `wc -l skill/SKILL.md` |
| AC2 | Given each stage file, when counting lines, then < 120 | `wc -l skill/stages/*.md` |
| AC3 | Given `skill/details/`, when listing files, then detail files exist | `ls skill/details/` |
| AC4 | Given each stage file, when searching for "details/", then pointers exist | `grep -l "details/" skill/stages/*.md` |
| AC5 | Given exit gates, when running `apex stage complete` (simulated), then structural checks pass | Manual check: headings preserved |
| AC6 | Given test suite, when running tests, then all pass | `bun test src/__tests__/*.test.ts` |
| AC7 | Given all content, when comparing old vs new, then no information lost | Diff review |

## Dependency Graph

T1 through T7 are independent (different files). T8 depends on all.
```
T1 ─┐
T2 ─┤
T3 ─┤
T4 ─┼─→ T8 (verification)
T5 ─┤
T6 ─┤
T7 ─┘
```

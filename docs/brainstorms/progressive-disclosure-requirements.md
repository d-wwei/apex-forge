---
title: Strategy 2 — Progressive Disclosure Document Restructure
scope: Standard
status: approved
created: 2026-04-16
approved_by: user (pre-approved in task specification)
---

## Problem Statement

SKILL.md (~380 lines) and 6 stage files (179-488 lines each, 1890 total) exceed LLM attention capacity. Agent compliance rate drops exponentially with instruction count. Need a 3-layer architecture: skeleton → key requirements → full details.

## Constraints

- [已验证] SKILL.md is symlinked from `~/.claude/skills/apex-forge -> skill/`, changes are live immediately.
- [已验证] Hooks (`apex-forge-gate.sh`, `apex-forge-skill-trace.sh`) parse `.apex/state.json`, not SKILL.md content — safe to restructure.
- [已验证] Exit gates reference section headings and frontmatter fields — must preserve these anchors.
- `plan.md` at 179 lines is already lean; may not hit <80 target but should still be trimmed.
- Details files must be self-contained (readable independently, not fragments).

## Approaches

1. **3-layer progressive disclosure** (chosen) — Slim main files to skeleton, create `details/` directory with full content, add "→ See details/{file}.md" pointers. Agent reads skeleton on every invocation, details only when executing that specific step.
2. **Single-file compression** — Just shorten everything in place without moving content. Rejected: loses information needed for complex tasks.
3. **Do nothing** — Keep current structure. Rejected: root cause of agent laziness identified.

## Acceptance Criteria

1. SKILL.md is under 200 lines after restructuring.
2. Each stage file (brainstorm, plan, execute, review, ship, compound) is under 120 lines. (80-line target is aspirational; some files with essential tables may need 80-120.)
3. A `skill/details/` directory exists with detail files covering all moved content.
4. Each stage file has "→ See details/{file}.md" pointers at appropriate locations.
5. All existing exit gate structural checks (S1-S9 per stage) continue to pass — section headings and frontmatter fields are preserved.
6. Existing tests pass: `bun test src/__tests__/ship-gate.test.ts src/__tests__/stage-gates.test.ts src/__tests__/pretooluse-gate.test.ts src/__tests__/skip-gate-enforcement.test.ts --timeout 30000`.
7. No information is lost — all content either stays in the main file or is moved to a details file.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Exit gate checks break due to moved sections | Medium | High | Preserve all headings that gates scan for |
| Agent stops reading details when needed | Medium | Medium | Pointers in skeleton are imperative ("MUST read") |
| 20 details files create nav overhead | Low | Low | Naming convention matches stage + topic |

## Dependencies

- Strategy 1 (value anchor) must be committed first — it modifies SKILL.md. [已验证: committed as f704be4]

## Solution Shape

Create ~20 `details/` files. For each main file:
1. Identify KEEP sections (flow skeleton, tables, gates)
2. Move MOVE sections to `details/{stage}-{topic}.md`
3. Insert "→ See details/{file}.md for full {description}" pointer
4. Verify section headings still present for gate checks

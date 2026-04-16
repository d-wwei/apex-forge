---
title: Strategy 3 — Do-Axis Automation
scope: Standard
status: approved
created: 2026-04-16
approved_by: user (pre-approved in task specification)
---

## Problem Statement

Agent must manually execute mechanical steps (checkpoints, template creation, reading requirements). These steps are Think-axis tasks disguised as Do-axis tasks — they should be automated, freeing agent attention for content-producing work.

## Constraints

- [已验证] PostToolUse hook (`apex-forge-skill-trace.sh`) is 37 lines, filters on `tool_name == "Skill"`. Adding AskUserQuestion detection requires a new branch at line 10.
- [已验证] CLI `stage set` handler is at `src/cli.ts:568-578`. Output currently prints stage name + mandatory read warning.
- [已验证] PreToolUse hook (`apex-forge-gate.sh`) is 209 lines. Rule 1 (lines 123-183) handles git ops in ship stage. Post-commit checkpoint check would go after line 149.
- [已验证] Stage files are now slimmed (Strategy 2). Key requirements must be extracted from the slimmed versions.
- Must rebuild after CLI changes: `bun build src/cli.ts --outfile dist/apex-forge --target node`
- All existing tests must continue to pass.

## Approaches

1. **Implement all 4 automations** (chosen) — auto-checkpoint, artifact templates, inline requirements, post-commit validation
2. **Only inline requirements** — lowest risk, highest impact on agent attention. Rejected: user specified all 4.

## Acceptance Criteria

1. PostToolUse hook detects `AskUserQuestion` tool calls during ship stage and auto-records checkpoint.
2. `apex stage set brainstorm` auto-creates `docs/brainstorms/{project}-requirements.md` with frontmatter skeleton if no artifact exists.
3. `apex stage set plan` auto-creates `docs/plans/{project}-plan.md` with frontmatter skeleton.
4. `apex stage set review` auto-creates `docs/reviews/{project}-review.md` with frontmatter skeleton.
5. `apex stage set {stage}` prints 3-5 key requirements inline (extracted from stage file or hardcoded).
6. All existing tests pass after changes.
7. Build succeeds: `bun build src/cli.ts --outfile dist/apex-forge --target node`

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Hook breaks existing PostToolUse flow | Medium | High | Test with manual tool calls |
| Template creation conflicts with existing artifacts | Low | Medium | Check if file exists first |
| Inline requirements become stale when stage files change | Medium | Medium | Read from stage files dynamically, or hardcode with version comments |

## Dependencies

- Strategy 2 (progressive disclosure) must be committed — stage files are slimmed. [已验证: committed as 722469a]

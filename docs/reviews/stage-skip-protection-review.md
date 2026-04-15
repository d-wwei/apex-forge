# Stage-Skip Protection — Review

**Status: DONE**

## Summary

Two-layer fix for agents skipping stage file reading:
1. CLI `apex stage set` now prints `⚠ MANDATORY: Read stages/{stage}.md` for non-idle stages
2. SKILL.md Phase Discipline now has "Stage File Reading Rule (HARD GATE)" section

## Security Reviewer
No security findings. Changes are console output + documentation only.

## Correctness Reviewer

### Finding: P2 — Raw input vs state-returned value (RESOLVED)
- **File**: `src/cli.ts:542`
- **Issue**: Originally used `name` (raw user input) instead of `st.current_stage` for comparison
- **Fix**: Changed to `st.current_stage` — resolved in review

## Spec Compliance Reviewer
- Plan called for CLI reminder + SKILL.md hard rule → both delivered
- Tests cover all 6 stages + idle exemption → matches spec

## Adversarial Reviewer
- **Assumption violation**: Agent could still ignore the CLI reminder. True, but this is defense-in-depth alongside the SKILL.md rule. The CLI reminder is push-based (appears without agent action), reducing the probability of skip.
- **Composition failure**: If `setStage` someday normalizes stage names differently than the stage file names → reminder would point to wrong file. Mitigated by using `st.current_stage` (the normalized value).

## Verification Evidence
- `bun test src/__tests__/cli.test.ts` — 13/13 pass
- Manual verification: `apex stage set review` now prints `⚠ MANDATORY: Read stages/review.md before proceeding`

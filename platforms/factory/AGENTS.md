# Apex Forge Skills — Factory Droid

Available skills for Factory agents. Each skill maps to a protocol, stage, or role document.
Factory-specific: `user-invocable` and `disable-model-invocation` flags control access.

## Core Protocol

- **apex**: protocol/SKILL.md
  Core execution protocol — auto-activates on every session.
  `user-invocable: true`

## Protocol Subskills

- **apex-round**: protocol/round-based-execution.md
  PDCA round-based execution — structured iteration for Tier 2 tasks.
  `user-invocable: true`

- **apex-wave**: protocol/wave-based-delivery.md
  Wave-based delivery — project-scale cross-session work for Tier 3 tasks.
  `user-invocable: true`

## Workflow Stages

- **apex-brainstorm**: workflow/stages/brainstorm.md
  Requirements exploration with hard gate — no code before approval.
  `user-invocable: true`

- **apex-plan**: workflow/stages/plan.md
  Convert requirements into execution plan with file paths, tasks, and tests.
  `user-invocable: true`

- **apex-execute**: workflow/stages/execute.md
  TDD-first implementation with dispatch strategy based on task complexity.
  `user-invocable: true`

- **apex-review**: workflow/stages/review.md
  Multi-persona quality gate — security, correctness, spec compliance.
  `user-invocable: true`

- **apex-ship**: workflow/stages/ship.md
  Package and deliver — tests, version bump, changelog, commit, PR.
  `user-invocable: true`
  `disable-model-invocation: true`

- **apex-compound**: workflow/stages/compound.md
  Knowledge extraction — capture solutions for future reuse.
  `user-invocable: true`

- **apex-verify**: workflow/stages/verify.md
  Evidence gate — no success claims without proof.
  `user-invocable: true`

## Workflow Roles

- **apex-design-review**: workflow/roles/design-review.md
  Visual QA and design polish — screenshot-driven fix-verify loops.
  `user-invocable: true`

- **apex-security-audit**: workflow/roles/security-audit.md
  Chief Security Officer mode — infrastructure-first security audit.
  `user-invocable: true`

- **apex-plan-ceo-review**: workflow/roles/plan-ceo-review.md
  Strategic plan review — CEO/founder evaluating ambition and scope.
  `user-invocable: true`

- **apex-plan-eng-review**: workflow/roles/plan-eng-review.md
  Engineering architecture review — senior eng manager locking in execution.
  `user-invocable: true`

- **apex-browse**: workflow/roles/browse.md
  Browser interaction — navigate, read, interact, screenshot.
  `user-invocable: true`

- **apex-qa**: workflow/roles/qa.md
  Systematic QA testing with tiered depth, browser-aware verification, and bug-fix loop.
  `user-invocable: true`

- **apex-investigate**: workflow/roles/investigate.md
  Systematic debugging with root-cause discipline — no fixes without understanding why.
  `user-invocable: true`

- **apex-code-review**: workflow/roles/code-review.md
  Multi-pass code review — correctness, security, performance, maintainability.
  `user-invocable: true`

- **apex-office-hours**: workflow/roles/office-hours.md
  Guided learning and explanation — teach concepts in the context of the codebase.
  `user-invocable: true`

- **apex-retro**: workflow/roles/retro.md
  Retrospective analysis — extract lessons, patterns, and improvements from completed work.
  `user-invocable: true`

- **apex-canary**: workflow/roles/canary.md
  Post-deploy canary monitoring — screenshots, error detection, performance regression checks.
  `user-invocable: true`
  `disable-model-invocation: true`

## Sensitive Skills (model-invocation disabled)

The following skills have `disable-model-invocation: true` — they can only be triggered
by explicit user invocation, not by autonomous model decisions:

| Skill | Reason |
|---|---|
| apex-ship | Deploys code, creates commits/PRs — must be user-initiated |
| apex-canary | Interacts with production systems — must be user-initiated |

> **Note**: `apex-guard`, `apex-careful`, `apex-freeze`, `apex-unfreeze`, and
> `apex-land-and-deploy` are reserved skill names. When these roles are implemented,
> they MUST also carry `disable-model-invocation: true`.

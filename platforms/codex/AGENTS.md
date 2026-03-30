# Apex Forge Skills

Available skills for Codex agents. Each skill maps to a protocol, stage, or role document.

## Core Protocol

- **apex**: protocol/SKILL.md
  Core execution protocol — auto-activates on every session. Complexity router, phase discipline, TDD, evidence grading, assumption tracking, escalation ladder, verification gate.

## Protocol Subskills

- **apex-round**: protocol/round-based-execution.md
  PDCA round-based execution — structured iteration for Tier 2 tasks. Named round types (clarify, explore, hypothesis, planning, execution, verification, hardening, recovery) with entry/exit criteria.

- **apex-wave**: protocol/wave-based-delivery.md
  Wave-based delivery — project-scale cross-session work for Tier 3 tasks. Persistent state in `.apex/waves/`, assumption registry, decision log, handoff protocol.

## Workflow Stages

- **apex-brainstorm**: workflow/stages/brainstorm.md
  Requirements exploration with hard gate — no code before approval.

- **apex-plan**: workflow/stages/plan.md
  Convert requirements into execution plan with file paths, tasks, and tests.

- **apex-execute**: workflow/stages/execute.md
  TDD-first implementation with dispatch strategy based on task complexity.

- **apex-review**: workflow/stages/review.md
  Multi-persona quality gate — security, correctness, spec compliance.

- **apex-ship**: workflow/stages/ship.md
  Package and deliver — tests, version bump, changelog, commit, PR.

- **apex-compound**: workflow/stages/compound.md
  Knowledge extraction — capture solutions for future reuse.

- **apex-verify**: workflow/stages/verify.md
  Evidence gate — no success claims without proof.

## Workflow Roles

- **apex-design-review**: workflow/roles/design-review.md
  Visual QA and design polish — screenshot-driven fix-verify loops.

- **apex-security-audit**: workflow/roles/security-audit.md
  Chief Security Officer mode — infrastructure-first security audit.

- **apex-plan-ceo-review**: workflow/roles/plan-ceo-review.md
  Strategic plan review — CEO/founder evaluating ambition and scope.

- **apex-plan-eng-review**: workflow/roles/plan-eng-review.md
  Engineering architecture review — senior eng manager locking in execution.

- **apex-browse**: workflow/roles/browse.md
  Browser interaction — navigate, read, interact, screenshot.

- **apex-qa**: workflow/roles/qa.md
  Systematic QA testing with tiered depth, browser-aware verification, and bug-fix loop.

- **apex-investigate**: workflow/roles/investigate.md
  Systematic debugging with root-cause discipline — no fixes without understanding why.

- **apex-code-review**: workflow/roles/code-review.md
  Multi-pass code review — correctness, security, performance, maintainability.

- **apex-office-hours**: workflow/roles/office-hours.md
  Guided learning and explanation — teach concepts in the context of the codebase.

- **apex-retro**: workflow/roles/retro.md
  Retrospective analysis — extract lessons, patterns, and improvements from completed work.

- **apex-canary**: workflow/roles/canary.md
  Post-deploy canary monitoring — screenshots, error detection, performance regression checks.

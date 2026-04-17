---
title: Fix Protocol Init Skip Review
status: DONE
reviewer: self (Lightweight)
created: 2026-04-17
---

## Summary

2 files changed: `cognitive-kernel.md` (L1 pipeline exemption), `apex-forge-skill-trace.sh` (init detection hook).

## Security Reviewer

No findings. L1 clause is text-only instruction. Hook outputs to stderr only — no file writes, no shell execution beyond existing `jq` read.

## Correctness Reviewer

No findings. L1 exemption is additive (new clause under existing exemption list). Hook detection block exits early with `exit 0` — does not interfere with companion skill tracing logic below it. Both `apex-forge` and `better-work` aliases covered.

## Spec Compliance Reviewer

- AC1 (L1 pipeline exemption): PASS — new "Pipeline 协议优先" clause defers proposing template until init complete
- AC2 (hook init detection): PASS — detects missing `.apex/`, missing `state.json`, or idle stage; outputs warning to stderr
- AC3 (non-pipeline L1 unchanged): PASS — exemption only fires when pipeline skill loaded AND not initialized; otherwise L1 proposing template applies normally

## Adversarial Reviewer

1. **L1 exemption is still text**: Agent can ignore "必须先完成 pipeline 初始化" just like any other text instruction. But combined with the hook warning on stderr, there are now two reinforcing signals. Previously there was zero.
2. **Hook warning goes to stderr**: Some agent environments may not surface stderr to the agent. In Claude Code, hook stderr is shown as tool output context — this works. In other environments, may be invisible. Acceptable for v1.

## Verdict

DONE — both paths implemented. Combined effect: text instruction (L1) + technical signal (hook stderr) provide defense in depth.

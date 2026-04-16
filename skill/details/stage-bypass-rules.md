# Stage Bypass Rules — Rationale and Invalid Rationalizations

## Hard Rule (summary)

When the user invokes a named stage command (`apex-forge ship`, `apex-forge review`, etc.), the
Complexity Router is skipped entirely. The agent reads the stage file and executes every step top to
bottom. This is not negotiable.

## Why the Hard Rule Exists

The Complexity Router exists to classify *uncategorized* work. An explicit stage command is already
classified — the user has made the routing decision themselves. Running the Router on an explicit
command would allow the agent to self-classify as Tier 1 and skip steps the user explicitly
ordered. That is an escape hatch, not a feature.

## Invalid Rationalizations

The following three rationalizations are specifically disallowed:

- **"This is just a push, so Tier 1"** — `/apex-forge ship` means run full Ship protocol.
  The complexity of the push is irrelevant. Ship protocol runs regardless.

- **"The code is already committed, so I can skip Pre-Flight"** — Pre-Flight checks run
  regardless of prior commit state. Pre-Flight exists to catch last-minute issues, not to
  verify that a commit happened.

- **"Only 2 commits to push, so lightweight"** — Step count does not determine protocol scope.
  A 1-commit push through `/apex-forge ship` runs the same Ship steps as a 20-commit push.

## Why Each Rationalization Fails

All three share the same structural error: they apply a *quantity heuristic* (small = simple =
skip steps) to a *categorical decision* (which stage protocol to run). Stage protocols are not
scaled by work volume. They are binary: either the full stage runs, or a protocol violation has
occurred.

The Complexity Router's Tier system applies **only within the Execute stage's iteration strategy**
(single pass / PDCA rounds / waves). It has no jurisdiction over whether to run Brainstorm, Plan,
Review, Ship, or Compound at all.

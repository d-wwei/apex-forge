# Verification Stage

> apex-forge / workflow / stages / verify
>
> The evidence gate. Used within Execute (Stage 4) and Review (Stage 5)
> to prevent unverified claims from passing through the pipeline.

---

## The Iron Law

```
================================================================
  NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.

  "It should work" is not evidence.
  "I wrote the code correctly" is not evidence.
  "The logic looks right" is not evidence.

  Evidence is: test output, file content re-read, command output,
  diff confirmation, or direct observation --- gathered AFTER the
  change, not before or during.
================================================================
```

Any claim of completion, correctness, or readiness that is not
accompanied by fresh, specific evidence is automatically invalid.
The agent must re-enter the verification loop.

---

## The 5-Step Gate Function

Every verification follows this exact sequence. No shortcuts.

### Step 1: State the Specific Claim

Write out the claim in plain language. It must be concrete and falsifiable.

- Good: "The `parseConfig` function now handles missing fields by
  returning defaults instead of throwing."
- Bad: "I fixed the config parser."
- Bad: "The code should work now."

### Step 2: Describe the Evidence Needed

Before gathering evidence, explicitly state what evidence would
confirm or refute the claim.

- "I need to see the test output showing that `parseConfig({})` returns
  `{ timeout: 30, retries: 3 }` instead of throwing."
- "I need to re-read lines 42-58 of `config.ts` to confirm the default
  values are populated."

### Step 3: Gather Fresh Evidence

Perform the verification action NOW. Not from memory. Not from
the context of what you just wrote. Fresh.

- Re-read the file after modifications.
- Run the test suite and capture output.
- Execute the command and capture stdout/stderr.
- Check git diff to confirm the change is what you intended.

"Fresh" means: the evidence was gathered AFTER the most recent change.
Evidence from before the change is stale and does not count.

### Step 4: Compare Evidence Against Claim

Explicitly compare:
- What the claim says should be true.
- What the evidence actually shows.

State whether they match, partially match, or contradict.

### Step 5: Render Verdict with Evidence Citation

One of three verdicts:

| Verdict | Meaning | Next Action |
|---------|---------|-------------|
| **VERIFIED** | Evidence fully supports the claim. | Proceed. |
| **PARTIALLY VERIFIED** | Some aspects confirmed, others not. | Document gaps, gather more evidence. |
| **REFUTED** | Evidence contradicts the claim. | Return to implementation. Fix the issue. Re-verify. |

The verdict MUST include a direct citation of the evidence.
- Good: "VERIFIED. Test output shows `parseConfig({})` returns
  `{ timeout: 30, retries: 3 }`. See test run at 14:32."
- Bad: "VERIFIED. Looks correct."

---

## Rationalization Table

Common rationalizations for skipping verification, with counters.

| Rationalization | Why It Fails | Counter |
|----------------|-------------|---------|
| "I just wrote the code, I know it works" | Writing and verifying are different cognitive acts. Authors have blind spots for their own mistakes. | "You are the author. You need a verifier. Run the check." |
| "The change is trivial" | Trivial changes break systems. A one-character typo can crash production. | "Trivial changes need trivial verification. Run the test." |
| "I'll verify it later" | Later never comes. The pipeline advances and the unverified claim becomes an assumption. | "Verify now. The pipeline does not advance on promises." |
| "The test would take too long" | Then the verification strategy is wrong. Find a faster check. | "What is the fastest way to confirm this specific claim? Do that." |
| "It compiled / no errors" | Compilation checks syntax, not semantics. No errors means no DETECTED errors. | "Compilation is necessary but not sufficient. What is the behavioral check?" |
| "I checked it mentally" | Mental models are incomplete. The system does not accept internal states as evidence. | "Show me the evidence. External output only." |
| "It's the same pattern as last time" | Similar is not identical. Context differs. Regression risk. | "If it's the same, verification will be fast. Run it." |

---

## Red Flag Patterns

The agent should self-monitor for these patterns. If any appear,
immediately halt and enter the 5-step gate.

| Red Flag | What It Looks Like |
|----------|--------------------|
| **Commit without verify** | About to run `git commit` or claim "done" without having re-read the modified files or run tests since the last change. |
| **Cascade assumption** | "Since A works, B must also work." Each claim needs its own evidence. |
| **Stale evidence** | Citing a test run from before the most recent code change. Evidence must be fresher than the change. |
| **Vague completion** | "Everything looks good" / "All done" / "Should be working now" without specifics. |
| **Scope drift** | Verifying something adjacent to the claim but not the claim itself. |
| **Partial verify** | Checking one acceptance criterion and declaring all criteria met. Each criterion needs its own evidence. |
| **Copy-paste confidence** | "I copied this from a working example, so it works." The destination context may differ. |

---

## Sufficient vs. Insufficient Evidence

For each claim type, what counts as evidence and what does not.

| Claim Type | Sufficient Evidence | Insufficient Evidence |
|-----------|--------------------|-----------------------|
| "Function returns X" | Test output showing the return value; REPL session; or re-read of file showing return statement + test passing. | "I wrote `return X`" without running the code. |
| "Bug is fixed" | Reproduction steps now produce correct behavior (test output). Original failing test now passes. | "I changed the line that caused it." Code change is not evidence of behavior change. |
| "File was created" | `ls` or file read showing the file exists with expected content. | "I ran the write command." Command execution is not evidence of success. |
| "Tests pass" | Actual test runner output showing pass count and zero failures. | "Tests should pass." / "I didn't see any errors." |
| "No regressions" | Full test suite output. Or at minimum, tests for the modified module. | "I only changed one file, so nothing else is affected." |
| "Config is correct" | File read of the config + the system using it successfully. | "I set the values correctly." |
| "API endpoint works" | curl/fetch output showing expected response code and body. | "The route is registered." Registration is not evidence of correct behavior. |
| "Error handling works" | Test or manual trigger of the error path, showing graceful handling. | "I added a try/catch." Presence of error handling is not evidence it handles correctly. |
| "Performance improved" | Benchmark output showing before and after numbers. | "I used a faster algorithm." Algorithm choice is not evidence of performance outcome. |

---

## Integration with Completion Status Protocol

The verification stage feeds directly into the completion status used
by Stage 5 (Review).

### Status Mapping

| Verification Outcome | Completion Status |
|---------------------|-------------------|
| All claims VERIFIED | `DONE` |
| All claims VERIFIED but with documented concerns | `DONE_WITH_CONCERNS` |
| Any claim REFUTED or unable to gather evidence | `BLOCKED` |
| Evidence is ambiguous or incomplete | `NEEDS_CONTEXT` |

### Escalation Path

1. First REFUTED verdict: return to implementation, fix, re-verify.
2. Second REFUTED verdict on the same claim: escalate. Involve a
   different approach or request user input.
3. Third REFUTED verdict: halt. Something fundamental is wrong.
   Generate a diagnostic report and ask the user for guidance.
   Do NOT continue retrying the same approach.

### Evidence Log

All verification evidence is appended to the execution or review log:

```markdown
## Verification Evidence

### Claim: {specific claim}
- **Evidence needed**: {what we looked for}
- **Evidence gathered**: {what we found, with timestamps}
- **Verdict**: VERIFIED | PARTIALLY VERIFIED | REFUTED
- **Citation**: {exact output, file content, or command result}
```

This log is the audit trail. It allows humans to review what the agent
checked and how it confirmed correctness. Without this log, the work
is not considered verified regardless of outcome.

---

## Usage Within the Pipeline

### In Stage 4 (Execute)

- Verify after each task is completed (not after all tasks).
- Each task's acceptance criteria from the plan become claims.
- Run the 5-step gate for each criterion.
- A task is only marked `done` when all its criteria are VERIFIED.

### In Stage 5 (Review)

- Each reviewer runs the 5-step gate for their findings.
- A reviewer cannot claim "no issues found" without evidence of
  what they checked and how.
- The "looks good to me" review is not valid. The reviewer must
  state what they verified and cite the evidence.

### Standalone Invocation

- User says "verify this" or "does this work" --- run the 5-step gate
  on the implicit claim.
- User says "check everything" --- identify all testable claims from
  recent changes and verify each one.

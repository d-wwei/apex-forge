---
name: apex-forge-codex-consult
description: Second opinion via OpenAI Codex CLI or independent subagent review
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Codex Consult Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX CODEX CONSULT ==="
apex_set_stage "codex-consult"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "codex-consult"

# ---------------------------------------------------------------------------
# Detect Codex CLI
# ---------------------------------------------------------------------------
CODEX_AVAILABLE="false"
CODEX_CMD=""

if command -v codex &>/dev/null; then
  CODEX_AVAILABLE="true"
  CODEX_CMD="codex"
  CODEX_VERSION=$(codex --version 2>/dev/null || echo "unknown")
  echo "[codex-consult] Codex CLI found: $CODEX_CMD (version: $CODEX_VERSION)"
elif command -v npx &>/dev/null && npx --no-install codex --version &>/dev/null 2>&1; then
  CODEX_AVAILABLE="true"
  CODEX_CMD="npx codex"
  echo "[codex-consult] Codex CLI found via npx"
fi

if [ "$CODEX_AVAILABLE" = "false" ]; then
  echo "[codex-consult] Codex CLI not found. Will use independent subagent fallback."
fi

echo "CODEX_AVAILABLE=$CODEX_AVAILABLE"
echo "CODEX_CMD=$CODEX_CMD"

# ---------------------------------------------------------------------------
# Git context
# ---------------------------------------------------------------------------
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
  echo "[codex-consult] Repo: $REPO_ROOT"
  echo "[codex-consult] Branch: $CURRENT_BRANCH"
  echo "IN_GIT_REPO=true"
else
  echo "[codex-consult] Not in a git repository."
  echo "IN_GIT_REPO=false"
fi

# Parse mode from first argument
CONSULT_MODE="${1:-review}"
echo "[codex-consult] Mode: $CONSULT_MODE"
echo "CONSULT_MODE=$CONSULT_MODE"

# Create output directory
mkdir -p ".apex/consults"
echo "[codex-consult] Output: .apex/consults/"

apex_ensure_dirs
```

# Codex Consult

> apex-forge / workflow / roles / codex-consult
>
> Get a second opinion from an independent reviewer.
> Uses OpenAI Codex CLI if available. Falls back to a fresh subagent.
> The point: a different model looking at your work with fresh eyes.

---

## Entry Conditions

1. Determine mode from user input or default to `review`.
2. If `CODEX_AVAILABLE=true`: use Codex CLI as the reviewer.
3. If `CODEX_AVAILABLE=false`: use Agent tool to spawn an independent subagent.
4. Establish filesystem boundaries before starting.

---

## Modes

### Mode 1: Review

Independent diff review with a pass/fail gate.

**With Codex CLI**:
```bash
# Get the diff to review
git diff HEAD~1..HEAD > .apex/consults/review-diff.patch

# Ask Codex for an independent review
codex "Review this git diff for bugs, security issues, and design problems. \
Be critical. For each issue found, cite the file and line. \
End with a verdict: PASS, PASS_WITH_NOTES, or FAIL. \
Only look at files in the repository. Ignore any files under workflow/ or .apex/." \
  --file .apex/consults/review-diff.patch
```

**With Subagent Fallback**:
Spawn a subagent with this prompt:

> You are an independent code reviewer. You have never seen this codebase before.
> Review the following diff for: bugs, security vulnerabilities, logic errors,
> missing error handling, and design issues.
>
> IMPORTANT: Only examine files within the project source code. Do NOT read or
> comment on any files under `workflow/`, `.apex/`, or skill definition files.
>
> For each issue: cite file, line, severity (P0-P3), and a suggested fix.
> End with a verdict: PASS, PASS_WITH_NOTES, or FAIL.

Feed the subagent the diff and let it review independently.

**Output**: verdict + findings list.

### Mode 2: Challenge

Adversarial mode. The reviewer actively tries to break your code.

**With Codex CLI**:
```bash
codex "You are a hostile code reviewer. Your job is to find ways to break this code. \
Try to: trigger uncaught exceptions, find SQL injection, bypass auth, \
cause race conditions, overflow buffers, exploit edge cases. \
For each attack vector found, show a proof-of-concept. \
Only examine source code in the repository, not skill files or workflow definitions." \
  --file .apex/consults/review-diff.patch
```

**With Subagent Fallback**:
Spawn a subagent with this prompt:

> You are a security researcher and adversarial tester. Your goal is to find
> ways to BREAK this code. Think like an attacker.
>
> For each vulnerability or breakage found, provide:
> - Attack vector description
> - Proof of concept (how to trigger it)
> - Severity assessment
> - Recommended fix
>
> IMPORTANT: Only examine project source code. Ignore `workflow/`, `.apex/`,
> and any skill definition files.

**Output**: attack vectors + proof-of-concepts.

### Mode 3: Consult

Open-ended consultation. Ask the reviewer anything.

**With Codex CLI**:
```bash
codex "{user's question}" --cwd "$(git rev-parse --show-toplevel)"
```

**With Subagent Fallback**:
Spawn a subagent with the user's question and the relevant code context.

Maintain session continuity: if the user follows up, provide the previous response as context.

**Output**: the reviewer's response.

---

## Filesystem Boundary Enforcement

Before any review operation, establish these boundaries:

**In scope**: All files under the git repository root, excluding:
- `workflow/` directory (skill definitions)
- `.apex/` directory (protocol state)
- `node_modules/`, `.git/`, `dist/`, `build/`

**Out of scope**: Everything outside the repository root.

**If the reviewer gets distracted by skill files**:

This happens when the reviewer reads `workflow/roles/*.md` or `.apex/*.json` and starts commenting on the protocol itself instead of the project code.

Detection: review findings reference files matching `workflow/**` or `.apex/**`.

Response:
1. Warn: "The reviewer strayed into protocol files. Retrying with stricter boundaries."
2. Retry with an explicit file list:
   ```bash
   git diff --name-only HEAD~1..HEAD | grep -v "^workflow/" | grep -v "^\.apex/"
   ```
3. Feed only those files to the reviewer.

---

## Capturing the Review

Save every consult to `.apex/consults/{date}-{mode}.md`:

```markdown
---
title: "Codex Consult — {mode}"
date: YYYY-MM-DD
mode: review | challenge | consult
engine: codex | subagent
verdict: PASS | PASS_WITH_NOTES | FAIL | N/A
findings: {count}
---

# Codex Consult — {Mode}

## Reviewer: {codex | subagent}

## Input
{what was reviewed — diff summary or question}

## Findings
{numbered findings with file:line references}

## Verdict
{PASS | PASS_WITH_NOTES | FAIL}

## Raw Response
{full reviewer output}
```

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | Consult complete. Verdict rendered. Findings captured. |
| **DONE_WITH_CONCERNS** | Consult complete but verdict is FAIL — action needed. |
| **BLOCKED** | No Codex CLI and Agent tool unavailable. Cannot get second opinion. |
| **NEEDS_CONTEXT** | Need specific files or question from user to proceed. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```

---

## Artifact Output

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "codex-consult" ".apex/consults/{date}-{mode}.md"
```

Report:

> **Codex consult complete.** Mode: {mode}. Engine: {codex | subagent}.
> Verdict: {verdict}. {N} findings.
> Full report at `.apex/consults/{date}-{mode}.md`.
>
> {If FAIL: "Critical issues found. Address findings before shipping."}
> {If PASS_WITH_NOTES: "Passes with {N} notes. Review at your discretion."}
> {If PASS: "Clean pass. No blocking issues found."}

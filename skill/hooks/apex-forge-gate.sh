#!/bin/bash
# PreToolUse hook: L2-Deny gate for apex-forge pipeline enforcement.
#
# Enforces two rules:
# 1. Git operations (commit/push/pr) ONLY allowed during Ship stage
# 2. Code file creation/editing NOT allowed during Brainstorm stage
#
# Non-apex projects (.apex/ doesn't exist) → always allow.
# Non-matching tool calls → always allow.
# Dependencies: python3 (no jq required).

# Fail-open error trap: if anything unexpected goes wrong, allow the tool call
# rather than blocking all operations. Log the error for debugging.
trap 'exit 0' ERR

INPUT=$(cat)

# ── Parse input with python3 (no jq dependency) ─────────────────────
# Output one field per line; mapfile reads them preserving empty fields
_PARSED=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    tool = d.get('tool_name', '')
    cwd = d.get('cwd', '')
    inp = d.get('tool_input', {})
    cmd = inp.get('command', '')
    fp = inp.get('file_path', '')
    for v in [tool, cwd, cmd, fp]:
        print(v)
except Exception:
    print(); print(); print(); print()
" <<< "$INPUT" 2>/dev/null)
TOOL=$(echo "$_PARSED" | sed -n '1p')
CWD=$(echo "$_PARSED" | sed -n '2p')
CMD=$(echo "$_PARSED" | sed -n '3p')
TARGET_FILE=$(echo "$_PARSED" | sed -n '4p')

# ── Fast exit: only check Bash, Edit, Write ──────────────────────────
case "${TOOL:-}" in
  Bash|Edit|Write) ;;
  *) exit 0 ;;
esac

# ── Find .apex/ directory ────────────────────────────────────────────
[ -z "$CWD" ] && CWD="$(pwd)"
APEX_DIR="$CWD/.apex"

# Not an apex project → allow everything
[ -d "$APEX_DIR" ] || exit 0

# ── Read current stage from most recent session state ────────────────
STAGE=""
NEWEST_STATE=""
NEWEST_MTIME=0

for f in "$APEX_DIR"/state.*.json; do
  [ -f "$f" ] || continue
  MTIME=$(stat -f '%m' "$f" 2>/dev/null || stat -c '%Y' "$f" 2>/dev/null || echo 0)
  if [ "$MTIME" -gt "$NEWEST_MTIME" ] 2>/dev/null; then
    NEWEST_MTIME="$MTIME"
    NEWEST_STATE="$f"
  fi
done

# Fallback to global state.json
[ -z "$NEWEST_STATE" ] && [ -f "$APEX_DIR/state.json" ] && NEWEST_STATE="$APEX_DIR/state.json"

if [ -n "$NEWEST_STATE" ]; then
  STAGE=$(python3 -c "
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
    stage = data.get('current_stage', '')
    if not isinstance(stage, str):
        stage = ''
    print(stage)
except json.JSONDecodeError:
    # C2 fix: corrupt JSON → print 'corrupt' so we can block instead of fail-open
    print('corrupt')
except Exception:
    print('')
" "$NEWEST_STATE" 2>/dev/null || echo "")
fi

# idle, empty, or no state file → no active pipeline → allow
case "${STAGE:-}" in
  idle|"") exit 0 ;;
  corrupt)
    # State file exists but is corrupt — block to be safe
    cat <<'DENY'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "APEX GATE: .apex/ state file is corrupt (invalid JSON). Run: apex recover"
  }
}
DENY
    exit 0
    ;;
esac

# ── Rule 1: Git operations only in Ship stage ────────────────────────
if [ "$TOOL" = "Bash" ] && [ -n "$CMD" ]; then
  # C1 fix: detect actual git/gh command invocations, not substrings
  # Match: start of command, after && ; || |, or after $( — then git/gh command
  IS_GIT_OP=0
  if python3 -c "
import re, sys
cmd = sys.argv[1]
# Match git commit/push or gh pr at command boundaries
pattern = r'(?:^|[;&|]\s*|\\$\()\s*git\s+(commit|push)\b|(?:^|[;&|]\s*|\\$\()\s*gh\s+(pr\s+create|pr\s+merge)\b'
sys.exit(0 if re.search(pattern, cmd) else 1)
" "$CMD" 2>/dev/null; then
    IS_GIT_OP=1
  fi

  if [ "$IS_GIT_OP" = "1" ] && [ "$STAGE" != "ship" ]; then
    cat <<DENY
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "APEX GATE: Git operation blocked — current stage is '$STAGE', not 'ship'. Complete the pipeline (Execute → Review → Ship) before committing. Run: apex stage set ship (after Review passes)."
  }
}
DENY
    exit 0
  fi

  # If in ship stage, check that required checkpoints exist before git push
  if [ "$IS_GIT_OP" = "1" ] && [ "$STAGE" = "ship" ] && [ -n "$NEWEST_STATE" ]; then
    MISSING=$(python3 -c "
import json, sys, re
try:
    with open(sys.argv[1]) as f:
        state = json.load(f)
    checkpoints = state.get('ship_checkpoints', [])
    required = ['iteration-summary', 'push-prompt']
    cmd = sys.argv[2]
    # Only check for push/pr, not commit
    if re.search(r'git\s+push|gh\s+pr', cmd):
        missing = [r for r in required if r not in checkpoints]
        if missing:
            print(','.join(missing))
except Exception:
    pass
" "$NEWEST_STATE" "$CMD" 2>/dev/null)

    if [ -n "$MISSING" ]; then
      cat <<DENY
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "APEX GATE: Push blocked — Ship checkpoints missing: $MISSING. Record them first: apex ship checkpoint iteration-summary && apex ship checkpoint push-prompt"
  }
}
DENY
      exit 0
    fi
  fi
fi

# ── Rule 2: No code file edits during Brainstorm ────────────────────
if [ "$STAGE" = "brainstorm" ] && [ -n "$TARGET_FILE" ]; then
  # I1 fix: allowlist approach — only permit docs/planning/config files
  case "$TARGET_FILE" in
    */docs/*|*/plans/*|*/brainstorms/*|*/.apex/*|*.md|*/memory/*|*.json|*.yaml|*.yml|*.toml)
      ;; # allowed: documentation, planning, configuration
    *)
      # Block everything else (code files, scripts, binaries, etc.)
      cat <<DENY
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "APEX GATE: File edit blocked during Brainstorm stage. Only docs/plans/config files allowed. No implementation until Execute. File: $TARGET_FILE"
  }
}
DENY
      exit 0
      ;;
  esac
fi

# ── Default: allow ───────────────────────────────────────────────────
exit 0

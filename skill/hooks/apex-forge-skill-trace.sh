#!/bin/bash
# PostToolUse hook: auto-trace companion skill invocations for Dashboard telemetry.
# Fires after every Skill tool call. Filters to only companion skills from bindings.yaml.
# Writes trace via `apex trace-skill` so Dashboard telemetry picks it up automatically.

INPUT=$(cat)

# Extract tool name
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

# Auto-checkpoint: detect AskUserQuestion during ship stage (push-prompt checkpoint)
if [ "$TOOL" = "AskUserQuestion" ]; then
  APEX_DIR=".apex"
  [ -d "$APEX_DIR" ] || exit 0
  STAGE=$(jq -r '.current_stage // "unknown"' "$APEX_DIR/state.json" 2>/dev/null || echo "unknown")
  if [ "$STAGE" = "ship" ]; then
    apex ship checkpoint push-prompt 2>/dev/null
  fi
  exit 0
fi

# Only process Skill tool calls beyond this point
[ "$TOOL" = "Skill" ] || exit 0

SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // .tool_input.skill_name // empty' 2>/dev/null)
[ -n "$SKILL" ] || exit 0

# Companion skills from bindings.yaml (extracted statically to avoid parsing YAML in bash)
COMPANIONS="product-prd systematic-debugging tasteful-frontend design-to-code-runner browser-qa-testing thorough-code-review security-audit product-review iteration-reflector great-writer product-goal-based-audit"
# NOTE: design-review and codex-consult are now builtin (aliases/), not companion skills

# Check if this skill is a companion
MATCH=0
for c in $COMPANIONS; do
  [ "$SKILL" = "$c" ] && MATCH=1 && break
done
[ "$MATCH" = "1" ] || exit 0

# Read current stage from state.json
APEX_DIR=".apex"
STAGE=$(jq -r '.current_stage // "unknown"' "$APEX_DIR/state.json" 2>/dev/null || echo "unknown")

# Read skill version (best effort)
SKILL_DIR="$HOME/.claude/skills/$SKILL"
VERSION=$(cat "$SKILL_DIR/VERSION" 2>/dev/null || echo "latest")

# Trace it
apex trace-skill "$STAGE" "$SKILL" "$VERSION" "completed" "af_auto_trace" 2>/dev/null

exit 0

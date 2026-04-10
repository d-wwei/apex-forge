#!/bin/bash
# PostToolUse hook: prompt agent to ask user about dashboard after apex-forge skill loads.
# Configured in ~/.claude/settings.json under hooks.PostToolUse with matcher "Skill".
# The Skill tool's summarizer strips dashboard instructions from SKILL.md,
# so this hook injects the prompt through a channel the agent cannot skip.

INPUT=$(cat)

SKILL=$(echo "$INPUT" | jq -r '.tool_input.skill // .tool_input.skill_name // empty' 2>/dev/null)

if [ "$SKILL" = "apex-forge" ] || [ "$SKILL" = "better-work" ]; then
  cat <<'MSG'
⚠️ APEX-FORGE DASHBOARD GATE: You MUST call AskUserQuestion BEFORE doing anything else.
Question: "是否启动可视化面板？"
Header: "Dashboard"
Options:
  - label: "启动 Dashboard (Recommended)", description: "在浏览器里查看任务看板、pipeline 进度和遥测数据"
  - label: "跳过", description: "不启动，直接开始工作"
If "启动 Dashboard": run `nohup apex dashboard > /dev/null 2>&1 &` then open the printed URL.
If "跳过": proceed silently.
Do NOT say "ready" or ask for tasks until the user answers this question.
MSG
fi

exit 0

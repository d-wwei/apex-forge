#!/usr/bin/env bash
set -euo pipefail

# Apex Forge — Universal Skill Installer
# Detects available AI agent platforms and installs the skill + CLI

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SKILL_DIR/.." && pwd)"
DIST_DIR="$REPO_DIR/dist"
APEX_BIN="$DIST_DIR/apex-forge"

echo "Apex Forge Skill Installer"
echo "=========================="
echo "Skill:  $SKILL_DIR"
echo "CLI:    $APEX_BIN"
echo ""

# --- Step 1: Check CLI binary ---

if [ ! -x "$APEX_BIN" ]; then
  echo "[!] CLI binary not found at $APEX_BIN"
  echo "    Build it first: cd $REPO_DIR && bun run build"
  exit 1
fi

echo "[ok] CLI binary found"

# --- Step 2: Add CLI to PATH ---

SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
  SHELL_RC="$HOME/.bash_profile"
fi

PATH_LINE="export PATH=\"\$PATH:$DIST_DIR\""
ALIAS_LINE="alias apex=\"$APEX_BIN\""

if [ -n "$SHELL_RC" ]; then
  if ! grep -qF "$DIST_DIR" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# Apex Forge CLI" >> "$SHELL_RC"
    echo "$PATH_LINE" >> "$SHELL_RC"
    echo "$ALIAS_LINE" >> "$SHELL_RC"
    echo "[ok] Added to PATH in $SHELL_RC"
  else
    echo "[ok] PATH already configured in $SHELL_RC"
  fi
else
  echo "[!] No shell RC file found. Add manually:"
  echo "    $PATH_LINE"
fi

# --- Step 3: Install skill for detected platforms ---

installed=0

# Claude Code
if [ -d "$HOME/.claude" ]; then
  mkdir -p "$HOME/.claude/skills"
  ln -sfn "$SKILL_DIR" "$HOME/.claude/skills/apex-forge"
  echo "[ok] Claude Code: ~/.claude/skills/apex-forge"
  installed=$((installed + 1))
fi

# Codex
if [ -d "$HOME/.codex" ]; then
  mkdir -p "$HOME/.codex/skills"
  ln -sfn "$SKILL_DIR" "$HOME/.codex/skills/apex-forge"
  echo "[ok] Codex: ~/.codex/skills/apex-forge"
  installed=$((installed + 1))
fi

# Gemini
if [ -d "$HOME/.gemini" ]; then
  mkdir -p "$HOME/.gemini/skills"
  ln -sfn "$SKILL_DIR" "$HOME/.gemini/skills/apex-forge"
  echo "[ok] Gemini: ~/.gemini/skills/apex-forge"
  installed=$((installed + 1))
fi

# OpenCode
if [ -d "$HOME/.opencode" ]; then
  mkdir -p "$HOME/.opencode/skills"
  ln -sfn "$SKILL_DIR" "$HOME/.opencode/skills/apex-forge"
  echo "[ok] OpenCode: ~/.opencode/skills/apex-forge"
  installed=$((installed + 1))
fi

if [ $installed -eq 0 ]; then
  echo ""
  echo "[!] No known agent platforms detected."
  echo "    Manual install: symlink $SKILL_DIR to your agent's skills directory."
  echo "    See: $SKILL_DIR/references/platform-setup.md"
fi

echo ""
echo "Done. $installed platform(s) configured."
echo ""
echo "Usage:"
echo "  - In any agent: /apex-forge or \$apex-forge"
echo "  - In terminal:  apex init && apex status"
echo "  - Restart your shell or run: source $SHELL_RC"

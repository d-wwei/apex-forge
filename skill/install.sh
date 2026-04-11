#!/usr/bin/env bash
set -euo pipefail

# Apex Forge — Universal Skill Installer
# Installs AF core + all companion skills (hard dependencies)

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SKILL_DIR/.." && pwd)"
DIST_DIR="$REPO_DIR/dist"
APEX_BIN="$DIST_DIR/apex-forge"

# ─── Parse command ──────────────────────────────────────────────

CMD="${1:-install}"

case "$CMD" in
  install) ;;
  update)
    echo "Updating apex-forge core..."
    (cd "$REPO_DIR" && git pull --ff-only && bun install && bun run build) 2>/dev/null || echo "  [warn] Core update failed"
    echo "Updating all companion skills..."
    # Detect skill directory
    for SKILLS_HOME in "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.gemini/skills" "$HOME/.opencode/skills"; do
      if [ -d "$SKILLS_HOME" ]; then
        for dir in "$SKILLS_HOME"/*/; do
          name="$(basename "$dir")"
          [ "$name" = "apex-forge" ] && continue
          if [ -d "$dir/.git" ]; then
            echo "  [update] $name"
            git -C "$dir" pull --ff-only 2>/dev/null || echo "  [warn] $name: pull failed, skipping"
          fi
        done
        break
      fi
    done
    echo "Done."
    exit 0
    ;;
  *)
    echo "Usage: install.sh [install|update]"
    exit 1
    ;;
esac

echo "Apex Forge Installer"
echo "===================="
echo "Skill:  $SKILL_DIR"
echo "CLI:    $APEX_BIN"
echo ""

# ─── 1. Install npm dependencies ─────────────────────────────────

if command -v bun &>/dev/null; then
  echo "[*] Installing dependencies..."
  (cd "$REPO_DIR" && bun install --frozen-lockfile 2>/dev/null || bun install) >/dev/null 2>&1
  echo "[ok] Dependencies installed"
else
  echo "[!] bun not found. Install bun first: https://bun.sh"
  exit 1
fi

# ─── 2. Build CLI binary ────────────────────────────────────────

if [ ! -x "$APEX_BIN" ] || [ "$REPO_DIR/src/cli.ts" -nt "$APEX_BIN" ]; then
  echo "[*] Building CLI binary..."
  (cd "$REPO_DIR" && bun run build) >/dev/null 2>&1
  echo "[ok] CLI binary built"
else
  echo "[ok] CLI binary up to date"
fi

# ─── 3. Add CLI to PATH ──────────────────────────────────────────

SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
  SHELL_RC="$HOME/.bash_profile"
fi

# ─── Strategy: install wrapper script to a space-free PATH directory ───
# Shells (especially zsh via eval) choke on spaces in PATH entries and aliases.
# Instead, place a thin wrapper in ~/.local/bin which is space-free and
# typically already in PATH.

WRAPPER_DIR="${HOME}/.local/bin"
WRAPPER_BIN="${WRAPPER_DIR}/apex"
mkdir -p "$WRAPPER_DIR"

cat > "$WRAPPER_BIN" << WRAPPER_EOF
#!/usr/bin/env bash
exec "${APEX_BIN}" "\$@"
WRAPPER_EOF
chmod +x "$WRAPPER_BIN"
echo "[ok] Installed apex -> $WRAPPER_BIN"

# Ensure ~/.local/bin is in PATH
if [ -n "$SHELL_RC" ]; then
  # Clean up old space-containing PATH/alias entries from prior installs
  if grep -q "$DIST_DIR" "$SHELL_RC" 2>/dev/null || grep -q "alias apex=" "$SHELL_RC" 2>/dev/null; then
    sed -i '' "\|${DIST_DIR}|d" "$SHELL_RC" 2>/dev/null || true
    sed -i '' '/alias apex=/d' "$SHELL_RC" 2>/dev/null || true
    sed -i '' '/# Apex Forge CLI/d' "$SHELL_RC" 2>/dev/null || true
    echo "[ok] Cleaned old Apex Forge entries from $SHELL_RC"
  fi

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$WRAPPER_DIR"; then
    if ! grep -qF "$WRAPPER_DIR" "$SHELL_RC" 2>/dev/null; then
      echo "" >> "$SHELL_RC"
      echo "# Local bin (apex-forge and other tools)" >> "$SHELL_RC"
      echo "export PATH=\"\$PATH:$WRAPPER_DIR\"" >> "$SHELL_RC"
      echo "[ok] Added $WRAPPER_DIR to PATH in $SHELL_RC"
    fi
  else
    echo "[ok] $WRAPPER_DIR already in PATH"
  fi
else
  echo "[!] No shell RC file found. Ensure $WRAPPER_DIR is in your PATH."
fi

# ─── 3b. Copy frontend assets to well-known path ─────────────────
# Compiled binary can't resolve import.meta.dir to filesystem;
# ~/.apex-forge/frontend/ serves as a reliable fallback.

FRONTEND_SRC="$REPO_DIR/frontend"
FRONTEND_DST="$HOME/.apex-forge/frontend"

if [ -d "$FRONTEND_SRC" ]; then
  mkdir -p "$FRONTEND_DST"
  cp -R "$FRONTEND_SRC"/* "$FRONTEND_DST"/
  echo "[ok] Frontend assets copied to $FRONTEND_DST"
else
  echo "[warn] Frontend source not found at $FRONTEND_SRC"
fi

# ─── 3c. Create desktop shortcut (zero sudo, all platforms) ──────
# Users click the shortcut → browser opens Hub → PWA install prompt.
# After PWA install, the shortcut is no longer needed (app icon in Dock/Taskbar).

HUB_URL="http://localhost:3456"

case "$(uname)" in
  Darwin)
    SHORTCUT="$HOME/Desktop/Apex Forge.webloc"
    if [ ! -f "$SHORTCUT" ]; then
      cat > "$SHORTCUT" << WEBLOC
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>URL</key><string>${HUB_URL}</string></dict></plist>
WEBLOC
      echo "[ok] Desktop shortcut: ~/Desktop/Apex Forge.webloc"
    else
      echo "[ok] Desktop shortcut already exists"
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows*)
    SHORTCUT="$USERPROFILE/Desktop/Apex Forge.url"
    if [ ! -f "$SHORTCUT" ]; then
      printf "[InternetShortcut]\nURL=${HUB_URL}\nIconIndex=0\n" > "$SHORTCUT" 2>/dev/null
      echo "[ok] Desktop shortcut: Desktop/Apex Forge.url"
    else
      echo "[ok] Desktop shortcut already exists"
    fi
    ;;
  Linux)
    SHORTCUT="$HOME/Desktop/apex-forge.desktop"
    if [ ! -f "$SHORTCUT" ]; then
      cat > "$SHORTCUT" << DESKTOP
[Desktop Entry]
Type=Application
Name=Apex Forge
Exec=xdg-open ${HUB_URL}
Icon=utilities-terminal
Terminal=false
DESKTOP
      chmod +x "$SHORTCUT" 2>/dev/null
      echo "[ok] Desktop shortcut: ~/Desktop/apex-forge.desktop"
    else
      echo "[ok] Desktop shortcut already exists"
    fi
    ;;
esac

# ─── 4. Install AF core for detected platforms ───────────────────

installed=0

for SKILLS_HOME in "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.gemini/skills" "$HOME/.opencode/skills"; do
  PLATFORM_DIR="$(dirname "$SKILLS_HOME")"
  if [ -d "$PLATFORM_DIR" ]; then
    mkdir -p "$SKILLS_HOME"
    ln -sfn "$SKILL_DIR" "$SKILLS_HOME/apex-forge"
    echo "[ok] $(basename "$PLATFORM_DIR"): $SKILLS_HOME/apex-forge"
    installed=$((installed + 1))
  fi
done

if [ $installed -eq 0 ]; then
  echo "[!] No known agent platforms detected."
  echo "    Manual install: symlink $SKILL_DIR to your agent's skills directory."
fi

# ─── 5. Install companion skills (hard dependencies) ─────────────

# Detect first available skills home
SKILLS_HOME=""
for dir in "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.gemini/skills" "$HOME/.opencode/skills"; do
  if [ -d "$dir" ]; then
    SKILLS_HOME="$dir"
    break
  fi
done

if [ -z "$SKILLS_HOME" ]; then
  SKILLS_HOME="$HOME/.claude/skills"
  mkdir -p "$SKILLS_HOME"
fi

echo ""
echo "Installing companion skills to $SKILLS_HOME..."

# Format: name|url|tag (empty tag = HEAD)
DEPS=(
  "systematic-debugging|https://github.com/d-wwei/systematic-debugging|v1.0.0"
  "thorough-code-review|https://github.com/d-wwei/thorough-code-review|v1.0.0"
  "security-audit|https://github.com/d-wwei/security-audit|v1.0.0"
  "browser-qa-testing|https://github.com/d-wwei/browser-qa-testing|v1.0.0"
  "iteration-reflector|https://github.com/d-wwei/iteration-reflector|v1.0.0"
  "tasteful-frontend|https://github.com/d-wwei/tasteful-frontend|"
  "design-to-code-runner|https://github.com/d-wwei/design-to-code-runner|"
  "product-review|https://github.com/d-wwei/product-review|"
  "product-prd|https://github.com/d-wwei/Product-Prd-Skill|"
)

FAILED=()

for dep in "${DEPS[@]}"; do
  IFS='|' read -r name url tag <<< "$dep"
  target="$SKILLS_HOME/$name"
  if [ -d "$target" ] || [ -L "$target" ]; then
    echo "  [ok] $name (already installed)"
  else
    echo "  [install] $name"
    if [ -n "$tag" ]; then
      git clone --depth 1 --branch "$tag" "$url" "$target" 2>/dev/null || FAILED+=("$name")
    else
      git clone --depth 1 "$url" "$target" 2>/dev/null || FAILED+=("$name")
    fi
  fi
done

# ─── 6. Build browser-qa-testing binary (if bun available) ───────

BQT_DIR="$SKILLS_HOME/browser-qa-testing"
if [ -d "$BQT_DIR/src" ] && command -v bun &>/dev/null; then
  echo ""
  echo "Building browser binary..."
  if [ -f "$BQT_DIR/install.sh" ]; then
    bash "$BQT_DIR/install.sh" 2>/dev/null && echo "  [ok] browse binary" || echo "  [warn] browse binary build failed"
  else
    (cd "$BQT_DIR" && bun install 2>/dev/null && bun run build 2>/dev/null) && echo "  [ok] browse binary" || echo "  [warn] browse binary build failed"
  fi
fi

# ─── 7. Result ────────────────────────────────────────────────────

echo ""
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "WARNING: Failed to install: ${FAILED[*]}"
  echo "These are hard dependencies. AF pipeline will not function correctly."
  echo "Please install manually: git clone <url> $SKILLS_HOME/<name>"
  exit 1
fi

echo "Done. Apex Forge + 9 companion skills installed."
echo ""
echo "Usage:"
echo "  /apex-forge               Activate core protocol"
echo "  /apex-forge execute       TDD-first implementation"
echo "  /systematic-debugging     Standalone debugging"
echo "  /thorough-code-review     Standalone PR review"
echo "  /browser-qa-testing       Standalone QA + browser"
echo "  /security-audit           Standalone security audit"
echo ""
echo "Maintenance:"
echo "  install.sh update         Pull latest for all companion skills"

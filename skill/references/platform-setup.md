# Apex Forge — Platform Setup Guide

## Prerequisites

1. **Build the CLI binary** (requires [Bun](https://bun.sh)):
   ```bash
   cd <apex-forge-repo>
   bun install
   bun run build
   ```

2. **Add CLI to PATH**:
   ```bash
   export PATH="$PATH:<apex-forge-repo>/dist"
   ```
   Or create an alias: `alias apex="<apex-forge-repo>/dist/apex-forge"`

## Automatic Installation

```bash
bash <apex-forge-repo>/skill/install.sh
```

This detects available platforms and creates symlinks automatically.

## Manual Installation by Platform

### Claude Code

```bash
mkdir -p ~/.claude/skills
ln -sf <apex-forge-repo>/skill ~/.claude/skills/apex-forge
```

Invoke with: `/apex-forge` or `/apex-forge brainstorm`

### Codex (OpenAI)

```bash
mkdir -p ~/.codex/skills
ln -sf <apex-forge-repo>/skill ~/.codex/skills/apex-forge
```

Or copy `skill/SKILL.md` to your project's `AGENTS.md` for project-level use.

### Gemini CLI

```bash
mkdir -p ~/.gemini/skills
ln -sf <apex-forge-repo>/skill ~/.gemini/skills/apex-forge
```

Gemini loads skills via `activate_skill` tool. The SKILL.md frontmatter is auto-detected.

### Cursor

Copy the skill directory to your project:

```bash
cp -r <apex-forge-repo>/skill .cursor/skills/apex-forge
```

Or reference it in `.cursor-plugin`:
```json
{
  "skills": [{"name": "apex-forge", "path": "<apex-forge-repo>/skill/SKILL.md"}]
}
```

### OpenCode

```bash
mkdir -p ~/.opencode/skills
ln -sf <apex-forge-repo>/skill ~/.opencode/skills/apex-forge
```

### Windsurf

```bash
mkdir -p ~/.windsurf/skills
ln -sf <apex-forge-repo>/skill ~/.windsurf/skills/apex-forge
```

### Any Other Agent

The skill is a directory of Markdown files. The main entry point is `SKILL.md`. Any agent that can:
1. Read Markdown files
2. Execute shell commands

can use Apex Forge. Point your agent's skill loader at the `skill/` directory.

## Verification

After installation, in any project directory:

```bash
# CLI works
apex init
apex status

# In your agent, invoke the skill:
# Claude Code: /apex-forge
# Codex: reference apex-forge in AGENTS.md
# Gemini: activate_skill apex-forge
```

## Uninstall

```bash
# Remove symlinks
rm -f ~/.claude/skills/apex-forge
rm -f ~/.codex/skills/apex-forge
rm -f ~/.gemini/skills/apex-forge
rm -f ~/.opencode/skills/apex-forge

# Remove PATH entry from shell RC
# Edit ~/.zshrc or ~/.bashrc and remove the "Apex Forge CLI" lines
```

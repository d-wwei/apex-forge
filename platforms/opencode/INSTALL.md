# Apex Forge for OpenCode

## Quick Install

**Option 1: Plugin (recommended)**

Add to your `opencode.json`:
```json
{
  "plugin": ["apex-forge@git+https://github.com/d-wwei/apex-forge.git"]
}
```

**Option 2: Convert and copy**

```bash
git clone https://github.com/d-wwei/apex-forge.git
cd apex-forge && bun install && bun run build:all
./dist/apex-forge convert --platform opencode --output /path/to/project/.opencode/skills
```

**Option 3: Auto-detect**

```bash
# From project root (with .opencode/ directory)
./setup
```

## Usage

After installation, use OpenCode's native skill tool:

```
use skill tool to load apex-forge-brainstorm
use skill tool to load apex-forge-plan
use skill tool to load apex-forge-review
```

Or just describe what you want — the protocol auto-activates.

## CLI Binary

OpenCode agents can call the apex-forge binary via shell:

```bash
apex-forge task create "Implement auth" "JWT middleware"
apex-forge memory add "Database is PostgreSQL" 0.9 db
apex-forge-browse goto https://your-app.com
apex-forge dashboard
```

## Directory Structure

```
.opencode/
  skills/
    apex-forge-brainstorm/SKILL.md
    apex-forge-plan/SKILL.md
    apex-forge-execute/SKILL.md
    ...43 skills
  plugins/
    apex-forge.js        ← if using plugin install
```

# Apex Forge for Antigravity

## Quick Install

```bash
# 1. Clone to your project
git clone https://github.com/d-wwei/apex-forge.git
cd apex-forge

# 2. Build
bun install && bun run build:all
bunx playwright install chromium

# 3. Convert skills to Antigravity format
./dist/apex-forge convert --platform antigravity --output /path/to/your-project/.agent/skills

# 4. In Antigravity: Settings → Customizations → Skill Custom Paths
#    Add: .agent/skills/
#    Click Refresh
```

## MCP Server (recommended)

Add to your project's `.agent/config.yml`:

```yaml
mcp_servers:
  apex-forge:
    command: "/path/to/apex-forge/dist/apex-forge-mcp"
    args: ["--role", "admin"]
```

This gives Antigravity's agents access to 27 MCP tools:
- Task management (create, assign, start, submit, verify, block, release, list, next, get)
- Memory system (add, list, search, remove, inject, prune)
- Browser automation (goto, snapshot, click, fill, screenshot, text, html, links, console, is)
- Status overview

## CLI Binary

The `apex-forge` CLI works as a standalone tool that Antigravity agents can call via shell:

```bash
# Task management
apex-forge task create "Implement auth" "JWT middleware"
apex-forge task list

# Memory
apex-forge memory add "Database is PostgreSQL" 0.9 db
apex-forge memory search "auth"

# Browser
apex-forge-browse goto https://your-app.com
apex-forge-browse screenshot /tmp/page.png

# Dashboard
apex-forge dashboard
```

## Directory Structure

After installation, your project should look like:

```
your-project/
  .agent/
    skills/
      apex-forge-brainstorm/SKILL.md
      apex-forge-plan/SKILL.md
      apex-forge-execute/SKILL.md
      apex-forge-review/SKILL.md
      ...43 more skills
    config.yml              ← MCP server config here
  .apex/                    ← Created by `apex-forge init`
    state.json
    tasks.json
    memory.json
    analytics/
```

## Skills Available

43 skills across 11 categories: protocol, stages, quality, plan review, creative, operations, safety, browser, knowledge, orchestration, external.

See the generated AGENTS.md in `.agent/skills/` for the full list.

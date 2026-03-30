# Apex Forge

[中文文档](README.zh-CN.md)

An execution framework for AI coding agents. 43 skills, three complexity tiers, one install. Remixed from 8 open-source projects.

---

## Why

AI coding agents are unreliable. They guess instead of verifying. They skip tests. They claim "done" without proof. They can't coordinate on multi-step tasks. And you end up installing 5 different tools to get a complete workflow.

Apex Forge fixes this by enforcing discipline at the protocol level, not by hoping the agent behaves.

---

## Quick Start

```bash
git clone https://github.com/d-wwei/apex-forge.git ~/.claude/skills/apex-forge
cd ~/.claude/skills/apex-forge
bun install && bun run build:all
bunx playwright install chromium
./dist/apex-forge init
```

Or just tell the AI: `"initialize apex forge"`

You now have 3 binaries (`apex-forge`, `apex-forge-browse`, `apex-forge-mcp`), 43 skills, and a protocol that auto-injects on every session.

After init, your project gets an `.apex/` directory:

```
.apex/
  state.json      -- current stage and session state
  tasks.json      -- task list and state machine
  memory.json     -- memory store (persists across sessions)
  analytics/      -- usage data
  screenshots/    -- browser screenshots
```

Already in `.gitignore`. Won't be committed.

---

## Usage

Every scenario below shows two ways to work: talk to the AI in natural language, or run a command directly. Mix and match.

### Build a Feature

**Tell the AI:** `"I want to add user auth with JWT"`

**Or drive each stage manually:**

```bash
# 1. Requirements exploration (hard gate: no code gets written here)
/apex-forge-brainstorm
# -> produces docs/brainstorms/auth-requirements.md

# 2. Implementation plan (file paths, function signatures, test scenarios)
/apex-forge-plan
# -> produces docs/plans/auth-plan.md

# 3. TDD execution (tests first, complex tasks auto-split to sub-agents)
/apex-forge-execute

# 4. Quality review (18 perspectives: security, correctness, framework-specific)
/apex-forge-review

# 5. Ship (run tests -> version bump -> CHANGELOG -> commit -> PR)
/apex-forge-ship

# 6. Knowledge capture (written to docs/solutions/ for future reuse)
/apex-forge-compound
```

You don't need to remember the order. After each stage, the AI suggests the next one.

| You say | Stage triggered | Command |
|---------|----------------|---------|
| "Help me explore the requirements" | Requirements | `/apex-forge-brainstorm` |
| "Create an implementation plan" | Planning | `/apex-forge-plan` |
| "Start coding" | Execution | `/apex-forge-execute` |
| "Review my changes" | Review | `/apex-forge-review` |
| "Ready to ship" | Ship | `/apex-forge-ship` |
| "Save what we learned" | Knowledge capture | `/apex-forge-compound` |

### Fix a Bug

**Tell the AI:** `"Login returns 401 but the token is valid"`

**Or run:** `/apex-forge-investigate`

The investigation follows a fixed sequence: reproduce the issue, add logging at code boundaries, form 3 hypotheses and test each, confirm root cause, then fix with a regression test. Rule: no fix without root cause.

### Code Review

**Tell the AI:** `"Review my changes"`

**Or run:** `/apex-forge-code-review`

Reads `git diff`, checks from 18 perspectives. Changes to `.tsx` files activate the React reviewer. Changes to `.py` activate Python. Verdict: `SHIP` / `SHIP_WITH_FIXES` / `BLOCK`.

### QA Testing

**Tell the AI:** `"Test this page"`

**Or run:** `/apex-forge-qa`

Three depths: Quick (critical issues only), Standard (+medium), Exhaustive (full coverage). If a browser is available, it opens the page, takes screenshots, interacts, and verifies.

### Security Audit

**Tell the AI:** `"Run a security check"`

**Or run:** `/apex-forge-security-audit`

Checks in order: leaked secrets, dependency vulnerabilities, CI/CD security, OWASP Top 10, auth/authz.

### More Scenarios

| You say | Command | What happens |
|---------|---------|-------------|
| "Is this plan ambitious enough?" | `/apex-forge-ceo-review` | CEO/founder perspective on scope |
| "Is the architecture right?" | `/apex-forge-eng-review` | Engineering review: data, API, performance, deployment |
| "Does the design look good?" | `/apex-forge-design-review` | Visual QA with screenshot comparison |
| "Review this week" | `/apex-forge-retro` | Git stats + team retrospective |
| "Open the dashboard" | `apex-forge dashboard` | Web Kanban + activity stream + analytics |
| "Run this code safely" | `apex-forge sandbox js "..."` | Docker-sandboxed execution |
| "Import GitHub issues" | `apex-forge issues import` | Import as Apex tasks |
| "Create a new skill" | `/apex-forge-skill-author` | Guided skill authoring |
| "Show me 3 design directions" | `/apex-forge-design-shotgun` | 3 visual approaches for one requirement |
| "Full plan review" | `/apex-forge-autoplan` | Auto-run CEO + engineering + design reviews |

> Complete CLI reference: [Usage Guide](docs/USAGE-GUIDE.zh-CN.md)

---

## Task Management

Tell the AI `"create a task: implement user auth"`, or use the CLI:

```bash
# Create
apex-forge task create "Implement user auth" "JWT middleware + refresh tokens"
apex-forge task create "Write auth tests" "Integration tests" T1    # T1 is a dependency

# View
apex-forge task list                        # all tasks
apex-forge task list --status open          # only open
apex-forge task next                        # next unblocked task
apex-forge task get T1                      # details

# State transitions (enforced -- no skipping steps)
apex-forge task assign T1                   # open -> assigned
apex-forge task start T1                    # assigned -> in_progress
apex-forge task submit T1 "Tests passing"   # in_progress -> to_verify
apex-forge task verify T1 pass              # to_verify -> done
apex-forge task verify T1 fail              # to_verify -> in_progress (redo)
apex-forge task block T1 "Waiting for API key"
apex-forge task release T1                  # assigned -> open (unclaim)
```

---

## Memory System

Tell the AI `"remember: auth uses JWT RS256"`, or use the CLI:

```bash
# Store (confidence 0.0-1.0 + tags)
apex-forge memory add "Auth uses JWT RS256" 0.9 auth jwt
apex-forge memory add "Database is PostgreSQL 16" 0.85 db

# Query
apex-forge memory list                      # all facts
apex-forge memory list --min 0.8            # high-confidence only
apex-forge memory search "JWT"              # keyword search

# Maintain
apex-forge memory curate                    # auto-extract from git/tasks/solutions
apex-forge memory prune                     # clean low-quality (<0.5) entries

# In-session curation (AI reviews the current session)
/apex-forge-memory-curate
```

High-confidence facts auto-inject into session context. Low-confidence entries get pruned automatically.

---

## Browser

Tell the AI `"open https://my-app.com and check it"`, or use the CLI:

```bash
# Navigate
apex-forge-browse goto https://your-app.com
apex-forge-browse text                      # read page text
apex-forge-browse links                     # list all links

# Interact (snapshot first to see elements, then use @e refs)
apex-forge-browse snapshot -i               # list interactive elements -> @e1, @e2, ...
apex-forge-browse click @e3                 # click
apex-forge-browse fill @e5 "test@test.com"  # fill input

# Screenshot
apex-forge-browse screenshot /tmp/page.png
apex-forge-browse responsive /tmp/layout    # auto-capture mobile/tablet/desktop

# Inspect
apex-forge-browse console --errors          # JS errors
apex-forge-browse is visible ".modal"       # element visibility check
apex-forge-browse perf                      # page load performance

# Cookies (for testing authenticated pages)
apex-forge-browse cookie-import-browser     # import from real Chrome

# Visible mode (real Chrome window + side panel showing AI actions)
apex-forge-browse connect
apex-forge-browse disconnect                # switch back to headless
```

---

## Dashboard

Tell the AI `"open the dashboard"`, or:

```bash
apex-forge dashboard                        # default port 3456
apex-forge dashboard --port 8080            # custom port
```

Five panels: task Kanban (5-column drag-and-drop), pipeline state (current stage + artifacts), activity stream (real-time skill execution), memory panel (facts sorted by confidence), and analytics (skill usage, average time, success rate).

---

## All 43 Skills

### Protocol (3)

| Skill | What it does |
|-------|-------------|
| `/apex-forge` | Core execution protocol. Complexity router, TDD enforcement, evidence grading, escalation ladder, verification gate. Auto-activates every session. |
| `/apex-forge-round` | PDCA round-based execution for multi-step tasks. Named round types: clarify, explore, hypothesis, planning, execution, verification, hardening, recovery. |
| `/apex-forge-wave` | Wave-based delivery for project-scale work. Cross-session state, assumption registry, decision log, handoff protocol. |

### Stages (7)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-brainstorm` | Requirements exploration. Hard gate: no code until design is approved. |
| `/apex-forge-plan` | Implementation plan with file paths, tasks, test scenarios. Checks for brainstorm artifact. |
| `/apex-forge-execute` | TDD-first implementation. Sub-agent dispatch for complex tasks. Checks for plan artifact. |
| `/apex-forge-review` | 3-persona quality gate. Checks git diff. |
| `/apex-forge-ship` | Tests, version bump, changelog, commit, PR. |
| `/apex-forge-compound` | Knowledge capture to `docs/solutions/` with overlap detection. |
| `/apex-forge-verify` | 5-step evidence gate. Standalone -- usable anytime. |

### Quality and Review (6)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-qa` | Systematic QA testing with tiered depth and browser-aware verification. |
| `/apex-forge-investigate` | Root-cause debugging. No fixes without understanding why. |
| `/apex-forge-code-review` | Multi-pass code review: correctness, security, performance, maintainability. |
| `/apex-forge-design-review` | Visual QA. Screenshot-driven fix-verify loops. |
| `/apex-forge-security-audit` | Infrastructure-first security audit. |
| `/apex-forge-retro` | Retrospective analysis. Extract lessons, patterns, improvements. |

### Plan Review (4)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-ceo-review` | Strategic plan review from a CEO/founder perspective. |
| `/apex-forge-eng-review` | Engineering architecture review. |
| `/apex-forge-plan-design-review` | Designer's eye plan review with dimension ratings. |
| `/apex-forge-autoplan` | Runs CEO, Eng, and Design reviews sequentially with auto-decisions. |

### Creative (3)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-design-consultation` | Design system creation: aesthetic direction, tokens, typography, color, preview. |
| `/apex-forge-design-shotgun` | Generate 3 distinct visual approaches for a UI requirement. |
| `/apex-forge-office-hours` | Guided learning. Teach concepts in the context of the codebase. |

### Operations (5)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-canary` | Post-deploy canary monitoring. Screenshots, error detection, performance regression checks. |
| `/apex-forge-benchmark` | Performance baseline tracking. Measure, store, compare, flag regressions. |
| `/apex-forge-land-and-deploy` | Merge PR, wait for CI, deploy, verify with canary checks. |
| `/apex-forge-setup-deploy` | Auto-detect and configure deployment: platform, URLs, health checks. |
| `/apex-forge-document-release` | Post-ship documentation sync. |

### Safety (4)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-guard` | Freeze edits to a directory + destructive command warnings. |
| `/apex-forge-freeze` | Restrict edits to a specific directory. Writes outside the boundary are refused. |
| `/apex-forge-unfreeze` | Remove the freeze boundary. |
| `/apex-forge-careful` | Require confirmation before destructive operations. |

### Browser (3)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-browse` | Browser interaction: navigate, read, interact, screenshot. |
| `/apex-forge-connect-chrome` | Launch Chrome with remote debugging for automation. |
| `/apex-forge-setup-browser-cookies` | Import cookies from a real browser for authenticated headless sessions. |

### Knowledge (3)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-memory-curate` | Review, score, and prune the memory store. |
| `/apex-forge-compound-refresh` | Update stale solution docs. |
| `/apex-forge-skill-author` | Guided skill file creation. |

### Orchestration (3)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-wave-planner` | Plan wave-based delivery with task decomposition. |
| `/apex-forge-wave-challenger` | Challenge assumptions in wave plans. |
| `/apex-forge-wave-worker` | Execute assigned wave tasks. |

### External (2)

| Skill | What it does |
|-------|-------------|
| `/apex-forge-codex-consult` | Second opinion via OpenAI Codex CLI or independent subagent. |
| `/apex-forge-mobile-test` | Mobile device testing. |

---

## CLI Reference

Key commands. For the full list, run `apex-forge help`.

```bash
# Project
apex-forge init                              # initialize .apex/ in current project
apex-forge status                            # pipeline state, active tasks, memory stats
apex-forge recover                           # fix stale state after crashes

# Tasks
apex-forge task create TITLE [DESC] [DEPS]   # create a task
apex-forge task list [--status STATUS]        # list tasks
apex-forge task next                         # next unblocked task
apex-forge task assign|start|submit|verify|block|release ID

# Memory
apex-forge memory add CONTENT SCORE TAGS     # store a fact
apex-forge memory list [--min SCORE]         # list facts
apex-forge memory search QUERY               # keyword search
apex-forge memory curate                     # auto-extract knowledge
apex-forge memory prune                      # clean low-quality entries

# Browser
apex-forge-browse goto URL                   # navigate
apex-forge-browse snapshot -i                # list interactive elements
apex-forge-browse click|fill|screenshot      # interact
apex-forge-browse connect|disconnect         # visible/headless mode toggle

# Dashboard
apex-forge dashboard [--port PORT]           # web UI

# Orchestration
apex-forge orchestrate [--dry-run] [--once]  # multi-agent task dispatch

# Other
apex-forge telemetry report                  # skill usage stats
apex-forge worktree create|list|cleanup      # git worktree management
apex-forge sandbox js|python|bash CODE       # sandboxed execution
apex-forge issues list|import|view           # GitHub issue sync
apex-forge convert --platform PLATFORM       # export to Cursor/Codex/Gemini/Windsurf/Factory
apex-forge consensus test-all                # run all consensus protocol tests
```

> Complete CLI reference: [Usage Guide](docs/USAGE-GUIDE.zh-CN.md)

---

## Core Concepts

### Complexity Router

Not every task needs the full ceremony:

| Tier | When | Flow |
|------|------|------|
| **Tier 1** (single pass) | Simple fixes | Do it, verify, done |
| **Tier 2** (rounds) | Multi-step work | PDCA rounds with named types, max 5 rounds |
| **Tier 3** (waves) | Project-scale | Cross-session waves, persistent state in `.apex/state.json` |

The AI auto-detects which tier fits. You can override with `default_tier` in config.

### Escalation Ladder

Failure automatically raises the strictness level:

| Level | Trigger | Requirement |
|-------|---------|-------------|
| L0 | Normal | Standard protocol |
| L1 | 2nd failure | Fundamentally different approach |
| L2 | 3rd failure | 3 testable hypotheses |
| L3 | 4th failure | 7-point recovery checklist |
| L4 | 5th failure | Minimal reproduction, hand off to human |

### Evidence Grading

| Grade | Meaning | Minimum for |
|-------|---------|-------------|
| E0 | Guess | Hypothesis only |
| E1 | Indirect evidence | Hypothesis only |
| E2 | Direct evidence | Taking action |
| E3 | Multi-source verified | Claiming success |
| E4 | Verified + reproduced | Highest confidence |

### Verification Gate

Five steps before claiming "done":

1. Identify what command would **prove** the claim
2. Run it **now** (not old results)
3. Read the **full** output
4. Does the output confirm the claim? **Yes or no**
5. Only "yes" counts as done

Skip any step and it's not verification, it's guessing.

### TDD Iron Rule

No production code without a failing test. Write test, RED (confirm it fails for the right reason), GREEN, refactor. 14 rationalizations are pre-blocked.

### Knowledge Compounding

Every solved problem gets written to `docs/solutions/`. Overlap detection prevents duplicates. Stale docs get auto-refreshed. Over time, the system gets cheaper to run.

---

## Installation

Prerequisites: [Bun](https://bun.sh) 1.3+

### Claude Code (global -- recommended)

```bash
git clone https://github.com/d-wwei/apex-forge.git ~/.claude/skills/apex-forge
cd ~/.claude/skills/apex-forge
bun install && bun run build:all
bunx playwright install chromium
```

The protocol auto-activates on every session via the `hooks/session-start` hook.

### Claude Code (project-local)

```bash
git clone https://github.com/d-wwei/apex-forge.git .claude/skills/apex-forge
cd .claude/skills/apex-forge
bun install && bun run build:all
echo ".claude/skills/apex-forge" >> .gitignore
```

### Cursor

```bash
git clone https://github.com/d-wwei/apex-forge.git .cursor-plugin/apex-forge
cd .cursor-plugin/apex-forge && bun install && bun run build:all
```

### Codex / Factory

```bash
git clone https://github.com/d-wwei/apex-forge.git .agents/skills/apex-forge
cd .agents/skills/apex-forge && bun install && bun run build:all
```

### Gemini / Windsurf

```bash
git clone https://github.com/d-wwei/apex-forge.git apex-forge
cd apex-forge && bun install && bun run build:all
./dist/apex-forge convert --platform gemini   # or --platform windsurf
```

### Auto-detect

```bash
./setup    # Detects installed platforms, creates symlinks, writes .apex/config.yaml
```

---

## Configuration

Create `.apex/config.yaml` in your project root (auto-created by `./setup` or `apex-forge init`):

```yaml
default_tier: auto          # auto | 1 | 2 | 3
proactive: true             # suggest next stages automatically
compound_on_resolve: true   # auto-trigger knowledge capture after ship
max_concurrent_agents: 3    # for parallel sub-agent dispatch
autonomy: balanced          # high | balanced | controlled
solutions_dir: docs/solutions/
```

---

## Architecture

```
apex-forge/
  src/                        TypeScript, compiled to 3 binaries
    cli.ts                    Main CLI (apex-forge)
    commands/                 Task, memory, status, telemetry, worktree handlers
    browse/                   Headless browser daemon (apex-forge-browse)
    mcp/                      MCP server with role-based tools (apex-forge-mcp)
    consensus/                Raft, BFT, Gossip, CRDT implementations
    integrations/             GitHub issue tracker
    dashboard.ts              Web dashboard server
    orchestrator.ts           Multi-agent task dispatcher
    sandbox.ts                Sandboxed code execution (JS/Python/Bash)
    converter.ts              Cross-platform config export
    tracing.ts                Observability spans
    design.ts                 AI design generation

  workflow/                   43 skill files (Markdown with YAML frontmatter)
    stages/                   7 pipeline stages
    roles/                    34 role-based skills

  protocol/                   Core execution discipline
    SKILL.md                  Auto-injected protocol (14 sections)
    round-based-execution.md  PDCA rounds for Tier 2
    wave-based-delivery.md    Wave delivery for Tier 3

  orchestration/              Multi-agent coordination
    ARCHITECTURE.md           Architecture spec (10 sections)
    PATTERNS.md               10 reusable orchestration patterns
    registry-seeds.yaml       115 agent templates

  extension/                  Chrome Side Panel
    manifest.json             Extension manifest
    sidepanel.html/js         Side Panel UI
    background.js             Service worker
    content.js/css            Content script

  hooks/                      Session and git hooks
    session-start             Auto-injects protocol on every session
    state-helper              Bash functions for state, memory, worktree, telemetry
    task-helper               Task state machine operations

  platforms/                  Platform-specific manifests
    cursor/                   Cursor plugin
    codex/                    Codex agent config
    factory/                  Factory droid config
```

---

## Provenance

Every pattern traces to a specific source project.

| Capability | Source | License |
|-----------|--------|---------|
| Auto-triggering, TDD enforcement, verification gate | [superpowers](https://github.com/obra/superpowers) | MIT |
| Complexity router, escalation ladder, evidence grading | [better-work-skill](https://github.com/d-wwei/better-work-skill) | MIT |
| Phase discipline, knowledge compounding, multi-persona review | [compound-engineering](https://github.com/EveryInc/compound-engineering-plugin) | MIT |
| Role-based skills, telemetry, proactive routing | [gstack](https://github.com/garrytan/gstack) | MIT |
| Single-authority orchestrator, workspace isolation | [symphony](https://github.com/openai/symphony) | MIT |
| Task state machine, role enforcement, dual-stage acceptance | [chorus](https://github.com/Chorus-AIDLC/Chorus) | MIT |
| LLM-curated memory, sandbox propagation, subagent safety | [deer-flow](https://github.com/bytedance/deer-flow) | Apache 2.0 |
| Ledger pattern, skills registry, cost-aware routing | [ruflo](https://github.com/ruvnet/ruflo) | MIT |

Full attribution: [docs/PROVENANCE.md](docs/PROVENANCE.md)

---

## Troubleshooting

**Commands don't appear?**
```bash
ls -la ~/.claude/skills/apex-forge          # check symlink
ln -sf /path/to/apex-forge ~/.claude/skills/apex-forge  # re-link
```

**Browser errors?**
```bash
cd ~/.claude/skills/apex-forge && bunx playwright install chromium
```

**Dashboard won't open?**
```bash
apex-forge dashboard --port 3456 && open http://localhost:3456
```

**State corruption?**
```bash
apex-forge recover                          # auto-fix
```

---

## Stats

| Metric | Count |
|--------|-------|
| Source files (excluding deps) | 128 |
| Lines of code | ~28,000 |
| Automated tests | 55 |
| Skill files | 43 |
| Agent templates | 115 |
| Browser commands | 59 |
| Consensus protocols | 4 |

---

## License

MIT -- see [LICENSE](LICENSE).

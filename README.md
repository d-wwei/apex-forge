# Apex Forge

[中文文档](README.zh-CN.md)

An agent development platform that bundles execution discipline, workflow automation, browser testing, multi-agent orchestration, and knowledge management into one installable package. Remixed from 8 open-source projects.

## Why

AI coding agents are unreliable. They guess instead of verifying. They skip tests. They claim "done" without proof. They can't coordinate on multi-step tasks. And you end up installing 5 different tools to get a complete workflow.

Apex Forge fixes this by enforcing discipline at the protocol level, not by hoping the agent behaves.

## Quick Start

```bash
git clone https://github.com/user/apex-forge.git ~/.claude/skills/apex-forge
cd ~/.claude/skills/apex-forge
bun install && bun run build:all
bunx playwright install chromium
./dist/apex-forge init
```

You now have 3 binaries (`apex-forge`, `apex-forge-browse`, `apex-forge-mcp`), 43 skills, and a protocol that auto-injects on every session.

## What You Get

You can **enforce execution discipline** -- the protocol auto-injects on session start via hooks. No code ships without tests. No success claims without evidence. No implementation before design approval.

You can **run a full development pipeline** -- brainstorm, plan, execute, review, ship, capture knowledge, verify. Each stage checks that upstream work exists before running.

You can **route tasks by complexity** -- simple fixes get one verification cycle, multi-step work gets PDCA rounds, project-scale work gets persistent cross-session waves.

You can **review code from 18 perspectives** -- 3 always-on reviewers (security, correctness, spec compliance), 9 conditional specialists, 5 framework-specific experts, and 1 adversarial reviewer.

You can **automate browser testing** -- headless Chromium with 59 commands, a Chrome extension with Side Panel, cookie import for authenticated sessions.

You can **manage tasks with enforced state transitions** -- `open -> assigned -> in_progress -> to_verify -> done`. No skipping steps. Dependencies, worktree isolation, and auto-assignment included.

You can **build persistent memory** -- facts stored with confidence scores (0.0-1.0), tagged and searchable. Low-confidence entries get pruned automatically. High-confidence facts inject into session context.

You can **orchestrate multiple agents** -- 4 consensus protocols (Raft, BFT, Gossip, CRDT), 115 agent templates, role-based tool gating, cost-aware routing.

You can **track everything** -- telemetry records skill execution timing and outcomes. A web dashboard shows Kanban board, activity stream, and performance data.

You can **convert to other platforms** -- export your setup to Cursor, Codex, Factory, Gemini, or Windsurf format with one command.

---

## Skills (43 total)

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

## CLI Commands

The `apex-forge` binary handles state, tasks, memory, and infrastructure:

```
apex-forge init                              Initialize .apex/ in current project
apex-forge status                            Show pipeline state, active tasks, memory stats
apex-forge dashboard                         Launch web dashboard (Kanban, activity, telemetry)
apex-forge recover                           Fix stale state after crashes

apex-forge task create TITLE                 Create a task
apex-forge task assign ID [AGENT]            Assign a task
apex-forge task start ID                     Move task to in_progress
apex-forge task submit ID                    Move task to to_verify
apex-forge task verify ID                    Move task to done
apex-forge task block ID REASON              Block a task
apex-forge task release ID                   Release assignment back to open
apex-forge task list [--status STATUS]        List tasks
apex-forge task next                         Show next unblocked task

apex-forge memory add CONTENT [--tags T]     Store a fact with confidence score
apex-forge memory list [--tag TAG]           List stored facts
apex-forge memory search QUERY               Search facts by keyword
apex-forge memory remove ID                  Delete a fact
apex-forge memory inject                     Format facts for context injection
apex-forge memory prune                      Remove low-confidence facts, cap at 100
apex-forge memory curate                     Interactive review and scoring
apex-forge memory extract-llm                Extract facts from LLM conversation

apex-forge telemetry start SKILL             Begin timing a skill run
apex-forge telemetry end ID [OUTCOME]        Record completion
apex-forge telemetry report                  Show usage stats
apex-forge telemetry sync                    Upload to dashboard

apex-forge worktree create BRANCH            Create isolated git worktree
apex-forge worktree list                     List active worktrees
apex-forge worktree cleanup                  Remove merged worktrees

apex-forge consensus test                    Run Raft consensus test
apex-forge consensus test-bft                Run BFT consensus test
apex-forge consensus test-gossip             Run Gossip protocol test
apex-forge consensus test-crdt               Run CRDT convergence test
apex-forge consensus test-all                Run all consensus tests

apex-forge design generate PROMPT            Generate UI design with AI
apex-forge design variants PROMPT            Generate multiple design variants
apex-forge design compare A B                Compare two designs
apex-forge design list                       List saved designs

apex-forge sandbox javascript CODE           Run JS in sandbox
apex-forge sandbox python CODE               Run Python in sandbox
apex-forge sandbox bash CODE                 Run Bash in sandbox

apex-forge issues list                       List GitHub issues
apex-forge issues import ISSUE_NUM           Import issue as task
apex-forge issues view ISSUE_NUM             View issue details
apex-forge issues status TASK_ID STATUS      Sync task status to GitHub

apex-forge trace start NAME                  Begin an observability span
apex-forge trace end ID                      End a span
apex-forge trace active                      Show active spans
apex-forge trace list                        List completed spans
apex-forge trace view ID                     View span details

apex-forge convert --platform cursor         Convert config for Cursor
apex-forge convert --platform codex          Convert config for Codex
apex-forge convert --platform factory        Convert config for Factory
apex-forge convert --platform gemini         Convert config for Gemini
apex-forge convert --platform windsurf       Convert config for Windsurf

apex-forge orchestrate [--dry-run] [--once]  Run multi-agent task dispatcher
apex-forge serve [--role admin|developer|pm] Start MCP server with role-based tools
```

---

## Installation

Prerequisites: [Bun](https://bun.sh) 1.3+

### Claude Code (global -- recommended)

```bash
git clone https://github.com/user/apex-forge.git ~/.claude/skills/apex-forge
cd ~/.claude/skills/apex-forge
bun install && bun run build:all
bunx playwright install chromium
```

The protocol auto-activates on every session via the `hooks/session-start` hook.

### Claude Code (project-local)

```bash
git clone https://github.com/user/apex-forge.git .claude/skills/apex-forge
cd .claude/skills/apex-forge
bun install && bun run build:all
echo ".claude/skills/apex-forge" >> .gitignore
```

### Cursor

```bash
git clone https://github.com/user/apex-forge.git .cursor-plugin/apex-forge
cd .cursor-plugin/apex-forge && bun install && bun run build:all
```

### Codex / Factory

```bash
git clone https://github.com/user/apex-forge.git .agents/skills/apex-forge
cd .agents/skills/apex-forge && bun install && bun run build:all
```

### Gemini / Windsurf

```bash
git clone https://github.com/user/apex-forge.git apex-forge
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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for full details.

Short version:

1. Fork and clone
2. `bun install`
3. Make changes
4. `bun test` -- all tests must pass
5. `bun run build:all` -- all 3 binaries must compile
6. Submit PR

To add a new skill: create `workflow/roles/my-skill.md` with YAML frontmatter, register it in `.claude-plugin`, or use `/apex-forge-skill-author`.

To add a CLI command: add handler in `src/commands/`, wire it in `src/cli.ts`, add tests in `src/__tests__/`, rebuild.

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

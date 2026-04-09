Execution protocol for AI coding agents. Routes tasks through complexity tiers, enforces phase gates, TDD, evidence grading, and verification gates.

# Apex Forge

## What it does

Apex Forge is a protocol orchestrator, not a framework. It provides execution discipline (complexity routing, phase gates, evidence grading) while delegating domain knowledge to independent companion skills. The pipeline runs: brainstorm, plan, execute, review, ship, compound.

Seven companion skills handle specialized work:
- `systematic-debugging` — root-cause debugging with Iron Law discipline
- `thorough-code-review` — pre-merge review + incoming feedback evaluation
- `security-audit` — infrastructure-first CWE-tagged audit
- `browser-qa-testing` — tiered QA with headless browser automation
- `tasteful-frontend` — opinionated frontend design guidance
- `design-to-code-runner` — spec-first Figma/screenshot to code
- `product-review` — product experience evaluation

All companion skills install automatically. Each works standalone or orchestrated through the AF pipeline.

## Quick Start

```bash
# Clone and install (installs AF + all 7 companion skills)
git clone https://github.com/d-wwei/apex-forge
cd apex-forge
bash skill/install.sh

# Initialize a project
apex init

# Run the pipeline
/apex-forge brainstorm    # requirements exploration
/apex-forge plan          # implementation planning
/apex-forge execute       # TDD-first implementation
/apex-forge review        # multi-persona quality gate
/apex-forge ship          # commit, push, PR
```

## Core Protocol

| Mechanism | What it does |
|-----------|-------------|
| Complexity Router | Tier 1 (single pass), Tier 2 (round-based PDCA), Tier 3 (wave-based cross-session) |
| Phase Gates | Brainstorm (WHAT), Plan (HOW), Execute (DO). No leaking between phases. |
| TDD Iron Law | Write test, RED, implement, GREEN, refactor. No exceptions. |
| Evidence Grading | E0 (guess) through E4 (validated). Minimum E2 for action, E3 for success claims. |
| Verification Gate | 5-step gate before any success claim. Skip a step = lying. |
| Escalation Ladder | L0-L4. After 5 failures, escalate to human with full context. |
| Skill Dispatch | `bindings.yaml` maps pipeline stages to external skills with version constraints. |

## Architecture

```
apex-forge (this repo)
├── skill/SKILL.md          Core protocol
├── skill/bindings.yaml     Stage → external skill mapping
├── skill/gates/            AF-owned quality gates
├── skill/stages/           Pipeline stage definitions
├── skill/roles/            Orchestration + utility roles
├── skill/aliases/          Backward-compatible command aliases
├── src/                    CLI + MCP server + state management
└── dist/                   Compiled binaries
         │
         │ Hard dependencies (install.sh auto-installs)
         ▼
    7 companion skill repos (independent, each works standalone)
```

## Platform Support

Works with any AI agent that can execute shell commands: Claude Code, Codex, Gemini CLI, Cursor, OpenCode, Windsurf.

```bash
# Detected automatically during install:
~/.claude/skills/apex-forge    # Claude Code
~/.codex/skills/apex-forge     # Codex
~/.gemini/skills/apex-forge    # Gemini
~/.opencode/skills/apex-forge  # OpenCode
```

## Updating Companion Skills

```bash
bash skill/install.sh update
```

Pulls latest for all companion skills. AF's session-start hook also checks for missing skills on every session and installs them automatically.

## License

MIT

---

AI 编程 Agent 的执行协议。通过复杂度分级路由任务，强制执行阶段门控、TDD、证据分级和验证门。

# Apex Forge

## 定位

Apex Forge 是协议编排器，不是框架。核心价值是执行纪律（复杂度路由、阶段门控、证据分级），领域能力由独立的 companion skill 提供。Pipeline 流程：brainstorm, plan, execute, review, ship, compound。

7 个 companion skill 处理专业工作：
- `systematic-debugging` — Iron Law 根因调试
- `thorough-code-review` — 代码审查（发起 + 接收反馈）
- `security-audit` — 基础设施优先的 CWE 安全审计
- `browser-qa-testing` — 分级 QA 测试 + 无头浏览器自动化
- `tasteful-frontend` — 有态度的前端设计指导
- `design-to-code-runner` — 设计稿还原代码
- `product-review` — 产品体验评审

所有 companion skill 自动安装。每个既可独立使用，也可通过 AF pipeline 编排。

## 快速开始

```bash
# 克隆并安装（自动安装 AF + 全部 7 个 companion skill）
git clone https://github.com/d-wwei/apex-forge
cd apex-forge
bash skill/install.sh

# 初始化项目
apex init

# 执行 pipeline
/apex-forge brainstorm    # 需求探索
/apex-forge plan          # 实现规划
/apex-forge execute       # TDD 实现
/apex-forge review        # 多角色质量门
/apex-forge ship          # 提交、推送、PR
```

## 核心协议

| 机制 | 作用 |
|------|------|
| 复杂度路由 | Tier 1（单次通过）、Tier 2（PDCA 轮次）、Tier 3（跨会话波次） |
| 阶段门控 | Brainstorm（WHAT）、Plan（HOW）、Execute（DO），阶段间不可泄漏 |
| TDD 铁律 | 写测试, RED, 实现, GREEN, 重构，无例外 |
| 证据分级 | E0（猜测）到 E4（多源验证），行动最低 E2，成功声明最低 E3 |
| 验证门 | 5 步门控，任何成功声明前必须通过。跳步 = 撒谎 |
| 升级阶梯 | L0-L4，5 次失败后带完整上下文升级给人类 |
| Skill 派发 | `bindings.yaml` 将 pipeline 阶段映射到外部 skill，含版本约束 |

## 平台支持

适用于任何能执行 shell 命令的 AI Agent：Claude Code、Codex、Gemini CLI、Cursor、OpenCode、Windsurf。

## 更新 Companion Skills

```bash
bash skill/install.sh update
```

Session-start hook 每次启动时自动检查并安装缺失的 companion skill。

## License

MIT

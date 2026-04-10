---
title: UDD Kit + UpdateKit Integration Plan
scope: standard
status: approved
created: 2026-04-10
source: docs/brainstorms/self-evolution-integration-requirements.md
task_count: 7
complexity: medium
---

## Problem Frame

Apex Forge 分发给用户后，没有自动更新和贡献回流机制。需要集成 UpdateKit（自动更新）和 UDD Kit（自愈+贡献），让用户安装后开箱即用。

## Decision Log

| Decision | Rationale | Rejected |
|----------|-----------|----------|
| npm 依赖而非 git submodule | 标准依赖管理，`bun install` 即可，无需 `--recursive` | git submodule（维护成本高、用户体验差） |
| udd-kit 用 GitHub URL 依赖 | 尚未发 npm，GitHub dep 是过渡方案 | 等发 npm 再集成（阻塞进度） |
| update-kit 用 npm | 已发布 v0.1.12 | — |
| quickCheck 在 CLI main() 入口 | 不阻塞（<5ms cached），所有命令受益 | 仅在 `apex status` 检查（覆盖不全） |
| adapter 独立文件 | 清晰分层，便于测试和替换 | 内联到命令文件（耦合） |
| 更新策略用 custom_command | apex-forge 是 git clone + bun build，非标准 npm 包 | git_pull（不处理 rebuild） |

## File Manifest

### Create

| File | Purpose |
|------|---------|
| `src/adapters/update-adapter.ts` | UpdateKit adapter — 提供 host context + confirm handler |
| `src/adapters/udd-adapter.ts` | UDD Kit adapter — 提供 error context + repair agent hook |
| `src/commands/update.ts` | `apex update-check / update / rollback` 命令 |
| `src/commands/heal.ts` | `apex heal / contribute / issue-draft` 命令 |
| `update.config.json` | UpdateKit 配置，指向 d-wwei/apex-forge |
| `udd.config.json` | UDD Kit 配置，指向 d-wwei/apex-forge |

### Modify

| File | Change |
|------|--------|
| `package.json` | 添加 udd-kit (GitHub) + update-kit (npm) 依赖 |
| `src/cli.ts` | 注册 update/heal/contribute 命令 + 启动 quickCheck 钩子 |
| `skill/install.sh` | 安装后执行 `bun install`（拉 npm 依赖） |

### Test

| File | Covers |
|------|--------|
| `tests/update-adapter.test.ts` | UpdateKit adapter context + config 加载 |
| `tests/udd-adapter.test.ts` | UDD adapter context + error 收集 |
| `tests/cli-update.test.ts` | CLI update-check / update / rollback 命令路由 |
| `tests/cli-heal.test.ts` | CLI heal / contribute 命令路由 |

## Task Decomposition

### T1: 添加 npm 依赖
- **Description**: package.json 加 update-kit + udd-kit 依赖，跑 bun install
- **Files**: `package.json`, `bun.lock`
- **Complexity**: trivial
- **Dependencies**: none
- **Criteria**: AC-5 (配置存在)

### T2: 创建 UpdateKit adapter + config
- **Description**: 实现 UpdateAdapter，配置指向 d-wwei/apex-forge，install strategy 用 custom_command（git pull + bun run build）
- **Files**: `src/adapters/update-adapter.ts`, `update.config.json`
- **Test files**: `tests/update-adapter.test.ts`
- **Complexity**: small
- **Dependencies**: T1
- **Criteria**: AC-1, AC-2, AC-5

### T3: 创建 UDD Kit adapter + config
- **Description**: 实现 UddAdapter，配置 selfHealing 策略（agent_patch for .ts, issue_only for .md），hooks 用 bun test
- **Files**: `src/adapters/udd-adapter.ts`, `udd.config.json`
- **Test files**: `tests/udd-adapter.test.ts`
- **Complexity**: small
- **Dependencies**: T1
- **Criteria**: AC-3, AC-4, AC-5

### T4: 实现 update 命令
- **Description**: `apex update-check` (调用 quickCheck), `apex update` (调用 apply), `apex rollback` (调用 rollback)，支持 --json
- **Files**: `src/commands/update.ts`
- **Test files**: `tests/cli-update.test.ts`
- **Complexity**: medium
- **Dependencies**: T2
- **Criteria**: AC-1, AC-2, AC-7

### T5: 实现 heal 命令
- **Description**: `apex heal --error "..."` (调用 UDD heal), `apex contribute` (调用 UDD contribute), `apex issue-draft` (调用 UDD issue-draft)，支持 --json
- **Files**: `src/commands/heal.ts`
- **Test files**: `tests/cli-heal.test.ts`
- **Complexity**: medium
- **Dependencies**: T3
- **Criteria**: AC-3, AC-4, AC-7

### T6: CLI 集成 — 注册命令 + startup quickCheck
- **Description**: cli.ts 的 main() 入口加 quickCheck 钩子（静默，有更新时提示）；switch 里注册 update/heal/contribute/issue-draft/rollback 命令
- **Files**: `src/cli.ts`
- **Complexity**: small
- **Dependencies**: T4, T5
- **Criteria**: AC-6

### T7: install.sh 更新
- **Description**: 安装流程中加一步 `bun install`，确保 npm 依赖被拉取；更新后的 rebuild 也要跑 bun install
- **Files**: `skill/install.sh`
- **Complexity**: trivial
- **Dependencies**: T1
- **Criteria**: AC-5

## Dependency Graph

```
T1 (npm deps)
├── T2 (update adapter) → T4 (update cmd) ─┐
├── T3 (udd adapter)    → T5 (heal cmd)   ─┤→ T6 (CLI integration)
└── T7 (install.sh)                         │
```

T2/T3/T7 可并行。T4 依赖 T2，T5 依赖 T3。T6 依赖 T4+T5。

## Test Plan

| Acceptance Criterion | Test Scenario | Test File |
|---------------------|---------------|-----------|
| AC-1: update-check 检测新版本 | Given apex-forge v0.1.0, when upstream has v0.2.0, then quickCheck returns upgrade_available | tests/update-adapter.test.ts |
| AC-2: update 执行安全更新 | Given update available, when `apex update`, then runs git pull + bun build + verify | tests/cli-update.test.ts |
| AC-3: heal 触发自愈 | Given an error message, when `apex heal --error "..."`, then UDD diagnoses and attempts repair | tests/cli-heal.test.ts |
| AC-4: contribute 提交 PR | Given local fix on branch, when `apex contribute`, then creates PR via UDD | tests/cli-heal.test.ts |
| AC-5: 配置文件存在 | Given fresh clone, when ls *.config.json, then both udd.config.json and update.config.json exist | tests/update-adapter.test.ts |
| AC-6: 启动 quickCheck | Given CLI startup, when any command runs, then quickCheck executes silently (<5ms cached) | tests/cli-update.test.ts |
| AC-7: --json 支持 | Given --json flag, when any new command runs, then output is valid JSON | tests/cli-update.test.ts |

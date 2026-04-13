---
title: "Full Pipeline Hard Gate — 六步主干硬控 + 支线挂载架构"
scope: standard
status: draft
created: 2026-04-12
source: Conversation analysis of Tasteful Frontend phase-skip incident
task_count: 4
complexity: medium
---

# Problem Frame

Agent 在 Execute 完成后直接 git commit，跳过 Review 和 Compound。根本原因：
SKILL.md Phase Discipline 只定义了 Brainstorm → Plan → Execute 三步硬门，
Review/Ship/Compound 虽然有 stage 文件但不在硬控链条里。Agent 没有违规——
它忠实执行了一个不完整的规则。

---

# Decision Log

| Decision | Rationale | Rejected Alternative |
|----------|-----------|---------------------|
| 扩展主干为六步全链条 | 从结构上堵死跳过，而非依赖 Agent 自觉 | 只加 git commit 拦截（治标不治本） |
| 加 git 操作拦截作为冗余层 | 防御纵深：即使 Agent 没读到硬门规则也能被拦住 | 只改优先级层次（太弱） |
| Tier 1 走短路径 Execute → Ship | 小任务不需要全链条，避免过度约束 | 所有 Tier 都走六步（太重） |
| 主干/支线分离架构 | 为将来新增子流程留出扩展空间 | 把所有流程都硬编码在 Phase Discipline 里 |
| 修改 using-superpowers 优先级 | 消除"用户指令 > 硬门"的歧义 | 不改（矛盾继续存在） |

---

# File Manifest

| Action | File | Description |
|--------|------|-------------|
| modify | `skill/SKILL.md` | 核心改动：Phase Discipline 六步链 + 违规表 + git 拦截 + 主干/支线架构 |
| modify | `protocol/SKILL.md` | 详细规范同步：Phase Discipline + Phase Violations + Anti-Patterns |
| modify | `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.6/skills/using-superpowers/SKILL.md` | 优先级消歧义 |

---

# Task Decomposition

## T1: 修改 skill/SKILL.md — Phase Discipline 全链条

**Files**: `skill/SKILL.md`
**Complexity**: medium
**Dependencies**: none

改动内容（Section 2 "Phase Discipline"）：

### 1a. 扩展阶段定义（3 步 → 6 步）

现有三步之后增加：
- **Review (CHECK)** — 多角色质量审查。Execute 完成后必须进入。
- **Ship (DELIVER)** — 打包交付。Review 通过后才能 commit/push/PR。
- **Compound (LEARN)** — 知识提取。Ship 后提示进入（可跳过但必须被提示）。

### 1b. 增加 Tier 降级规则

```
Tier 1: Execute → Ship（验证后直接交付，单步任务）
Tier 2: Brainstorm → Plan → Execute → Review → Ship → Compound（完整链条）
Tier 3: 同 Tier 2 + Wave 管理
```

### 1c. 扩展违规表

新增三行：

| Violation | Example | Correction |
|-----------|---------|------------|
| Ship without Review | Execute 后直接 git commit | Stop. 进入 Review 阶段。代码不可在未审查状态提交。 |
| Git ops outside Ship | pipeline 活跃期间直接 git commit/push | Stop. git commit/push 只能在 Ship 阶段内执行。 |
| Skip Compound prompt | Ship 后不提示复盘 | 必须调用 AskUserQuestion 询问是否进入 Compound。用户可拒绝，但必须被问到。 |

### 1d. 增加 git 操作拦截规则

新增一段：

**Git Operations Interlock**: 当 pipeline 处于活跃状态（stage != idle）时：
- `git commit`, `git push`, `gh pr create` 只能在 Ship 阶段内执行
- 用户说"提交"/"commit"/"push" = 请求进入 Ship 阶段，不是授权跳过 Review
- 如果当前 stage 是 execute，Agent 必须回答："Execute 完成，需要先过 Review 再提交。"

### 1e. 增加主干/支线架构定义

Phase Discipline 末尾新增一段解释主干 vs 支线：

**Pipeline Architecture: Backbone + Sidecar**

主干（Backbone）：硬控，不可跳过。保护所有代码变更都需要的质量底线。
```
Brainstorm → Plan → Execute → Review → Ship → [Compound: prompted]
```

支线（Sidecar）：条件触发，挂载在主干阶段上。通过 `bindings.yaml` 管理。
- Execute 阶段可挂载：Design sub-flow, Browser QA, ...
- Review 阶段可挂载：Design baseline gate, Security audit, SQL safety, ...

支线特征：
- 触发条件不满足就不跑（不是硬门）
- 可随时新增，不影响主干
- 通过 bindings.yaml 声明，不写死在 Phase Discipline 里

### 1f. 更新 Quick Reference

```
PHASES:    Brainstorm → Plan → Execute → Review → Ship → Compound
```

---

## T2: 修改 protocol/SKILL.md — 详细规范同步

**Files**: `protocol/SKILL.md`
**Complexity**: medium
**Dependencies**: T1（保持两个文件一致）

### 2a. Section 3 "Phase Discipline" 扩展

在 Execute Phase 之后增加：

**Review Phase (CHECK)**
Purpose: 质量关卡。多角色审查。
Rules:
- Execute 完成后强制进入
- 不可跳过（Tier 2/3 必须走）
- Output: Review artifact with status

**Ship Phase (DELIVER)**
Purpose: 打包交付。
Rules:
- Review 通过后才能进入
- 所有 git 操作只在此阶段内执行
- Output: Commit, push, PR

**Compound Phase (LEARN)**
Purpose: 知识提取与复盘。
Rules:
- Ship 后提示进入
- 用户可跳过，但必须被提示
- Output: Solution docs, roadmap snapshot, memory capture

### 2b. Phase Violations 表扩展

同 T1 的 1c，增加三行违规。

### 2c. Anti-Patterns 表（Section 12）增加一行

| # | Anti-Pattern | Detection Signal | Correction |
|---|---|---|---|
| 11 | Ship without Review | git commit/push while stage is execute or review not completed | Enter Review stage. Complete review. Then Ship. |

### 2d. Quick Reference 更新

```
PHASES:    Brainstorm (WHAT) → Plan (HOW) → Execute (DO) → Review (CHECK) → Ship (DELIVER) → Compound (LEARN)
```

---

## T3: 修改 using-superpowers — 优先级消歧义

**Files**: `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.6/skills/using-superpowers/SKILL.md`
**Complexity**: trivial
**Dependencies**: none

在 "Instruction Priority" section，第 26 行之后增加一段 caveat：

```markdown
**Hard-gate exception**: User instructions cannot override hard-gated protocol
constraints (e.g., phase gates, TDD requirements, verification gates). A user
saying "commit" or "ship it" is a request to ENTER the Ship stage, not
authorization to bypass Review. Similarly, "skip tests" cannot override TDD
Iron Law. Hard gates exist to protect the user from the agent's compliance
bias — the tendency to do what feels helpful over what is actually correct.
```

---

## T4: 验证改动一致性

**Files**: all three modified files
**Complexity**: trivial
**Dependencies**: T1, T2, T3

验证：
1. SKILL.md 和 protocol/SKILL.md 的 Phase Discipline 定义一致
2. 违规表条目一致
3. Quick Reference 一致
4. Tier 降级规则在两个文件中都有体现
5. using-superpowers 的消歧义不与 apex-forge 的定义矛盾

---

# Test Plan

| Acceptance Criterion | Scenario | Verification |
|---------------------|----------|--------------|
| 六步链条在主文件中可见 | 读 SKILL.md Section 2 | Phase chain 显示 6 步 |
| 违规表覆盖 Review/Ship/Compound | 读 SKILL.md 违规表 | 至少 3 行新违规 |
| Git 拦截规则存在 | 读 SKILL.md | "Git Operations Interlock" 段落存在 |
| Tier 降级规则存在 | 读 SKILL.md | Tier 1/2/3 路径明确 |
| protocol 与 skill 一致 | 对比两文件的 Phase Discipline | 定义一致 |
| 优先级消歧义存在 | 读 using-superpowers | "Hard-gate exception" 段落存在 |
| 主干/支线架构定义存在 | 读 SKILL.md | "Backbone + Sidecar" 段落存在 |

---

# Dependency Graph

```
T1 (SKILL.md) ──┐
                 ├──→ T4 (验证一致性)
T2 (protocol)  ──┘
T3 (superpowers) ──→ T4
```

T1 和 T2 可以并行。T3 独立。T4 等前三个完成后执行。

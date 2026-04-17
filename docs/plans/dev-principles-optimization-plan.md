---
title: "Development Principles Optimization Plan"
scope: standard
status: approved
created: 2026-04-17
updated: 2026-04-17
source_requirements: docs/brainstorms/dev-principles-optimization-requirements.md
task_count: 6
complexity: medium
---

## Problem Frame

apex-forge 有成熟的执行协议但缺少项目级开发原则的文档化和工具化。13 条原则中 5 条完全未覆盖（零依赖策略、向后兼容性、linter 门禁、防重复计数、用户行为调查）。需要在 CONTRIBUTING.md、CI、brainstorm checklist、ADR 目录四个落地点系统性补齐。

## Decision Log

**Decision 1**: ADR 目录独立于 docs/solutions/。
**Rationale**: solutions 记录经验教训（从问题出发），ADR 记录决策选择（从岔路口出发）。两者互补，合并会模糊职责。
**Alternatives rejected**: 合并到 docs/solutions/ —— 会让 solutions 变成既有经验又有决策的混合体，检索困难。

**Decision 2**: Biome 用 recommended preset，不自定义规则。
**Rationale**: 自定义规则维护成本高，recommended 随版本自动更新。24K 行代码用默认即可。
**Alternatives rejected**: ESLint + Prettier —— 两个工具各一套配置，经常冲突，速度慢 100x。

**Decision 3**: 向后兼容检测只检查 CLI exit code + JSON 可解析。
**Rationale**: 完整契约测试成本过高（需要维护 expected output 快照），当前 v0.2.x 阶段不值得。
**Alternatives rejected**: 输出快照比对 —— 任何文案调整都会 break 快照，维护负担大。

**Decision 4**: ADR 触发条件为 scope Standard/Deep 且 approaches ≥2。
**Rationale**: Lightweight scope（单文件修改）不需要 ADR，强制会变成官僚负担。
**Alternatives rejected**: 所有 scope 都要求 ADR —— 修一个 typo 也要写 ADR 显然不合理。

## File Manifest

| Category | Path | Action |
|----------|------|--------|
| Create | `docs/decisions/TEMPLATE.md` | ADR 模板 |
| Create | `docs/decisions/0001-hybrid-changelog-format.md` | 示例 ADR |
| Create | `biome.json` | Biome 配置 |
| Modify | `CONTRIBUTING.md` | 新增 7 个 section |
| Modify | `package.json` | devDependencies 加 @biomejs/biome |
| Modify | `.github/workflows/ci.yml` | 加 biome ci + backward compat test |
| Modify | `skill/details/brainstorm-checklist.md` | 增补 3 项检查 |
| Modify | `skill/stages/brainstorm.md` | exit gate 新增 ADR 检查 |
| Modify | `skill/stages/ship.md` | Step 2 CHANGELOG 模板更新 |
| Test | `src/__tests__/dev-principles.test.ts` | ADR 模板 + biome.json + CI 验证 |

**8-Files Rule**: 9 个手动修改的文件，+1 test。超出 8 个上限。逐文件审查：每个文件对应不同 AC，无可合并项，全部必要。`src/**/*.ts` 的 biome auto-fix 是批量自动操作，不计入手动修改。

## Task List

| Task ID | Description | Files | Test Files | Complexity | Dependencies | Acceptance Criteria |
|---------|-------------|-------|-----------|-----------|-------------|---------------------|
| T1 | 创建 ADR 目录、模板和示例 ADR | `docs/decisions/TEMPLATE.md`, `docs/decisions/0001-hybrid-changelog-format.md` | `src/__tests__/dev-principles.test.ts` (部分) | small | — | AC2 |
| T2 | 安装 Biome，配置，auto-fix 存量代码 | `biome.json`, `package.json`, `src/**/*.ts` | `src/__tests__/dev-principles.test.ts` (部分) | small | — | AC3 (部分) |
| T3 | 更新 CI：Biome 门禁 + CLI 向后兼容测试 | `.github/workflows/ci.yml` | — (CI 本身是测试) | small | T2 | AC3 (完成), AC7 |
| T4 | 更新 CONTRIBUTING.md：7 个新 section | `CONTRIBUTING.md` | — (文档，无代码测试) | medium | T1, T2 | AC1 |
| T5 | 更新 brainstorm checklist + exit gate | `skill/details/brainstorm-checklist.md`, `skill/stages/brainstorm.md` | — (skill 文件，无代码测试) | small | T1 | AC4, AC5 |
| T6 | 更新 ship stage CHANGELOG 模板 | `skill/stages/ship.md` | — (skill 文件，无代码测试) | trivial | — | AC6 |

## Test Plan

| Acceptance Criterion | Scenario | Given / When / Then | Test File |
|---------------------|----------|----------------------|-----------|
| AC1 | CONTRIBUTING.md 新 sections 存在 | Given CONTRIBUTING.md / When 读取文件 / Then 包含 "Dependency Policy", "Backward Compatibility", "Changelog Format", "Architecture Decision Records", "Security Principles", "Linting", "Test Requirement" 7 个 section header | `src/__tests__/dev-principles.test.ts` |
| AC2 | ADR 模板可用 | Given docs/decisions/ / When 列出文件 / Then TEMPLATE.md 存在且包含 Status, Context, Decision, Rejected Alternatives, Consequences 5 个 section | `src/__tests__/dev-principles.test.ts` |
| AC2 | 示例 ADR 存在 | Given docs/decisions/ / When 列出文件 / Then 至少 1 个 0001-*.md 文件存在 | `src/__tests__/dev-principles.test.ts` |
| AC3 | Biome 零警告 | Given biome.json 存在 / When 运行 `bunx biome ci src/` / Then exit code 0 | `src/__tests__/dev-principles.test.ts` |
| AC3 | Biome 在 CI 中 | Given .github/workflows/ci.yml / When 读取 / Then 包含 `biome ci` 步骤 | `src/__tests__/dev-principles.test.ts` |
| AC4 | Brainstorm checklist 有 3 项新增 | Given brainstorm-checklist.md / When 读取 / Then 包含 "Capability Audit", "Evidence of Need", "Anti-Double-Counting" 关键词 | `src/__tests__/dev-principles.test.ts` |
| AC5 | Brainstorm exit gate 有 ADR 检查 | Given brainstorm.md / When 读取 exit gate 区域 / Then 包含 docs/decisions 相关检查项 | `src/__tests__/dev-principles.test.ts` |
| AC6 | Ship CHANGELOG 模板为混合格式 | Given ship.md / When 读取 Step 2 / Then 包含 "Added" 和 "Changed" 分类关键词 + 叙事 block 说明 | `src/__tests__/dev-principles.test.ts` |
| AC7 | CI 有向后兼容测试 | Given ci.yml / When 读取 / Then 包含 backward compatibility 相关测试步骤 | `src/__tests__/dev-principles.test.ts` |

## Dependency Graph

```
T1 ──→ T4
  └──→ T5
T2 ──→ T3
  └──→ T4
T6 (independent)

Parallel groups:
  Round 1: T1, T2, T6 (all independent)
  Round 2: T3, T5 (T3 depends T2; T5 depends T1)
  Round 3: T4 (depends T1 + T2)
```

## Execution Notes

**T2 (Biome) 的 auto-fix 策略**：
1. `bun add -d @biomejs/biome` 安装
2. 写 `biome.json`（recommended preset + TypeScript + Bun 配置）
3. `bunx biome check --write src/` 自动修复
4. `bunx biome ci src/` 验证零警告
5. 如果仍有手动修复项，逐个解决
6. `bun test` 确认 auto-fix 没破坏功能

**T4 (CONTRIBUTING.md) 的 7 个 section 简述**：
1. Dependency Policy — 新依赖需说明：内置能力为何不够 / 替代方案 / 维护风险
2. Backward Compatibility — 已发布 CLI 命令和配置格式不可 breaking change
3. Changelog Format — 混合格式模板引用
4. Architecture Decision Records — ADR 流程 + 触发条件 + 模板引用
5. Security Principles — 分层设计 + 密钥规则
6. Linting — Biome 零警告 CI 门禁
7. Test Requirement — 每个功能/修复必须附测试

**T5 (Brainstorm checklist) 的 3 项插入位置**：
- "Capability Audit" → Step 2 和 Step 3 之间，新编号 Step 2.5 或重新编号
- "Evidence of Need" → Step 1 的子项（新增 bullet point）
- "Anti-Double-Counting" → Step 6 的子项（新增 bullet point）

---
title: Development Principles Hardening (Follow-up)
scope: Lightweight
status: approved
created: 2026-04-18
---

## Problem Statement

上一轮 dev-principles-optimization review 发现 3 个待改进项：Biome 3 条 disabled 规则需逐步启用（P3/F8）、S8 ADR gate 需要代码级 enforcement（P2/F9）、Security Principles 需扩展覆盖范围（P3/F5）。同时分支 `feat/multi-agent-adaptation` 需合并到 master。

## Constraints

- Biome 规则启用不能破坏现有测试 [已验证]
- S8 gate 逻辑必须与 brainstorm.md 文档描述一致 [已验证]
- PR 合并前所有新测试必须通过 [已验证]

## Acceptance Criteria

1. `biome.json` 中 `noExplicitAny`、`noNonNullAssertion`、`noAssignInExpressions` 设为 `"warn"` 且 `bunx biome ci src/` 仍 exit 0
2. `src/state/state.ts` 中 brainstorm gate 新增 S8 programmatic check（scope Standard/Deep 且有 rejected alternatives 时检查 `docs/decisions/` 文件存在）
3. CONTRIBUTING.md Security Principles section 补充 sandbox、browser automation、MCP server 安全边界说明
4. PR 从 `feat/multi-agent-adaptation` 合并到 `master` 已创建

## Solution Shape

- T1: biome.json `off` → `warn`（Biome CI 只对 error 级别 exit 1，warn 不阻断）
- T2: state.ts 在 brainstorm gate S7 后新增 S8 检查逻辑
- T3: CONTRIBUTING.md Security Principles section 追加 1 段
- T4: Ship 阶段创建 PR

---
title: Development Principles Optimization
scope: Standard
status: approved
created: 2026-04-17
updated: 2026-04-17
---

## Problem Statement

apex-forge 已有成熟的执行协议（TDD Iron Law、Evidence Grading、Phase Discipline、Verification Gate），但缺少**项目级别的开发原则文档化和工具化**。13 条开发原则中，仅 2 条有完整覆盖（TDD + 密钥扫描），6 条部分覆盖，5 条完全空白。

核心矛盾：协议级纪律很强（skill 文件 + hook 门控），但项目级规范散落在 CONTRIBUTING.md 的零散段落里，没有系统性约束。贡献者（包括 AI agent）在非协议路径下操作时，这些原则不生效。

## Constraints

1. **不破坏现有机制** [已验证]：现有 TDD Iron Law、Evidence Grading、pre-push hook 保持不变，只做增量
2. **不回溯改旧内容** [已验证]：CHANGELOG 旧条目保持原样，新格式从下个版本起生效
3. **Push-based vs Pull-based 分层** [已验证]：能自动化检测的用 CI/hook 门控，需要人判断的用文档 + checklist（v0.2.1 教训：过度 push-based 导致"约束越多越偷懒"）
4. **不引入重量级流程** [假设]：当前只有一个开发者，原则需要轻量可执行，不能变成官僚流程
5. **向后兼容 CONTRIBUTING.md 结构** [已验证]：在现有 sections 基础上增补，不重组

## Approaches

### Approach A: 一次性全量落地（13 条全做）

一个迭代完成所有 13 条原则的文档化 + 工具化。

- **Pros**: 一步到位，原则之间的交叉引用一次做完
- **Cons**: 变更面大（CONTRIBUTING.md + CI + brainstorm checklist + 新 ADR 目录 + Biome 引入），review 困难
- **Risks**: 过多同时变更可能引入工具链冲突（如 Biome 与现有 tsc 配置）

### Approach B: 分层递进（文档层 → 工具层 → 协议层）

Phase 1: 文档化（CONTRIBUTING.md 更新 + ADR 模板 + CHANGELOG 模板）
Phase 2: 工具化（Biome 引入 + CI 更新 + 向后兼容检测）
Phase 3: 协议嵌入（brainstorm checklist 增补 + ADR exit gate）

- **Pros**: 每层可独立验证，风险隔离
- **Cons**: 需要 3 轮 pipeline，较慢
- **Risks**: Phase 1 落地后 Phase 2/3 可能搁置

### Approach C: 按优先级分批（高 ROI 先做）

Batch 1: 已决策的 3 项（混合 CHANGELOG + ADR exit gate + Biome 现在引入）+ 向后兼容性
Batch 2: Brainstorm checklist 增补（防重复计数 + 先证明现有不覆盖 + 用户行为调查）
Batch 3: 剩余文档化（依赖审计、安全分层原则等 CONTRIBUTING.md 补充）

- **Pros**: 高价值的先落地，立刻见效
- **Cons**: 需要定义"高 ROI"，可能遗漏某些原则
- **Risks**: 低优先级的可能永远排不到

**选择**: Approach A。理由：13 条原则的落地点高度集中（CONTRIBUTING.md + brainstorm-checklist.md + CI + 1 个新目录），实际修改量不大。分批反而增加上下文切换成本，且低优先级项确实容易搁置。

## Confirmed Decisions

| # | 决策 | 理由 | 决策时间 |
|---|------|------|---------|
| D1 | CHANGELOG 采用混合格式 | 保留叙事（背景+策略）+ Keep a Changelog 分类结构，兼顾可扫描性和决策理由 | 2026-04-17 |
| D2 | ADR 嵌入 exit gate 强制执行 | ADR 不做门控大概率停摆（参照 compound memory write enforcement 教训）| 2026-04-17 |
| D3 | Biome 现在引入 | v0.2.x 是成本最低窗口，存量代码量可控，auto-fix 覆盖 80%+ 格式问题 | 2026-04-17 |

## Acceptance Criteria

### AC1: CONTRIBUTING.md 包含 7 个新 section

文件包含以下 section，每个 section 有明确规则和示例：
1. **Dependency Policy** — 新依赖必须说明：(a) 内置能力为何不够 (b) 替代方案 (c) 维护风险
2. **Backward Compatibility** — 已发布的 CLI 命令格式和配置文件结构不可 breaking change；如必须 break，要求迁移指南 + major version bump
3. **Changelog Format** — 混合格式模板：顶部 3-5 行叙事（背景+策略），底部 Added/Changed/Fixed/Removed 分类
4. **Architecture Decision Records** — ADR 流程说明 + 模板引用 + 触发条件
5. **Security Principles** — 分层设计原则 + 密钥管理规则（不经 LLM、不写日志、OS Keychain 或环境变量）
6. **Linting** — Biome 零警告作为 CI 硬门禁
7. **Test Requirement** — 每个新功能/修复必须附带测试（从协议级 TDD Iron Law 降级为通用贡献者要求）

### AC2: ADR 目录和模板可用

1. `docs/decisions/` 目录存在
2. `docs/decisions/TEMPLATE.md` 包含：Status、Context、Decision、Rejected Alternatives、Consequences 五个 section
3. 至少 1 个示例 ADR（可以是本次"采用混合 CHANGELOG 格式"的决策本身）

### AC3: Biome 集成到 CI

1. `biome.json` 存在且配置合理（TypeScript + Bun 环境）
2. `package.json` devDependencies 包含 `@biomejs/biome`
3. `.github/workflows/ci.yml` 包含 `bunx biome ci src/` 步骤，失败则 CI 红
4. 现有代码通过 `bunx biome ci src/` 零警告（auto-fix 后）

### AC4: Brainstorm Checklist 增补 3 项

`skill/details/brainstorm-checklist.md` 新增：
1. **Capability Audit**（Step 2 和 Step 3 之间）— 列出现有机制中哪些已解决部分问题，覆盖 >80% 需要解释为何仍需新增
2. **Evidence of Need**（Step 1 子项）— 需求来源必须引用实际数据（issue、telemetry、用户反馈），不接受纯假设
3. **Anti-Double-Counting**（Step 6 子项）— 涉及计数/限额/通知时，标注哪层计数、是否可能重复触发

### AC5: ADR 嵌入 Brainstorm Exit Gate

`skill/stages/brainstorm.md` 的 Exit Gate Structural Checks 新增：
- 如果 brainstorm 涉及架构决策或"不做"决策，`docs/decisions/NNNN-*.md` 必须存在
- 触发条件：scope 为 Standard 或 Deep，且 approaches 中存在被拒绝的方案

### AC6: Ship Stage CHANGELOG 模板更新

`skill/stages/ship.md` Step 2 更新为混合 CHANGELOG 模板，包含：
- 顶部叙事 block（背景 + 策略，限 5 行内）
- 底部 Added/Changed/Fixed/Removed 分类

### AC7: 向后兼容性 CI 检测

`.github/workflows/ci.yml` 新增 CLI backward compatibility smoke test：
- 构建后运行核心命令（`apex init`, `apex status`, `apex task list`）
- 验证输出格式未 break（至少检查 exit code + JSON 输出可解析）

## Solution Shape

```
修改点分布：

CONTRIBUTING.md          ← 新增 7 个 section（AC1）
docs/decisions/          ← 新建目录 + TEMPLATE.md + 1 个示例 ADR（AC2）
biome.json               ← 新建（AC3）
package.json             ← devDependencies 加 @biomejs/biome（AC3）
.github/workflows/ci.yml ← 加 biome ci + backward compat test（AC3, AC7）
src/**/*.ts              ← biome auto-fix 格式修复（AC3）

skill/details/brainstorm-checklist.md  ← 增补 3 项检查（AC4）
skill/stages/brainstorm.md             ← exit gate 新增 ADR 检查（AC5）
skill/stages/ship.md                   ← Step 2 CHANGELOG 模板更新（AC6）
```

### 关键设计选择

**ADR 触发条件设计**：不是每个 brainstorm 都需要 ADR。触发条件为 `scope: Standard|Deep` 且 approaches 中有 ≥2 个方案。Lightweight scope（单文件修改）豁免。这避免了 ADR 变成官僚负担。

**Biome 配置策略**：使用 Biome recommended preset，不做大量自定义规则。自定义越多维护成本越高，recommended preset 随 Biome 版本自动更新。

**向后兼容检测的边界**：只检测 CLI 命令的 exit code + JSON 输出结构。不检测输出文案变化（文案改动不算 breaking change）。这是一个实用主义的边界——完整的 API 契约测试成本过高，当前阶段不值得。

**docs/decisions/ vs docs/solutions/ 的关系**：
- `decisions/` = 岔路口记录（选了什么、不选什么、为什么）
- `solutions/` = 经验总结（踩了什么坑、学到什么模式）
- 两者独立维护，互不替代。solutions 继续由 Compound 阶段产出，decisions 由 Brainstorm 阶段产出。

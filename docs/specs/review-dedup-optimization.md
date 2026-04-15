# Review 阶段：内置 Persona 与外部 Skill 条件去重

## 问题

Review 阶段有两层审查者：

1. **内置 Persona**（`stages/review.md`）— agent 在同一 context 里角色扮演，零 sub-agent 开销
2. **外部 Skill**（`bindings.yaml` → review）— 独立 skill，有完整 checklist、工具链、结构化输出

其中三对存在重叠：

| 内置 Persona | 外部 Skill | 重叠面 |
|-------------|------------|--------|
| Security Reviewer | `security-audit` | 安全漏洞、注入、auth/authz |
| Correctness Reviewer | `thorough-code-review` | 边界、错误处理、逻辑正确性 |
| Frontend persona | `design-baseline` + `tasteful-frontend` | 前端质量 |

当两者同时触发时：
- 外部 skill 是内置 persona 的超集，重复扫描浪费 token
- 可能对同一问题给出冲突分级（P1 vs P2），需要额外 reconcile

## 方案：条件去重

核心逻辑：

```
IF 外部 skill 被触发 → 抑制对应内置 persona（外部已全覆盖）
IF 外部 skill 未触发 → 内置 persona 作为兜底（仍有覆盖）
```

### 映射表

| 外部 Skill | 触发时抑制 | 未触发时 |
|-----------|-----------|---------|
| `security-audit` | 跳过内置 Security Reviewer | 保留 Security Reviewer |
| `thorough-code-review` | 跳过内置 Correctness Reviewer | 保留 Correctness Reviewer |
| `design-review` | 跳过内置 Frontend persona | 保留 Frontend persona |

### 始终保留（无外部替代）

- Spec Compliance Reviewer（核对计划 vs 实现）
- Adversarial Reviewer（假设违反、组合失败、级联构造、滥用案例）
- SQL Safety / API Contract / Performance / Concurrency / Schema Drift / Test Quality / Configuration（条件 persona）

## 实现要点

### 执行顺序变更

当前：内置 persona 全跑 → 外部 skill dispatch
改后：先确定外部 skill 触发列表 → 从内置 persona 列表中排除已覆盖的 → 跑剩余内置 → 跑外部

### Fallback 保护

风险：bindings.yaml 触发条件写错，导致外部 skill 该触发没触发，同时内置也被跳过 → 漏检。

保护措施：抑制逻辑只在外部 skill **实际被触发并返回结果**后才生效。如果外部 skill 触发失败或超时，对应内置 persona 自动恢复。

## 未验证假设

- [ ] 外部 skill 是否真的完全覆盖对应内置 persona 的每项检查（需逐项对比 thorough-code-review checklist vs Correctness Reviewer 职责）
- [ ] token 浪费的实际量级（无量化数据，但重复扫描同一 diff 是确定的冗余）
- [ ] finding 冲突在实际 review 中发生的频率

## 未选的替代方案

**全 Skill 化**：把所有内置 persona 拆成独立 skill，统一通过 bindings.yaml 调度。

不选原因：
1. 内置 persona 是零开销（同 context 角色切换），拆成 skill 每个要 spawn sub-agent
2. SQL Safety、Concurrency 等 persona 内容不够撑独立 skill
3. 改动面太大

条件去重是最小改动获得最大收益的中间态。如果未来外部 skill 覆盖面继续扩大，可以再考虑全 skill 化。

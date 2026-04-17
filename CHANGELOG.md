# Changelog

## 0.2.1 (2026-04-17)

### Protocol Restructuring — "约束越多越偷懒"问题的系统性修复

**背景**：经过 5 轮加固（37 项 gate、PreToolUse hook、强制阶段排序），发现一个悖论——约束越多，AI agent 越偷懒。根因是注意力稀释（2270 行规则，LLM 记不住）、Goodhart 效应（agent 优化"最快通过检查"而非"做好"）、目标冲突（agent 被训练为"快速帮助"，但协议要求"慢下来保质量"）。

#### Strategy 1: Value Anchor — 在规则之前校准目标

在 SKILL.md 最开头加了 3 句话：你的价值由交付物质量衡量，不是响应速度；通过检查但内容空洞 = 零分；每个产出物必须让不了解上下文的人独立做判断。

**大白话**：在 AI 读到任何规则之前，先告诉它"快不重要，好才重要"。利用 LLM 的首因效应——开头的指令权重最高。

#### Strategy 2: Progressive Disclosure — 规则文件瘦身 56%

- SKILL.md: 380 → 199 行
- 6 个阶段文件: 1890 → 789 行（brainstorm 411→161, plan 179→115, execute 263→119, review 208→116, ship 488→159, compound 341→119）
- 新建 `skill/details/` 目录，14 个详细说明文件（1107 行）
- 主文件只保留流程骨架 + exit gate 表 + 关键规则，详细内容通过 "→ See details/{file}.md" 指针按需读取

**大白话**：AI 一次能认真读的内容有限。把 2270 行砍到 988 行，让 AI 在一屏内看完整个阶段要求，而不是在 400 行里迷路。详细内容没丢，只是搬到了需要时才读的地方。

#### Strategy 3: Do-Axis Automation — 让 CLI 替 AI 做杂活

- `apex stage set` 现在直接打印每个阶段的 3-4 条关键要求，AI 不用额外读文件
- `apex stage set brainstorm|plan|review` 自动创建带好 frontmatter 骨架的文档模板
- PostToolUse hook 在 Ship 阶段检测到 AskUserQuestion 时自动记录 checkpoint

**大白话**：以前 AI 要记住"进入 brainstorm 后先创建模板、读阶段文件、记住关键规则"——现在这些全自动。每自动化一步，就少一个 AI 可以偷懒的点。

#### Strategy 4: Post-Audit + Content Quality — 从"有没有"查到"好不好"

- `apex stage complete ship` 打印 pipeline 合规报告：每阶段通过状态 + 整体评分 A-D
- `apex doctor` 新增 3 个内容质量检查：
  - CQ1: brainstorm 验收标准至少 3 条（之前只查 section 存不存在）
  - CQ2: plan 里写的文件路径是否真实存在
  - CQ3: review 里每个 persona 内容是否超过 50 字

**大白话**：以前 AI 写一行 "- AC1" 就能通过 brainstorm gate。现在至少要写 3 条编号的验收标准。不能用空壳糊弄了。

#### Gate Hardening: 实时内容门控 + Sub-agent 对抗验证

- CQ1/CQ3 从 `apex doctor`（事后审计）搬到 `runStructuralGate`（实时阻断）——不达标直接不让过
- 新增 ADV1/ADV2 adversarial verification gate：
  - `apex stage complete brainstorm` 要求 `.apex/verifications/brainstorm-adversarial.md` 存在
  - `apex stage complete review` 要求 `.apex/verifications/review-adversarial.md` 存在
  - Gate 阻断时打印 sub-agent dispatch prompt，agent 被迫 spawn 独立 sub-agent 做对抗验证
  - Lightweight scope（Tier 1）豁免

**大白话**：AI 自己审自己永远"没问题"。现在强制要求请另一个 AI 来挑毛病，主 AI 绕不过这一步。实测中 sub-agent 找到了 3 个主 AI 完全遗漏的真实问题（prompt injection、嵌套列表误计、YAML 注释 bug）。

#### Human Review: `apex audit --quick`

- 新增 `apex audit --quick`：28 行的单页审计摘要
- 包含：任务名称、范围、验收标准清单、git 变更、sub-agent 发现、每阶段门控状态、决定提示
- 人 30 秒扫完做决定，重点看 sub-agent 发现了什么（这是信号密度最高的部分）

**大白话**：协议不可能让 AI 100% 完美。但它能让人的审查从"从零看一坨代码"变成"扫一页摘要，重点看独立审查发现了什么"——快 10 倍。

### Files Changed

- `skill/SKILL.md` — slimmed + value anchor
- `skill/stages/*.md` — all 6 files slimmed
- `skill/details/` — 14 new detail files
- `src/cli.ts` — inline requirements, artifact templates, compliance report
- `src/state/state.ts` — CQ1, CQ3, ADV1, ADV2 gates
- `src/commands/audit.ts` — `--quick` mode
- `src/commands/doctor.ts` — CQ1-CQ3 content quality checks
- `skill/hooks/apex-forge-skill-trace.sh` — auto-checkpoint
- `src/__tests__/stage-gates.test.ts` — fixture updates for new gates
- `src/__tests__/skip-gate-enforcement.test.ts` — fixture updates

## 0.1.2 (2026-04-15)

### Stage-Skip Protection

- **cli.ts**: `apex stage set <stage>` now prints `⚠ MANDATORY: Read stages/{stage}.md` for all non-idle stages — push-based reminder so agents cannot miss stage file reading
- **SKILL.md**: Added "Stage File Reading Rule (HARD GATE)" to Phase Discipline — explicit hard rule requiring `Read stages/{stage}.md` before executing any stage
- **Tests**: 2 new CLI tests verifying MANDATORY reminder for all 6 stages + idle exemption

### Root Cause

Agents relied on SKILL.md's brief stage descriptions instead of reading detailed stage files. The "MUST Read" rule existed only in the "Explicit Stage Commands" section (line 155), not in Phase Discipline that applies to all pipeline transitions. CLI provided no reminder.

## 0.1.1 (2026-04-14)

### Pipeline Re-entry Fix

- **compound.md**: After "开始新迭代", compound now chains into `Skill('apex-forge')` re-invocation instead of passively waiting — prevents control flow breakage where new tasks bypass the Complexity Router
- **SKILL.md**: Added "Idle re-entry enforcement" paragraph in Initialization section — ensures tasks arriving via compound chain enter the Router immediately

### Ship CI Detection Fix

- **ship.md**: CI detection command changed from zsh-breaking `ls *.yml *.yaml` to `find` + `test -f` with proper grouping — fixes false "No CI config" on zsh

### TypeScript Type Error Fixes

- Fixed 25+ `TS7006` implicit any errors in worker test files (mock.calls callback params)
- Fixed `TS18047` possibly-null errors in proxy.test.ts (non-null assertions)
- Fixed `TS2352` type cast in cross-model.ts (proper WindowHandle import + type widening)

### Root Cause

- Pipeline re-entry: skill execution ended after Compound, no mechanism forced Router re-entry
- CI detection: zsh `nomatch` aborts entire `ls` when one glob pattern has no matches
- TS errors: CI runs stricter `tsc --noEmit` than local dev environment

## 0.2.0 (2026-04-12)

### Multi-Agent Orchestration

- **RuntimeAdapter interface**: Pluggable adapter system for heterogeneous agent support
- **3 built-in adapters**: Claude, Codex, Gemini — auto-detected at startup
- **Adapter registry**: Detects available agents, resolves by name with graceful fallback
- **Two orchestration modes**:
  - Mode 1 (parallel dispatch): Same agent type, different tasks, for speed
  - Mode 2 (cross-model dispatch): Different agents evaluating same artifact, for eliminating blind spots
- **Workspace isolation**: Per-task directories with input/output structure and DAG artifact injection
- **Retry + exponential backoff**: Configurable max retries with jitter
- **Prompt builder**: Composes task + skill + persona + workspace context + upstream artifacts
- **Result collector**: Structured result parsing with multi-agent finding synthesis and deduplication
- **Persona system**: 6 initial personas (4 expert, 2 user) as reusable YAML context modules
- **Expert Panel Review skill**: Multi-perspective evaluation process for plans and architectures
- **Task state completion**: Orchestrator properly transitions tasks to done, unblocking DAG
- **Registry enhancement**: 3 new templates with skill/persona/dispatch_mode fields (118 total)
- **Extended Task type**: adapter, persona, skill, attempt, workspace_path, session_id fields
- **Event sourcing**: Materializer handles all new fields with backward compatibility

### Artifacts

- Requirements: `docs/brainstorms/multi-agent-orchestration-requirements.md`
- Plan: `docs/plans/multi-agent-orchestration-plan.md`
- Review: `docs/reviews/multi-agent-orchestration-review.md`

### Known Limitations

- Workspaces use plain directories, not git worktrees (Phase 2)
- Codex/Gemini adapters use `which` for availability check (Windows incompatible)
- No end-to-end integration test for cross-model expert panel dispatch
- Prompt still passed as CLI argument (temp file written but not yet piped via stdin)

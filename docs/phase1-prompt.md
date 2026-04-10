# Phase 1 执行提示词

直接复制以下内容到新的 Claude Code 会话中执行。

---

## 提示词

```
我在做 Apex Forge 的 Phase 1 迭代，需要接通 6 项已写未接的功能。仓库在当前目录。

先读这些文件了解上下文：
1. docs/iteration-roadmap.md — 完整迭代计划
2. docs/project-overview.md — 项目全景（特别是"未完成"部分）
3. skill/bindings.yaml — 现有的 stage→skill 映射
4. src/types/state.ts — SkillInvocation 类型已定义
5. src/state/state.ts — 状态管理
6. src/commands/telemetry.ts — 遥测命令
7. src/dashboard.ts 第 120-180 行 — dashboard API
8. frontend/app.js 第 244-290 行 — 前端渲染逻辑
9. hooks/post-tool-event — 事件采集 hook
10. workflow/roles/codex-consult.md — Codex 第二意见

读完后，按顺序执行以下 6 项任务：

### 任务 1：invocation trace 运行时写入
- src/state/state.ts 已有 SkillInvocation 类型（skill_invocations?: SkillInvocation[]）
- 需要：新增一个 addSkillInvocation() 函数，往 state.json 的 skill_invocations 数组追加记录
- 需要：在 src/cli.ts 暴露为 `apex trace-skill <stage> <skill> <version> <output_status> <af_mapping>` 命令
- 这样 stage 文件的 Skill Dispatch 段可以指导 agent 调完外部 skill 后执行这个命令记录 trace
- 同时更新 skill/stages/ship.md 的 Check 5，加入实际的 CLI 命令来校验 trace 完整性

### 任务 2：telemetry 自动采集
- src/commands/telemetry.ts 已有 start/end/report
- 需要：让 addSkillInvocation()（任务1）同时自动写一条 telemetry 记录到 .apex/analytics/usage.jsonl
- 格式：{ skill, duration_s, outcome, ts }
- 这样 dashboard 的 System Telemetry 面板能读到真实数据

### 任务 3：events.jsonl → dashboard Activity Stream
- hooks/post-tool-event 已经在写 .apex/events.jsonl
- 需要：dashboard.ts 的 buildStatePayload() 函数读 .apex/events.jsonl（最近 50 条），作为 analytics 字段返回
- 前端 app.js 的 renderActivity() 已经能渲染非空 analytics，只要后端返回数据就行

### 任务 4：补齐 skill/stages/verify.md
- workflow/stages/verify.md 已存在（完整内容）
- 需要：复制到 skill/stages/verify.md 并确认 .claude-plugin 里的 apex-forge-verify 条目路径正确
- 如果内容有 gstack 特有的术语需要清理

### 任务 5：Skill 版本校验
- bindings.yaml 定义了 version: ">=1.0.0" 约束
- 需要：新增 src/utils/semver.ts，实现简单的 satisfies(actual, constraint) 函数
- 需要：新增 `apex check-bindings` 命令，读 bindings.yaml，对每个有 version 约束的 skill 检查 ~/.claude/skills/<name>/VERSION 文件，输出通过/不通过
- 更新 skill/stages/ship.md 的 Check 5，在 invocation trace 校验之外加上 binding 版本校验

### 任务 6：codex-consult 加入 bindings.yaml
- 在 bindings.yaml 的 review 段新增 codex-consult 绑定：
  trigger: "代码审查完成后，获取独立第二意见"
  skill: codex-consult
  mode: review
  priority: 5
  concurrent: true
- 同时更新 src/types/config.ts 的 ApexConfig，支持 agents 字段（多 agent 命令映射）：
  agents?: { default?: string, review?: string, challenge?: string, consult?: string }
- 更新 src/orchestrator.ts 的 agent 派发逻辑，根据任务模板的 model_hint 选择不同的 agent_command

每个任务完成后跑相关测试验证（bun test），全部完成后 commit 并 push。
```

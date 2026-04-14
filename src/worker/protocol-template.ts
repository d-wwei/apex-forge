/**
 * Worker protocol file generator.
 *
 * Produces a worker-protocol.md string that is injected into each Worker
 * Agent's worktree at .apex/worker-protocol.md. The protocol tells the
 * Worker what task to execute, which rules to follow, and how to
 * communicate results back to the Plan Agent.
 */

import type { Task } from "../types/task.js";

// ── Public types ──────────────────────────────────────────────────────

export interface ProtocolOptions {
  task: Task;
  projectRoot: string;
  worktreePath: string;
  completedDeps: string[];
  crossModel?: boolean;
  agent?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function extractCriteria(description: string): string {
  const marker = "Acceptance Criteria:";
  const idx = description.indexOf(marker);
  if (idx === -1) return description;
  return description.slice(idx + marker.length).trim();
}

function depsDisplay(deps: string[]): string {
  return deps.length > 0 ? deps.join(", ") : "none (无)";
}

// ── Sections ──────────────────────────────────────────────────────────

function sectionTask(opts: ProtocolOptions): string {
  const { task, completedDeps } = opts;
  const criteria = extractCriteria(task.description);
  return `\
## 你的任务

**Title**: ${task.title}

**Description**:
${task.description}

**Acceptance Criteria**:
${criteria}

**Dependencies completed**: ${depsDisplay(completedDeps)}`;
}

function sectionExecution(): string {
  return `\
## 执行协议

你是一个独立的 Apex-Forge 实例。按照完整的 AF 协议执行:

- **Tier 判定**: 根据任务复杂度选择 Tier 1/2/3
  - Tier 1 (简单): Execute -> Ship
  - Tier 2/3 (中等/复杂): Brainstorm -> Plan -> Execute -> Review -> Ship
- 使用 \`apex stage set <name>\` 切换阶段
- 每个阶段必须满足其退出门控才能进入下一阶段`;
}

function sectionCoreRules(): string {
  return `\
## 核心规则

1. **TDD 铁律**: 先写测试 -> RED -> 写代码 -> GREEN -> 重构。不允许跳过测试。
2. **证据分级**: 声明完成必须提供 E3 级证据（可验证的命令输出、测试结果截图、或可观察的状态变化）。
3. **验证门控**: 任何成功声明前必须运行验证命令并确认输出。"应该可以" 不是完成证据。`;
}

function sectionCommunication(opts: ProtocolOptions): string {
  const { task, projectRoot } = opts;
  const workersDir = `${projectRoot}/.apex/workers/${task.id}`;
  return `\
## 通信协议

你在独立的 worktree 中工作。需要向主项目报告状态:

### 进度更新 (每完成一个子任务)

\`\`\`bash
cat > ${workersDir}/status.json << 'APEX_EOF'
{
  "task_id": "${task.id}",
  "stage": "<current_stage>",
  "progress": "<description>",
  "last_activity": "<ISO timestamp>",
  "errors": []
}
APEX_EOF
\`\`\`

### 完成时

\`\`\`bash
cat > ${workersDir}/result.json << 'APEX_EOF'
{
  "task_id": "${task.id}",
  "verdict": "pass",
  "summary": "<what you accomplished>",
  "findings": [],
  "completed_at": "<ISO timestamp>",
  "branch": "apex/${task.id}",
  "commit": "<commit hash>"
}
APEX_EOF

cd ${projectRoot} && apex task submit ${task.id} "<evidence description>"
cd ${projectRoot} && apex task verify ${task.id} pass
\`\`\`

### 遇到阻塞时

\`\`\`bash
cd ${projectRoot} && apex task block ${task.id} "<reason>"
\`\`\``;
}

function sectionBoundaries(opts: ProtocolOptions): string {
  const { task } = opts;
  return `\
## 工作边界

- 只修改 worktree 内的文件
- **不要**修改主项目的代码文件
- **不要**修改其他 Worker 的 worktree
- Git 操作限于当前分支 (apex/${task.id})
- 提交代码到当前分支，不要 push 到 main/master`;
}

function sectionCrossModel(): string {
  return `\
## 跨模型独立评审

这是一个跨模型独立评审任务。多个不同模型的 Agent 正在并行评审同一代码。

**关键规则**:
- 独立产出你的发现和结论，不要参考其他 Agent 的结果
- 如实报告你发现的所有问题，即使你认为它们可能是误报
- 你的 result.json 将与其他模型的结果合成最终裁决
- 重点关注: 逻辑错误、安全漏洞、边界条件、竞态条件`;
}

// ── Main generator ────────────────────────────────────────────────────

export function generateWorkerProtocol(opts: ProtocolOptions): string {
  const sections = [
    `# Apex-Forge Worker Agent — Task ${opts.task.id}`,
    sectionTask(opts),
    sectionExecution(),
    sectionCoreRules(),
    sectionCommunication(opts),
    sectionBoundaries(opts),
  ];

  if (opts.crossModel) {
    sections.push(sectionCrossModel());
  }

  return sections.join("\n\n") + "\n";
}

// ── Agent start command ───────────────────────────────────────────────

export function agentStartCommand(agent: string, worktreePath: string): string {
  switch (agent) {
    case "codex":
      return `cd "${worktreePath}" && codex --full-auto`;
    case "gemini":
      return `cd "${worktreePath}" && gemini --yolo -p "$(cat .apex/worker-protocol.md)"`;
    case "claude":
    default:
      return `cd "${worktreePath}" && claude --append-system-prompt-file .apex/worker-protocol.md`;
  }
}

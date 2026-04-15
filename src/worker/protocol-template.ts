/**
 * Worker protocol file generator.
 *
 * Produces a worker-protocol.md string that is injected into each Worker
 * Agent's worktree at .apex/worker-protocol.md. The protocol tells the
 * Worker what task to execute, which rules to follow, and how to
 * communicate results back to the Plan Agent.
 */

import type { Task } from "../types/task.js";
import { loadConfig } from "../state/config.js";
import { resolveAdapterWithConfig, BUILTIN_ADAPTERS } from "./agent-adapter.js";
import type { AgentCapabilities } from "./agent-adapter.js";
import type { AdaptersMap } from "../types/config.js";

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

function depsDisplay(deps: string[], lang: "zh" | "en"): string {
  if (deps.length > 0) return deps.join(", ");
  return lang === "en" ? "none" : "none (无)";
}

// ── Sections ──────────────────────────────────────────────────────────

function sectionTask(opts: ProtocolOptions, lang: "zh" | "en"): string {
  const { task, completedDeps } = opts;
  const criteria = extractCriteria(task.description);

  if (lang === "en") {
    return `\
## Your Task

**Title**: ${task.title}

**Description**:
${task.description}

**Acceptance Criteria**:
${criteria}

**Dependencies completed**: ${depsDisplay(completedDeps, lang)}`;
  }

  return `\
## 你的任务

**Title**: ${task.title}

**Description**:
${task.description}

**Acceptance Criteria**:
${criteria}

**Dependencies completed**: ${depsDisplay(completedDeps, lang)}`;
}

function sectionExecution(lang: "zh" | "en"): string {
  if (lang === "en") {
    return `\
## Execution Protocol

You are an independent Apex-Forge instance. Follow the full AF protocol:

- **Tier Classification**: Choose Tier 1/2/3 based on task complexity
  - Tier 1 (simple): Execute -> Ship
  - Tier 2/3 (medium/complex): Brainstorm -> Plan -> Execute -> Review -> Ship
- Use \`apex stage set <name>\` to switch stages
- Each stage must pass its exit gate before proceeding to the next`;
  }

  return `\
## 执行协议

你是一个独立的 Apex-Forge 实例。按照完整的 AF 协议执行:

- **Tier 判定**: 根据任务复杂度选择 Tier 1/2/3
  - Tier 1 (简单): Execute -> Ship
  - Tier 2/3 (中等/复杂): Brainstorm -> Plan -> Execute -> Review -> Ship
- 使用 \`apex stage set <name>\` 切换阶段
- 每个阶段必须满足其退出门控才能进入下一阶段`;
}

function sectionCoreRules(lang: "zh" | "en"): string {
  if (lang === "en") {
    return `\
## Core Rules

1. **TDD Iron Law**: Write test -> RED -> Write code -> GREEN -> Refactor. No skipping tests.
2. **Evidence Grading**: Completion claims require E3 evidence (verifiable command output, test results, or observable state changes).
3. **Verification Gate**: Before any success claim, run verification commands and confirm output. "Should work" is not completion evidence.`;
  }

  return `\
## 核心规则

1. **TDD 铁律**: 先写测试 -> RED -> 写代码 -> GREEN -> 重构。不允许跳过测试。
2. **证据分级**: 声明完成必须提供 E3 级证据（可验证的命令输出、测试结果截图、或可观察的状态变化）。
3. **验证门控**: 任何成功声明前必须运行验证命令并确认输出。"应该可以" 不是完成证据。`;
}

// ── Communication tier helpers ───────────────────────────────────────

/** Tier 1: full bash — heredoc + apex CLI commands. */
function fullBashCommunication(
  task: Task,
  workersDir: string,
  projectRoot: string,
  lang: "zh" | "en",
): string {
  const statusBlock = `\
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
\`\`\``;

  const resultBlock = `\
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
\`\`\``;

  const blockBlock = `\
\`\`\`bash
cd ${projectRoot} && apex task block ${task.id} "<reason>"
\`\`\``;

  if (lang === "en") {
    return `\
## Communication Protocol

You work in an isolated worktree. Report status to the main project:

### Progress Update (after each sub-task)

${statusBlock}

### On Completion

${resultBlock}

### When Blocked

${blockBlock}`;
  }

  return `\
## 通信协议

你在独立的 worktree 中工作。需要向主项目报告状态:

### 进度更新 (每完成一个子任务)

${statusBlock}

### 完成时

${resultBlock}

### 遇到阻塞时

${blockBlock}`;
}

/** Tier 2: file-write — "Write the following JSON" instructions + "Run:" apex CLI. */
function fileWriteCommunication(
  task: Task,
  workersDir: string,
  projectRoot: string,
  lang: "zh" | "en",
): string {
  const statusJson = `\
{
  "task_id": "${task.id}",
  "stage": "<current_stage>",
  "progress": "<description>",
  "last_activity": "<ISO timestamp>",
  "errors": []
}`;

  const resultJson = `\
{
  "task_id": "${task.id}",
  "verdict": "pass",
  "summary": "<what you accomplished>",
  "findings": [],
  "completed_at": "<ISO timestamp>",
  "branch": "apex/${task.id}",
  "commit": "<commit hash>"
}`;

  if (lang === "en") {
    return `\
## Communication Protocol

You work in an isolated worktree. Report status to the main project:

### Progress Update (after each sub-task)

Write the following JSON to \`${workersDir}/status.json\`:

\`\`\`json
${statusJson}
\`\`\`

### On Completion

Write the following JSON to \`${workersDir}/result.json\`:

\`\`\`json
${resultJson}
\`\`\`

Then run:

- \`cd ${projectRoot} && apex task submit ${task.id} "<evidence description>"\`
- \`cd ${projectRoot} && apex task verify ${task.id} pass\`

### When Blocked

Run: \`cd ${projectRoot} && apex task block ${task.id} "<reason>"\``;
  }

  return `\
## 通信协议

你在独立的 worktree 中工作。需要向主项目报告状态:

### 进度更新 (每完成一个子任务)

将以下 JSON 写入 \`${workersDir}/status.json\`:

\`\`\`json
${statusJson}
\`\`\`

### 完成时

将以下 JSON 写入 \`${workersDir}/result.json\`:

\`\`\`json
${resultJson}
\`\`\`

然后运行:

- \`cd ${projectRoot} && apex task submit ${task.id} "<evidence description>"\`
- \`cd ${projectRoot} && apex task verify ${task.id} pass\`

### 遇到阻塞时

运行: \`cd ${projectRoot} && apex task block ${task.id} "<reason>"\``;
}

/** Tier 3: minimal — "Create file" instructions only. No bash, no apex CLI. */
function minimalCommunication(
  task: Task,
  workersDir: string,
  lang: "zh" | "en",
): string {
  const statusJson = `\
{
  "task_id": "${task.id}",
  "stage": "<current_stage>",
  "progress": "<description>",
  "last_activity": "<ISO timestamp>",
  "errors": []
}`;

  const resultJson = `\
{
  "task_id": "${task.id}",
  "verdict": "pass",
  "summary": "<what you accomplished>",
  "findings": [],
  "completed_at": "<ISO timestamp>",
  "branch": "apex/${task.id}",
  "commit": "<commit hash>"
}`;

  if (lang === "en") {
    return `\
## Communication Protocol

You work in an isolated worktree. Report status to the main project:

### Progress Update (after each sub-task)

Create file \`${workersDir}/status.json\` with content:

\`\`\`json
${statusJson}
\`\`\`

### On Completion

Create file \`${workersDir}/result.json\` with content:

\`\`\`json
${resultJson}
\`\`\`

### When Blocked

Create file \`${workersDir}/blocked.json\` with content:

\`\`\`json
{
  "task_id": "${task.id}",
  "reason": "<reason>"
}
\`\`\``;
  }

  return `\
## 通信协议

你在独立的 worktree 中工作。需要向主项目报告状态:

### 进度更新 (每完成一个子任务)

创建文件 \`${workersDir}/status.json\`，内容:

\`\`\`json
${statusJson}
\`\`\`

### 完成时

创建文件 \`${workersDir}/result.json\`，内容:

\`\`\`json
${resultJson}
\`\`\`

### 遇到阻塞时

创建文件 \`${workersDir}/blocked.json\`，内容:

\`\`\`json
{
  "task_id": "${task.id}",
  "reason": "<reason>"
}
\`\`\``;
}

// ── Capability-based dispatch ────────────────────────────────────────

/**
 * Generate communication instructions based on agent capabilities.
 * Exported for direct testing with mock capabilities.
 *
 * Tiers:
 *   1. Full bash (canExecuteBash + canRunApexCLI) — heredoc + apex CLI
 *   2. File-write (canWriteFiles, no apex CLI) — "Write JSON" + "Run:" instructions
 *   3. Minimal (no bash, no file write) — "Create file" instructions only
 */
export function sectionCommunicationForCapabilities(
  opts: { task: Task; projectRoot: string },
  lang: "zh" | "en",
  caps: AgentCapabilities,
): string {
  const { task, projectRoot } = opts;
  const workersDir = `${projectRoot}/.apex/workers/${task.id}`;

  if (caps.canExecuteBash && caps.canRunApexCLI) {
    return fullBashCommunication(task, workersDir, projectRoot, lang);
  } else if (caps.canWriteFiles) {
    return fileWriteCommunication(task, workersDir, projectRoot, lang);
  } else {
    return minimalCommunication(task, workersDir, lang);
  }
}

function sectionCommunication(opts: ProtocolOptions, lang: "zh" | "en"): string {
  let caps = BUILTIN_ADAPTERS.claude.capabilities; // default: full capability
  if (opts.agent && BUILTIN_ADAPTERS[opts.agent]) {
    caps = BUILTIN_ADAPTERS[opts.agent].capabilities;
  }
  return sectionCommunicationForCapabilities(
    { task: opts.task, projectRoot: opts.projectRoot },
    lang,
    caps,
  );
}

function sectionBoundaries(opts: ProtocolOptions, lang: "zh" | "en"): string {
  const { task } = opts;

  if (lang === "en") {
    return `\
## Work Boundaries

- Only modify files within the worktree
- **Do NOT** modify files in the main project
- **Do NOT** modify other Workers' worktrees
- Git operations are limited to current branch (apex/${task.id})
- Commit to current branch, do not push to main/master`;
  }

  return `\
## 工作边界

- 只修改 worktree 内的文件
- **不要**修改主项目的代码文件
- **不要**修改其他 Worker 的 worktree
- Git 操作限于当前分支 (apex/${task.id})
- 提交代码到当前分支，不要 push 到 main/master`;
}

function sectionCrossModel(lang: "zh" | "en"): string {
  if (lang === "en") {
    return `\
## Cross-Model Independent Review

This is a cross-model independent review task. Multiple Agents with different models are reviewing the same code in parallel.

**Key Rules**:
- Produce your findings and conclusions independently, do not reference other Agents' results
- Report all issues you find honestly, even if you think they might be false positives
- Your result.json will be synthesized with other models' results for the final verdict
- Focus on: logic errors, security vulnerabilities, edge cases, race conditions`;
  }

  return `\
## 跨模型独立评审

这是一个跨模型独立评审任务。多个不同模型的 Agent 正在并行评审同一代码。

**关键规则**:
- 独立产出你的发现和结论，不要参考其他 Agent 的结果
- 如实报告你发现的所有问题，即使你认为它们可能是误报
- 你的 result.json 将与其他模型的结果合成最终裁决
- 重点关注: 逻辑错误、安全漏洞、边界条件、竞态条件`;
}

function sectionDirectiveCheck(opts: ProtocolOptions, lang: "zh" | "en"): string {
  const { task, projectRoot } = opts;
  const workersDir = `${projectRoot}/.apex/workers/${task.id}`;

  // Determine whether the agent supports bash
  const useBash = !opts.agent || (BUILTIN_ADAPTERS[opts.agent]?.capabilities.canExecuteBash ?? true);

  const escalationJson = `{ "task_id": "${task.id}", "type": "human_intervention", "stage": "<current_stage>", "summary": "${lang === "en" ? "Human user directly operated the terminal" : "人类用户直接操作了终端"}", "created_at": "<ISO timestamp>" }`;

  let escalationBlock: string;
  let directiveCheckBlock: string;
  let consumeBlock: string;

  if (useBash) {
    escalationBlock = `\
\`\`\`bash
cat > ${workersDir}/escalation.json << 'APEX_EOF'
${escalationJson}
APEX_EOF
\`\`\``;
    directiveCheckBlock = `\
\`\`\`bash
test -f ${workersDir}/directive.json && cat ${workersDir}/directive.json
\`\`\``;
    consumeBlock = `\`mv ${workersDir}/directive.json ${workersDir}/directive.$(date +%s).consumed.json\``;
  } else {
    escalationBlock = lang === "en"
      ? `Write the following JSON to \`${workersDir}/escalation.json\`:\n\n\`\`\`json\n${escalationJson}\n\`\`\``
      : `将以下 JSON 写入 \`${workersDir}/escalation.json\`:\n\n\`\`\`json\n${escalationJson}\n\`\`\``;
    directiveCheckBlock = lang === "en"
      ? `Check if \`${workersDir}/directive.json\` exists. If it does, read it.`
      : `检查 \`${workersDir}/directive.json\` 是否存在。如果存在，读取其内容。`;
    consumeBlock = lang === "en"
      ? `Rename \`${workersDir}/directive.json\` to \`${workersDir}/directive.consumed.json\``
      : `将 \`${workersDir}/directive.json\` 重命名为 \`${workersDir}/directive.consumed.json\``;
  }

  if (lang === "en") {
    return `\
## Plan Agent Communication Protocol

### Terminal Message Handling

When you receive a message starting with [PLAN-AGENT], it is a directive from the Plan Agent:
- \`[PLAN-AGENT]\` → Regular directive, read directive.json then continue
- \`[PLAN-AGENT:INTERRUPT]\` → Urgent directive, read directive.json immediately
- \`[PLAN-AGENT:RESUME]\` → Pause lifted, resume previous work

When you receive a message without the [PLAN-AGENT] prefix, it is a human user directly operating your terminal.
Respond to the user normally, but at the next stage boundary write an escalation:

${escalationBlock}

### Stage Boundary Check

After each \`apex stage complete <stage>\` and before \`apex stage set <next>\`:
Check whether directive.json exists:

${directiveCheckBlock}

If it exists:
- action: "amend" → Read the amendments, adjust subsequent work
- action: "pause" → Pause, wait for [PLAN-AGENT:RESUME]
- action: "abort" → Write result.json (verdict: "aborted"), exit
- action: "info" → Read supplementary information, continue work

After reading, rename: ${consumeBlock}`;
  }

  return `\
## Plan Agent 通信协议

### 终端消息处理

收到以 [PLAN-AGENT] 开头的消息时，这是来自 Plan Agent 的指令:
- \`[PLAN-AGENT]\` → 常规指令，读取 directive.json 后继续
- \`[PLAN-AGENT:INTERRUPT]\` → 紧急指令，立即读取 directive.json
- \`[PLAN-AGENT:RESUME]\` → 暂停已解除，继续之前的工作

收到不带 [PLAN-AGENT] 前缀的消息时，这是人类用户直接操作你的终端。
正常响应用户，但在下一个阶段边界写入 escalation:

${escalationBlock}

### 阶段边界检查

每次 \`apex stage complete <stage>\` 之后、\`apex stage set <next>\` 之前:
检查 directive.json 是否存在:

${directiveCheckBlock}

如果存在:
- action: "amend" → 读取修改内容，调整后续工作
- action: "pause" → 暂停，等待 [PLAN-AGENT:RESUME]
- action: "abort" → 写 result.json (verdict: "aborted")，退出
- action: "info" → 读取补充信息，继续工作

读取后重命名: ${consumeBlock}`;
}

// ── Main generator ────────────────────────────────────────────────────

export function generateWorkerProtocol(opts: ProtocolOptions): string {
  // Determine language from agent's preferred language
  let lang: "zh" | "en" = "zh";
  if (opts.agent && BUILTIN_ADAPTERS[opts.agent]) {
    lang = BUILTIN_ADAPTERS[opts.agent].capabilities.preferredLanguage;
  }

  const sections = [
    `# Apex-Forge Worker Agent — Task ${opts.task.id}`,
    sectionTask(opts, lang),
    sectionExecution(lang),
    sectionCoreRules(lang),
    sectionCommunication(opts, lang),
    sectionDirectiveCheck(opts, lang),
    sectionBoundaries(opts, lang),
  ];

  if (opts.crossModel) {
    sections.push(sectionCrossModel(lang));
  }

  return sections.join("\n\n") + "\n";
}

// ── Agent start command ───────────────────────────────────────────────

export async function agentStartCommand(agent: string, worktreePath: string): Promise<string> {
  // Load config adapters if available
  let configAdapters: AdaptersMap = {};
  try {
    const config = await loadConfig();
    if (config.adapters) {
      configAdapters = config.adapters;
    }
  } catch { /* config unavailable */ }

  // Resolve via adapter (config > builtin > error)
  const adapter = resolveAdapterWithConfig(agent, configAdapters);
  return adapter.buildStartCommand({
    worktreePath,
    protocolPath: ".apex/worker-protocol.md",
  });
}

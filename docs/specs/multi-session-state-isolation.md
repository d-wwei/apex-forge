# Spec: Multi-Session State Isolation

> 目标：同一项目目录下多个 Claude Code session 同时运行 apex-master (Plan Agent) 时，
> 各 session 的 pipeline stage 互不干扰。

## 1. 问题描述

### 现状

所有 session 共享同一个 `.apex/state.json` 缓存文件。`rebuildAndCache("state")` 回放
**全部** event 生成一个 `current_stage`，最后写入的 session 覆盖前一个。

```
Session A: apex stage set brainstorm → state.json = brainstorm
Session B: apex stage set execute   → state.json = execute  ← A 被覆盖
Session A: apex status              → 读到 execute (B 的)   ← 混乱
```

### 根因

- 事件日志层安全：每条 event 带 `session_id`，append-only JSONL 原子写入
- 缓存层不安全：`materializeState()` 不过滤 session，`state.json` 是单文件全量覆盖
- CLI 读缓存：`loadState()` 读 `state.json`，无法区分哪个 session 的 stage

### 附带问题：Task ID 竞态

两个 session 同时 `taskCreate()`，都读到 `next_id=5`，都创建 `T5`。
`materializeTasks()` 有去重（`if (store.tasks.some(t => t.id === id)) break`），
但第二个 `T5` 会被静默丢弃——任务丢失。

## 2. 解决方案

### 2.1 State 缓存按 session 隔离

**改动文件：`src/state/event-log.ts`**

#### 2.1.1 新增 session-aware 缓存路径

```typescript
// 现在 (line 30):
const STATE_CACHE = ".apex/state.json";

// 新增函数:
function sessionStateCachePath(sid?: string): string {
  const id = sid || currentSessionId();
  return `.apex/state.${id}.json`;
}
```

#### 2.1.2 修改 `rebuildAndCache("state")` 分支

**当前代码** (`src/state/event-log.ts` lines 460-480):
```typescript
export async function rebuildAndCache(domain: Domain): Promise<void> {
  const events = readEvents(domain);
  switch (domain) {
    // ...
    case "state": {
      const state = materializeState(events);
      await writeJSON(STATE_CACHE, state);
      break;
    }
    // ...
  }
}
```

**改为**:
```typescript
case "state": {
  const sid = currentSessionId();
  const allEvents = events;
  const sessionEvents = allEvents.filter(e => e.session_id === sid);

  // 1. 写 per-session 缓存（CLI 读这个）
  const sessionState = materializeState(sessionEvents);
  sessionState.session_id = sid;
  await writeJSON(sessionStateCachePath(sid), sessionState);

  // 2. 继续写全局缓存（Dashboard 的 deriveStageFromTasks 读这个做兜底）
  const globalState = materializeState(allEvents);
  await writeJSON(STATE_CACHE, globalState);
  break;
}
```

**关键决策**：全局 `state.json` 保留，保证 Dashboard 兼容。per-session 缓存是增量，不破坏现有逻辑。

#### 2.1.3 导出 `sessionStateCachePath` 供 state.ts 使用

```typescript
export { sessionStateCachePath };
```

### 2.2 State 读取优先读 per-session 缓存

**改动文件：`src/state/state.ts`**

**当前代码** (lines 20, 42-44):
```typescript
const STATE_PATH = ".apex/state.json";

async function loadState(): Promise<StageState> {
  return readJSON<StageState>(STATE_PATH, defaultState());
}
```

**改为**:
```typescript
import { currentSessionId, sessionStateCachePath } from "./event-log.js";

async function loadState(): Promise<StageState> {
  // 优先读 per-session 缓存
  const sessionPath = sessionStateCachePath();
  if (existsSync(sessionPath)) {
    return readJSON<StageState>(sessionPath, defaultState());
  }
  // 回退到全局缓存（首次启动、旧 session 遗留）
  return readJSON<StageState>(STATE_PATH, defaultState());
}
```

注意：`existsSync` 已在文件顶部 import。`STATE_PATH` 常量保留不删（其他地方可能引用）。

### 2.3 currentSessionId 去掉从 state.json 读取的逻辑

**改动文件：`src/state/event-log.ts`**

**当前代码** (lines 53-75):
```typescript
export function currentSessionId(): string {
  const envId = process.env.APEX_SESSION_ID;
  if (envId) return envId;
  if (_cachedSessionId) return _cachedSessionId;
  // 3. Read from state.json ← 多 session 时会读到别人的 ID
  try {
    if (existsSync(STATE_CACHE)) {
      const raw = JSON.parse(readFileSync(STATE_CACHE, "utf-8"));
      if (raw.session_id) {
        _cachedSessionId = raw.session_id;
        return raw.session_id;
      }
    }
  } catch { /* ignore */ }
  _cachedSessionId = sessionId();
  return _cachedSessionId;
}
```

**改为**:
```typescript
export function currentSessionId(): string {
  // 1. Environment variable (set by hooks)
  const envId = process.env.APEX_SESSION_ID;
  if (envId) return envId;

  // 2. Cached from previous call in this process
  if (_cachedSessionId) return _cachedSessionId;

  // 3. Generate new (不再从 state.json 读，避免跨 session 污染)
  _cachedSessionId = sessionId();
  return _cachedSessionId;
}
```

**为什么删掉 step 3 的 state.json 读取**：多 session 场景下，Session B 启动时读到
Session A 写的 `state.json`，会把 A 的 session_id 当成自己的，所有后续事件都标记为
A 的 ID——这是根因之一。每个进程应该始终生成自己的唯一 ID。

**风险评估**：删除这个逻辑意味着同一个 Claude Code session 如果 CLI 进程重启（比如
`apex stage set` 和后续 `apex status` 是两次 CLI 调用），两次调用会生成不同 session_id。
但实际使用中 `APEX_SESSION_ID` 环境变量由 session-start hook 设置，覆盖了这个路径。
如果环境变量未设置（比如手动跑 `apex` 命令），每次 CLI 调用确实会是新 session_id。

**解决**：如果 `APEX_SESSION_ID` 环境变量未设置，在 `apex init` 时生成并写入
`.apex/.session_id` 文件，后续读取这个文件而非 state.json：

```typescript
const SESSION_ID_FILE = ".apex/.session_id";

export function currentSessionId(): string {
  const envId = process.env.APEX_SESSION_ID;
  if (envId) return envId;

  if (_cachedSessionId) return _cachedSessionId;

  // Read from per-directory session marker (safe: only this session's marker)
  try {
    if (existsSync(SESSION_ID_FILE)) {
      const id = readFileSync(SESSION_ID_FILE, "utf-8").trim();
      if (id) {
        _cachedSessionId = id;
        return id;
      }
    }
  } catch { /* ignore */ }

  _cachedSessionId = sessionId();
  return _cachedSessionId;
}
```

同时在 `apex init` 命令中（`src/commands/init.ts`），如果 `.apex/.session_id` 不存在则写入：
```typescript
import { currentSessionId } from "../state/event-log.js";
import { writeFileSync, existsSync } from "fs";

// 在 init 流程末尾添加:
const sidFile = ".apex/.session_id";
if (!existsSync(sidFile)) {
  writeFileSync(sidFile, currentSessionId(), "utf-8");
}
```

**但注意**：这意味着同一个终端里多次手动运行 `apex` 命令会共享同一个 session_id（符合预期），
而不同终端需要各自的 `.session_id`。由于多个 Master Agent 通常在不同终端，而每个终端有自己的
环境变量 `APEX_SESSION_ID`（由 hook 设置），这个 fallback 主要处理没有 hook 的手动场景。

**最终判断**：优先依赖 `APEX_SESSION_ID` 环境变量。`.apex/.session_id` 文件方案作为
fallback 但要注意多终端共享同一目录的问题——如果两个终端都没有设 env var，都会读到同一个
`.apex/.session_id`，又回到老问题。

**最简方案**：只删掉从 `state.json` 读取的逻辑，保留生成新 ID 的逻辑。
在实际使用中，`APEX_SESSION_ID` 环境变量是主路径，覆盖了绝大多数场景。
没有 env var 的情况下，每次 CLI 进程会有不同 session_id——不完美但不会导致跨 session 污染
（最坏情况：同一个 session 的事件分散在多个 session_id 下，per-session 缓存看到的
state 不完整，但不会看到别人的 state）。

```typescript
// 最终版本
export function currentSessionId(): string {
  const envId = process.env.APEX_SESSION_ID;
  if (envId) return envId;

  if (_cachedSessionId) return _cachedSessionId;

  _cachedSessionId = sessionId();
  return _cachedSessionId;
}
```

### 2.4 Task ID 防竞态

**改动文件：`src/state/tasks.ts`**

**当前代码** (`taskCreate`, line 117):
```typescript
const id = `T${store.next_id}`;
```

**改为**：用 session 前缀 + 时间戳保证唯一：
```typescript
import { currentSessionId } from "./event-log.js";

// 在 taskCreate 函数内:
const sid = currentSessionId();
const shortSid = sid.split("-").pop() || sid.slice(-6); // 取最后 6 位随机部分
const id = `T${store.next_id}-${shortSid}`;
```

**但这会改变 Task ID 格式**，影响大量下游代码（`apex task start T1`, DAG 引用, Worker 命名等）。

**更保守的方案**：保留 `T${N}` 格式，用原子递增避免竞态。

事件日志天然提供了"真正的 next_id"——统计日志中已创建的最大 ID：
```typescript
export async function taskCreate(
  title: string,
  desc: string,
  dependsOn: string[] = [],
): Promise<Task> {
  // 从事件日志（而非缓存）计算真正的 next_id，避免缓存竞态
  const events = readEvents("task");
  let maxId = 0;
  for (const evt of events) {
    if (evt.type === "task.created" && evt.payload.id) {
      const num = parseInt((evt.payload.id as string).replace(/\D/g, ""), 10);
      if (num > maxId) maxId = num;
    }
  }
  const id = `T${maxId + 1}`;

  appendEvent("task", "task.created", {
    id,
    title,
    description: desc,
    depends_on: dependsOn,
  });

  await rebuildAndCache("task");
  const updated = await loadStore();
  return findTask(updated, id);
}
```

**权衡**：这仍然有微小竞态窗口（两个进程同时读到 maxId=5，都创建 T6），但：
1. 事件日志的去重会保留第一个 T6，丢弃第二个
2. 第二个进程的 `rebuildAndCache` 后读到的 `next_id` 已正确为 7
3. 第二个进程的 `findTask(updated, "T6")` 找到的是第一个进程创建的 T6，内容可能不对

**真正安全的方案**：ID 加随机后缀。但为了最小改动，先采用上面的"从事件日志算 maxId"方案，
并在 `materializeTasks` 的去重逻辑中改为合并而非丢弃：

```typescript
// event-log.ts materializeTasks 中，line 179-180:
// 现在:
if (store.tasks.some((t) => t.id === id)) break;

// 改为:
const existing = store.tasks.find((t) => t.id === id);
if (existing) {
  // 保留先创建的，但记录冲突
  if (!existing.description.includes("[conflict]")) {
    existing.description += ` [conflict: duplicate T${id} from session ${evt.session_id}]`;
  }
  break;
}
```

## 3. 不改的部分

| 组件 | 为什么不改 |
|------|-----------|
| 事件日志写入 (`appendEvent`) | 已经是 append-only + session_id 标记，天然多写安全 |
| Dashboard `materializePerSession()` | 已经按 session 分组，逻辑正确 |
| Dashboard `buildStatePayload()` | 读全局 state.json + per-session pipelines，改后兼容 |
| Dashboard `deriveStageFromTasks()` | 读全局 state.json 做兜底推导，改后仍从全局 cache 读 |
| Worker 文件通信 (`.apex/workers/`) | 按 task_id 隔离，不受 session 影响 |
| `materializeTasks()` | Task 事件不区分 session（任务是项目级共享的），保持原样 |
| `materializeMemory()` | Memory 是项目级共享的，保持原样 |

## 4. 清理策略

Per-session 缓存文件（`.apex/state.{session_id}.json`）会随 session 增加而堆积。

在 `apex init` 中添加清理：删除超过 7 天的 per-session state 缓存。

```typescript
// src/commands/init.ts 末尾添加
import { readdirSync, statSync, unlinkSync } from "fs";

const STALE_DAYS = 7;
const apexDir = ".apex";
try {
  const files = readdirSync(apexDir).filter(f => /^state\.apex-.*\.json$/.test(f));
  const cutoff = Date.now() - STALE_DAYS * 86400000;
  for (const f of files) {
    const fp = join(apexDir, f);
    try {
      if (statSync(fp).mtimeMs < cutoff) unlinkSync(fp);
    } catch { /* ignore */ }
  }
} catch { /* ignore */ }
```

## 5. 测试计划

### 5.1 单元测试：`src/__tests__/session-isolation.test.ts`（新建）

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// 测试用例（全部需要实现）:

describe("session-aware state cache", () => {

  // 每个 test 前创建临时 .apex/ 目录，设置 cwd
  // 每个 test 后还原 cwd，清理临时目录

  test("两个 session 写入不同 stage，各自读到自己的 stage", () => {
    // 1. 设 APEX_SESSION_ID="session-a"
    // 2. apex stage set brainstorm → 事件写入 state.jsonl
    // 3. 读 state.session-a.json → current_stage === "brainstorm"
    // 4. 设 APEX_SESSION_ID="session-b"
    // 5. 清除 _cachedSessionId（需要 resetSessionId 导出或 mock）
    // 6. apex stage set execute → 事件追加到同一个 state.jsonl
    // 7. 读 state.session-b.json → current_stage === "execute"
    // 8. 读 state.session-a.json → current_stage 仍然是 "brainstorm"
    // 9. 读全局 state.json → current_stage === "execute"（最后写入者）
  });

  test("session A 的 gate 检查不受 session B 的 artifact 影响", () => {
    // 1. Session B 注册了 brainstorm artifact
    // 2. Session A 尝试 completeStage("brainstorm") → 应该 FAIL
    //    因为 Session A 的 per-session state 没有 artifact
  });

  test("loadState 优先读 per-session 缓存", () => {
    // 1. 写全局 state.json: current_stage = "review"
    // 2. 写 per-session state: current_stage = "plan"
    // 3. loadState() → 返回 "plan"
  });

  test("per-session 缓存不存在时回退到全局缓存", () => {
    // 1. 只写全局 state.json: current_stage = "review"
    // 2. 不写 per-session
    // 3. loadState() → 返回 "review"
  });

  test("currentSessionId 不再从 state.json 读取别人的 ID", () => {
    // 1. 写 state.json: session_id = "session-other"
    // 2. 清除环境变量和缓存
    // 3. currentSessionId() → 返回新生成的 ID，不是 "session-other"
  });

});

describe("task ID collision resistance", () => {

  test("两个 session 并发创建任务，ID 不冲突", () => {
    // 1. Session A: taskCreate("task-a", "desc")  → T1
    // 2. Session B: taskCreate("task-b", "desc")  → T2 (不是 T1)
    // 注意：这个测试需要在同一进程中模拟，因为 next_id 从事件日志重算
  });

  test("重复 ID 的事件不会丢失任务", () => {
    // 1. 手动写两条 task.created 事件，都是 id="T1"
    // 2. materializeTasks → 第一个保留，第二个记录 conflict
  });

});
```

### 5.2 需要 export 的测试辅助函数

`currentSessionId` 内部的 `_cachedSessionId` 目前是模块私有变量。
测试需要在不同 session 之间切换，需要导出一个 reset 函数：

```typescript
// src/state/event-log.ts 新增（仅用于测试）
export function _resetSessionIdCache(): void {
  _cachedSessionId = null;
}
```

### 5.3 现有测试回归

运行 `bun test` 确认全部 278 个测试通过。重点关注：
- `src/__tests__/tasks.test.ts` — taskCreate 的 ID 生成逻辑变了
- `src/__tests__/event-log-sessions.test.ts` — materializePerSession 不受影响
- `src/commands/__tests__/worker*.test.ts` — Worker 读 state 的路径变了

## 6. 实施顺序

严格按此顺序，每步完成后跑 `bun test` 确认不回归：

| 步骤 | 文件 | 改动 | 验证 |
|------|------|------|------|
| 1 | `src/state/event-log.ts` | 导出 `sessionStateCachePath()`、`_resetSessionIdCache()` | 编译通过 |
| 2 | `src/state/event-log.ts` | 修改 `currentSessionId()` — 删除 state.json 读取 | `bun test` 全绿 |
| 3 | `src/state/event-log.ts` | 修改 `rebuildAndCache("state")` — 双写 per-session + 全局 | `bun test` 全绿 |
| 4 | `src/state/state.ts` | 修改 `loadState()` — 优先读 per-session 缓存 | `bun test` 全绿 |
| 5 | `src/__tests__/session-isolation.test.ts` | 新建测试文件，实现 5.1 中所有用例 | 新测试全绿 |
| 6 | `src/state/tasks.ts` | 修改 `taskCreate()` — 从事件日志算 maxId | `bun test` 全绿 |
| 7 | `src/state/event-log.ts` | `materializeTasks` 去重逻辑改为记录 conflict | `bun test` 全绿 |
| 8 | `src/commands/init.ts` | 添加 stale per-session cache 清理 | 手动验证 |
| 9 | 全量 | — | `bun test` 278+ tests 全绿 |

## 7. 约束

- **不改事件日志格式**：`.apex/log/state.jsonl` 的 event schema 不变
- **不改 Dashboard API**：`/api/state` 返回结构不变，`sessionPipelines` 已经是 per-session
- **不改 Worker 通信**：`.apex/workers/` 目录结构不变
- **全局 state.json 保留**：Dashboard 的 `deriveStageFromTasks` 仍读全局缓存做兜底
- **向后兼容**：没有 per-session 缓存时 graceful fallback 到全局缓存
- **Task ID 格式不变**：保持 `T{N}` 格式，不加 session 前缀

## 8. 文件清单

| 文件 | 操作 | 改动行数估算 |
|------|------|-------------|
| `src/state/event-log.ts` | 修改 | ~30 行 |
| `src/state/state.ts` | 修改 | ~10 行 |
| `src/state/tasks.ts` | 修改 | ~15 行 |
| `src/commands/init.ts` | 修改 | ~15 行 |
| `src/__tests__/session-isolation.test.ts` | 新建 | ~120 行 |
| **总计** | | **~190 行** |

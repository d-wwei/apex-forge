# Phase 1c 执行提示词：记忆后端插件化

直接复制以下内容到新的 Claude Code 会话中执行。

---

## 提示词

```
我在做 Apex Forge 的记忆后端插件化。仓库在当前目录。

核心思路：AF 定义一个记忆接口，启动时探测可用的记忆后端，按优先级选择。用户无感。

先读这些文件了解上下文：
1. docs/project-overview.md — 项目全景（四层结构）
2. src/state/memory.ts — 当前的记忆实现（flat JSON）
3. src/commands/memory.ts — 当前的 memory CLI 命令
4. src/types/state.ts — 类型定义
5. skill/stages/compound.md — 知识提取阶段（写 docs/solutions/ + memory.json）
6. skill/SKILL.md 第 59-100 行 — 启动时的 5 步检查

然后探索 Agent Recall 系统：
7. /Users/admin/Documents/AI/Agent-recall/agent-recall/README.md
8. /Users/admin/Documents/AI/Agent-recall/agent-recall/src/servers/mcp-server.ts 前 80 行
9. 检查 Agent Recall worker 状态：curl -s http://localhost:37777/api/dashboard 2>/dev/null | head -20
10. 检查 Agent Recall 的 HTTP API 路由定义：find /Users/admin/Documents/AI/Agent-recall/agent-recall/src -name "*route*" -o -name "*Route*" | head -10，读其中 SearchRoutes 和 MemoryRoutes 理解 API

读完后，按顺序执行以下任务：

---

### 任务 1：定义记忆后端接口

创建 `src/memory/interface.ts`，定义统一的记忆接口：

```typescript
export interface MemoryBackend {
  name: string;                          // "agent-recall" | "apex-local" | ...

  // 基础操作
  addFact(fact: string, confidence: number, tags?: string[]): Promise<string>;  // 返回 fact ID
  searchFacts(query: string, limit?: number): Promise<MemoryFact[]>;
  listFacts(minConfidence?: number): Promise<MemoryFact[]>;
  removeFact(id: string): Promise<void>;
  pruneFacts(minConfidence?: number): Promise<number>;  // 返回删除数量

  // 知识提取（compound 阶段用）
  addSolution(path: string, category: string, tags: string[]): Promise<void>;
  searchSolutions(query: string): Promise<SolutionRef[]>;

  // 上下文注入（session start 用）
  injectContext(project: string): Promise<string>;  // 返回注入文本

  // 会话恢复
  getActiveTask(): Promise<ActiveTask | null>;
  saveCheckpoint(data: CheckpointData): Promise<void>;
}

export interface MemoryFact {
  id: string;
  content: string;
  confidence: number;
  tags: string[];
  createdAt: string;
  source?: string;      // "agent-recall" | "apex-local"
}

export interface SolutionRef {
  path: string;
  category: string;
  title: string;
  tags: string[];
}

export interface ActiveTask {
  taskId: string;
  stage: string;
  description: string;
  lastUpdated: string;
}

export interface CheckpointData {
  stage: string;
  taskId?: string;
  context: string;
}
```

### 任务 2：实现 Agent Recall 后端

创建 `src/memory/agent-recall-backend.ts`：

- 实现 MemoryBackend 接口
- 所有操作通过 HTTP 调 localhost:37777 的 API
- addFact → POST /api/data/observations（type: "discovery", scope: "project"）
- searchFacts → GET /api/search?query=xxx&project=xxx
- listFacts → GET /api/timeline?project=xxx
- injectContext → GET /api/context/session（获取 Agent Recall 的上下文注入）
- getActiveTask → GET /api/recovery/active-tasks
- saveCheckpoint → POST /api/recovery/checkpoint
- addSolution → POST /api/data/observations（type: "discovery", 带 solution 相关 tags）
- searchSolutions → GET /api/search?query=xxx&type=discovery

注意：Agent Recall 的 API 可能和上面列的不完全一致。读它的路由定义确认实际端点和参数格式。如果某个操作 Agent Recall 不支持，在实现里 fallback 到本地。

### 任务 3：实现本地 fallback 后端

创建 `src/memory/local-backend.ts`：

- 实现 MemoryBackend 接口
- 包装现有的 src/state/memory.ts 逻辑
- addFact → 写 .apex/memory.json
- searchFacts → 在 memory.json 里字符串匹配
- injectContext → apex memory inject 的逻辑
- getActiveTask → 读 .apex/tasks.json 找 in_progress 的任务
- saveCheckpoint → 写 .apex/checkpoints/ 目录

这是现有功能的重新包装，不是新功能。

### 任务 4：实现后端探测和选择

创建 `src/memory/detector.ts`：

```typescript
export async function detectMemoryBackend(): Promise<MemoryBackend> {
  // 1. 检测 Agent Recall
  try {
    const resp = await fetch("http://localhost:37777/api/dashboard", {
      signal: AbortSignal.timeout(2000)
    });
    if (resp.ok) {
      console.log("[memory] Using Agent Recall backend");
      return new AgentRecallBackend();
    }
  } catch {
    // Not running
  }

  // 2. 未来可以在这里加更多后端检测
  // 比如检测其他记忆系统的端口或文件

  // 3. Fallback 到本地
  console.log("[memory] Using local .apex/ backend");
  return new LocalBackend();
}
```

### 任务 5：接入 CLI 和 pipeline

修改 `src/commands/memory.ts`：
- 顶部调 detectMemoryBackend() 获取后端实例
- 所有 memory 子命令（add/search/list/prune/inject）改为调后端接口
- 原有的直接文件操作改为通过 LocalBackend

修改 `skill/stages/compound.md`：
- 知识提取部分说明：compound 阶段调 `apex memory add` 时会自动选择最佳后端
- 如果 Agent Recall 在运行，solution 文档会同时存到 docs/solutions/ 和 Agent Recall 数据库
- 如果只有本地后端，存到 docs/solutions/ + .apex/memory.json

修改 `skill/SKILL.md` 的 Step 5（会话恢复）：
- 恢复逻辑改为先调后端接口的 getActiveTask()
- Agent Recall 后端能提供更丰富的恢复上下文（完整的 session archive + active tasks）

### 任务 6：启动时后端探测

修改 `skill/SKILL.md` 的 Setup 段，在 Step 2（auto-init）后加入：

```
**Step 2.5 — Detect memory backend (silent):**

Run: apex memory backend
This detects available memory systems and reports which one is active.
If Agent Recall is detected, memory operations will use it automatically.
If not, falls back to local .apex/memory.json. No user action needed.
```

给 CLI 加 `apex memory backend` 命令，输出当前使用的后端名称。

### 任务 7：验证

1. 启动 Agent Recall worker（如果没跑的话）：
   ```bash
   cd /Users/admin/Documents/AI/Agent-recall/agent-recall && npm run worker:start
   ```

2. 验证自动检测到 Agent Recall：
   ```bash
   apex memory backend
   # 应输出: agent-recall
   ```

3. 验证 memory 命令走 Agent Recall：
   ```bash
   apex memory add "test fact from AF" 0.9 test
   apex memory search "test fact"
   ```

4. 停掉 Agent Recall worker：
   ```bash
   cd /Users/admin/Documents/AI/Agent-recall/agent-recall && npm run worker:stop
   ```

5. 验证自动 fallback：
   ```bash
   apex memory backend
   # 应输出: apex-local
   apex memory add "local fallback test" 0.8 test
   apex memory search "local fallback"
   ```

6. 跑测试确保没有 break 现有功能：
   ```bash
   bun test
   ```

全部完成后 commit 并 push。更新 docs/iteration-roadmap.md 标记记忆后端插件化完成。
```

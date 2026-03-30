import { existsSync, mkdirSync, symlinkSync } from "fs";
import path from "path";
import { writeJSON } from "../utils/json.js";
import { isoTimestamp, sessionId } from "../utils/timestamp.js";
import type { StageState } from "../types/state.js";
import type { TaskStore } from "../types/task.js";
import type { MemoryStore } from "../types/memory.js";

const APEX_DIR = ".apex";

const SUBDIRS = [
  "analytics",
  "screenshots",
  "worktrees",
  "browser-state",
  "waves",
  "retros",
  "audits",
  "reviews",
  "canary",
  "benchmarks",
  "designs",
  "sandbox",
  "orchestrator-logs",
] as const;

export async function cmdInit(): Promise<void> {
  const alreadyExists = existsSync(APEX_DIR);

  // Create root + subdirectories (idempotent)
  mkdirSync(APEX_DIR, { recursive: true });
  for (const sub of SUBDIRS) {
    mkdirSync(`${APEX_DIR}/${sub}`, { recursive: true });
  }

  // Write initial state files (only if missing)
  if (!existsSync(`${APEX_DIR}/state.json`)) {
    const initialState: StageState = {
      current_stage: "idle",
      last_updated: isoTimestamp(),
      session_id: sessionId(),
      artifacts: {},
      history: [],
    };
    await writeJSON(`${APEX_DIR}/state.json`, initialState);
  }

  if (!existsSync(`${APEX_DIR}/tasks.json`)) {
    const initialTasks: TaskStore = { tasks: [], next_id: 1 };
    await writeJSON(`${APEX_DIR}/tasks.json`, initialTasks);
  }

  if (!existsSync(`${APEX_DIR}/memory.json`)) {
    const initialMemory: MemoryStore = { facts: [], next_id: 1 };
    await writeJSON(`${APEX_DIR}/memory.json`, initialMemory);
  }

  // Install pre-commit hook if in a git repo
  const gitDir = path.join(process.cwd(), ".git");
  if (existsSync(gitDir)) {
    const hooksDir = path.join(gitDir, "hooks");
    mkdirSync(hooksDir, { recursive: true });

    const hookDst = path.join(hooksDir, "pre-commit");
    const hookSrc = path.join(process.cwd(), "hooks", "pre-commit");

    if (existsSync(hookSrc) && !existsSync(hookDst)) {
      symlinkSync(path.resolve(hookSrc), hookDst);
      console.log("Installed pre-commit hook (auto memory curation)");
    } else if (existsSync(hookDst)) {
      console.log("Pre-commit hook already exists (not overwriting)");
    }
  }

  // Add .apex/ to .gitignore if in git repo and not already there
  if (existsSync(gitDir)) {
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    if (existsSync(gitignorePath)) {
      const content = (await Bun.file(gitignorePath).text()).trim();
      if (!content.includes(".apex/")) {
        await Bun.write(gitignorePath, content + "\n.apex/\n");
        console.log("Added .apex/ to .gitignore");
      }
    }
  }

  console.log(alreadyExists ? ".apex/ updated" : "Initialized .apex/ directory");
}

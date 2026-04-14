import { existsSync, lstatSync, mkdirSync, symlinkSync, readdirSync, statSync, unlinkSync } from "fs";
import path from "path";
import { writeJSON } from "../utils/json.js";
import { isoTimestamp, sessionId } from "../utils/timestamp.js";
import type { StageState } from "../types/state.js";
import type { TaskStore } from "../types/task.js";
import type { MemoryStore } from "../types/memory.js";

const APEX_DIR = ".apex";

const SUBDIRS = [
  "log",
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

  // Install git hooks if in a git repo (skip in worktrees where .git is a file)
  const gitDir = path.join(process.cwd(), ".git");
  const isGitDir = existsSync(gitDir) && lstatSync(gitDir).isDirectory();
  if (isGitDir) {
    const hooksDir = path.join(gitDir, "hooks");
    mkdirSync(hooksDir, { recursive: true });

    const gitHooks = [
      { name: "pre-commit", desc: "auto memory curation" },
      { name: "pre-push", desc: "preflight scan (secrets, PII, local paths)" },
    ];

    for (const hook of gitHooks) {
      const hookDst = path.join(hooksDir, hook.name);
      const hookSrc = path.join(process.cwd(), "hooks", hook.name);

      const hookDstExists = (() => {
        try { lstatSync(hookDst); return true; } catch { return false; }
      })();

      if (existsSync(hookSrc) && !hookDstExists) {
        symlinkSync(path.resolve(hookSrc), hookDst);
        console.log(`Installed ${hook.name} hook (${hook.desc})`);
      } else if (hookDstExists) {
        console.log(`${hook.name} hook already exists (not overwriting)`);
      }
    }
  }

  // Add .apex/ to .gitignore if in git repo and not already there
  if (isGitDir) {
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    if (existsSync(gitignorePath)) {
      const content = (await Bun.file(gitignorePath).text()).trim();
      if (!content.includes(".apex/")) {
        await Bun.write(gitignorePath, content + "\n.apex/\n");
        console.log("Added .apex/ to .gitignore");
      }
    }
  }

  // Clean up stale per-session state caches (older than 7 days)
  try {
    const files = readdirSync(APEX_DIR).filter(f => /^state\..+\.json$/.test(f) && f !== "state.json");
    const cutoff = Date.now() - 7 * 86400000;
    for (const f of files) {
      const fp = path.join(APEX_DIR, f);
      try {
        if (statSync(fp).mtimeMs < cutoff) unlinkSync(fp);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  console.log(alreadyExists ? ".apex/ updated" : "Initialized .apex/ directory");
}

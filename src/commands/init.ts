import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { autoPort, register } from "../registry.js";
import type { MemoryStore } from "../types/memory.js";
import type { StageState } from "../types/state.js";
import type { TaskStore } from "../types/task.js";
import { writeJSON } from "../utils/json.js";
import { isoTimestamp, sessionId } from "../utils/timestamp.js";

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
      {
        name: "pre-commit",
        desc: "pipeline stage gate + auto memory curation",
      },
      { name: "pre-push", desc: "preflight scan (secrets, PII, local paths)" },
    ];

    // Look for hook sources in multiple locations (skill dir first, then CWD)
    const skillHooksDir = path.join(
      process.env.HOME || "/tmp",
      ".claude",
      "skills",
      "apex-forge",
      "hooks",
    );
    const cwdHooksDir = path.join(process.cwd(), "hooks");

    for (const hook of gitHooks) {
      const hookDst = path.join(hooksDir, hook.name);
      // Prefer skill installation directory (works in ANY repo)
      // Fall back to CWD/hooks/ (works in the apex-forge repo itself)
      const hookSrc = existsSync(path.join(skillHooksDir, hook.name))
        ? path.join(skillHooksDir, hook.name)
        : path.join(cwdHooksDir, hook.name);

      const linkExists = (() => {
        try {
          lstatSync(hookDst);
          return true;
        } catch {
          return false;
        }
      })();
      const targetValid = linkExists && existsSync(hookDst);

      // Broken symlink: delete and recreate
      if (linkExists && !targetValid) {
        unlinkSync(hookDst);
        console.log(`Removed broken ${hook.name} hook symlink`);
      }

      if (existsSync(hookSrc) && (!linkExists || !targetValid)) {
        symlinkSync(path.resolve(hookSrc), hookDst);
        console.log(`Installed ${hook.name} hook (${hook.desc})`);
      } else if (targetValid) {
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
        await Bun.write(gitignorePath, `${content}\n.apex/\n`);
        console.log("Added .apex/ to .gitignore");
      }
    }
  }

  // Clean up stale per-session state caches (older than 7 days)
  try {
    const files = readdirSync(APEX_DIR).filter(
      (f) => /^state\..+\.json$/.test(f) && f !== "state.json",
    );
    const cutoff = Date.now() - 7 * 86400000;
    for (const f of files) {
      const fp = path.join(APEX_DIR, f);
      try {
        if (statSync(fp).mtimeMs < cutoff) unlinkSync(fp);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  // Auto-register project so Dashboard Hub can discover it without
  // requiring a separate `apex dashboard` invocation.
  const projectDir = path.resolve(process.cwd());
  const projectName = path.basename(projectDir);
  register({
    name: projectName,
    path: projectDir,
    port: autoPort(projectDir),
    pid: 0, // no dashboard server running — Hub uses .apex/ existence, not PID
    startedAt: new Date().toISOString(),
  });

  console.log(
    alreadyExists ? ".apex/ updated" : "Initialized .apex/ directory",
  );
}

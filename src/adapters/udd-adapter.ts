import { defineAdapter } from "udd-kit/adapter";
import { createRuntime, type UddRuntime } from "udd-kit/runtime";
import type { UddAdapter } from "udd-kit";
import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { execSync } from "child_process";

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== "/") {
    if (existsSync(resolve(dir, ".git"))) return dir;
    dir = dirname(dir);
  }
  return startDir;
}

function loadVersion(repoRoot: string): string {
  const pkgPath = resolve(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version || "0.0.0";
  }
  return "0.0.0";
}

function getGitInfo(repoRoot: string): { branch?: string; head?: string; changedFiles?: string[] } {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoRoot, encoding: "utf-8", stdio: "pipe" }).trim();
    const head = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8", stdio: "pipe" }).trim();
    const changed = execSync("git diff --name-only", { cwd: repoRoot, encoding: "utf-8", stdio: "pipe" }).trim();
    return {
      branch,
      head,
      changedFiles: changed ? changed.split("\n") : [],
    };
  } catch {
    return {};
  }
}

export function createApexUddAdapter(cwd?: string): UddAdapter {
  const repoRoot = findRepoRoot(cwd || process.cwd());

  return defineAdapter({
    name: "apex-forge",

    getContext(overrides) {
      const version = loadVersion(repoRoot);
      const git = getGitInfo(repoRoot);
      return {
        cwd: repoRoot,
        appName: "apex-forge",
        appVersion: version,
        git,
        error: overrides?.error,
        confirm: overrides?.confirm || (async () => true),
        ...overrides,
      };
    },

    async runCommand(cmd: string[], commandCwd: string): Promise<string> {
      const result = execSync(cmd.join(" "), {
        cwd: commandCwd,
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 60_000,
      });
      return result;
    },

    async runHook(hook, hookCwd) {
      try {
        const output = execSync(hook.command as string, {
          cwd: hookCwd,
          encoding: "utf-8",
          stdio: "pipe",
          timeout: hook.timeoutMs || 120_000,
        });
        return { ok: true, output };
      } catch (err: any) {
        return { ok: false, output: err.stderr || err.message };
      }
    },

    async readState() {
      const statePath = resolve(repoRoot, ".udd/state.json");
      if (existsSync(statePath)) {
        return JSON.parse(readFileSync(statePath, "utf-8"));
      }
      return undefined;
    },

    async writeState(state) {
      const stateDir = resolve(repoRoot, ".udd");
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(state, null, 2));
    },

    async writeAudit(record) {
      const stateDir = resolve(repoRoot, ".udd");
      mkdirSync(stateDir, { recursive: true });
      appendFileSync(resolve(stateDir, "audit.jsonl"), JSON.stringify(record) + "\n");
    },
  });
}

export async function createApexUddRuntime(cwd?: string): Promise<UddRuntime> {
  const repoRoot = findRepoRoot(cwd || process.cwd());
  return createRuntime({ cwd: repoRoot });
}

export type { UddRuntime };

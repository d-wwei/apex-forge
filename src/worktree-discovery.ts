/**
 * Worktree Discovery Utility
 *
 * Discovers git worktrees and groups registered projects by shared repo root.
 * Used by the dashboard to aggregate multi-worktree views.
 */

import { existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { spawnSync } from "child_process";
import type { ProjectEntry } from "./registry.js";

// ---------------------------------------------------------------------------
// TTL cache — avoids repeated subprocess spawns during SSE polling
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000; // 30 seconds

interface CacheEntry<T> { value: T; expires: number; }

const repoRootCache = new Map<string, CacheEntry<string | null>>();
const worktreeCache = new Map<string, CacheEntry<WorktreeInfo[]>>();

function cached<T>(map: Map<string, CacheEntry<T>>, key: string, compute: () => T): T {
  const entry = map.get(key);
  if (entry && Date.now() < entry.expires) return entry.value;
  const value = compute();
  map.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export interface WorktreeInfo {
  path: string;       // absolute worktree path
  branch: string;     // e.g. "refs/heads/feature-a"
  label: string;      // short name: "feature-a" or "main"
  isMain: boolean;    // is this the main worktree?
  hasApex: boolean;   // does .apex/ exist here?
}

export interface WorktreeGroup {
  repoRoot: string;
  repoName: string;
  worktrees: WorktreeInfo[];
  projectPaths: string[];
}

/**
 * Get the canonical git repo root for a directory.
 * Uses --git-common-dir to resolve through worktrees to the main repo root.
 * Returns null for non-git directories.
 */
export function getRepoRoot(dir: string): string | null {
  return cached(repoRootCache, dir, () => {
    const result = spawnSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.status !== 0) return null;
    const absGitDir = resolve(dir, result.stdout.trim());
    return dirname(absGitDir);
  });
}

/**
 * Discover all worktrees for the repo containing `anyProjectDir`.
 * Parses `git worktree list --porcelain` for stable machine output.
 */
export function discoverWorktrees(anyProjectDir: string): WorktreeInfo[] {
  const repoRoot = getRepoRoot(anyProjectDir);
  if (!repoRoot) return [];

  return cached(worktreeCache, repoRoot, () => {
    const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 10000,
    });
    if (result.status !== 0) return [];

    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of result.stdout.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) {
          worktrees.push(finalizeWorktree(current));
        }
        current = { path: line.slice(9).trim() };
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice(7).trim();
      } else if (line === "bare") {
        current = {};
      } else if (line === "") {
        if (current.path) {
          worktrees.push(finalizeWorktree(current));
          current = {};
        }
      }
    }
    if (current.path) {
      worktrees.push(finalizeWorktree(current));
    }

    if (worktrees.length > 0) {
      worktrees[0].isMain = true;
    }

    return worktrees;
  });
}

function finalizeWorktree(partial: Partial<WorktreeInfo>): WorktreeInfo {
  const path = partial.path!;
  const branch = partial.branch || "(detached)";
  // Extract short label: "refs/heads/feature-a" → "feature-a"
  // For detached HEAD, fall back to directory name to avoid duplicate labels
  let label: string;
  if (branch.startsWith("refs/heads/")) {
    label = branch.slice(11);
  } else if (branch === "(detached)") {
    label = path.split("/").filter(Boolean).pop() || "detached";
  } else {
    label = branch;
  }
  return {
    path,
    branch,
    label,
    isMain: false, // caller sets the first one to true
    hasApex: existsSync(join(path, ".apex")),
  };
}

/**
 * Group a flat list of registered projects by shared git repo root.
 * Only returns groups with 2+ worktrees that have .apex/ directories.
 */
export function groupProjectsByRepo(projects: ProjectEntry[]): WorktreeGroup[] {
  const repoMap = new Map<string, ProjectEntry[]>();

  for (const p of projects) {
    const root = getRepoRoot(p.path);
    if (!root) continue;
    const existing = repoMap.get(root);
    if (existing) {
      existing.push(p);
    } else {
      repoMap.set(root, [p]);
    }
  }

  const groups: WorktreeGroup[] = [];
  for (const [repoRoot, entries] of repoMap) {
    if (entries.length < 2) continue;

    // Discover all worktrees (including unregistered ones with .apex/)
    const allWorktrees = discoverWorktrees(repoRoot).filter(wt => wt.hasApex);
    if (allWorktrees.length < 2) continue;

    const repoName = repoRoot.split("/").filter(Boolean).pop() || "unknown";
    groups.push({
      repoRoot,
      repoName,
      worktrees: allWorktrees,
      projectPaths: allWorktrees.map(wt => wt.path),
    });
  }

  return groups;
}

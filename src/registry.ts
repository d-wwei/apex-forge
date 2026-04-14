/**
 * Project Dashboard Registry
 *
 * Shared registry at ~/.apex-forge/registry.json tracks all active dashboards.
 * Each dashboard registers on start, unregisters on exit.
 * Hub and sidebars read this to discover all active projects.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { spawnSync } from "child_process";

const REGISTRY_DIR = join(process.env.HOME || "/tmp", ".apex-forge");
const REGISTRY_FILE = join(REGISTRY_DIR, "registry.json");
const HUB_PORT = 3456;
const PORT_RANGE_START = 3460;
const PORT_RANGE_END = 3560;

export interface ProjectEntry {
  name: string;
  path: string;
  port: number;
  pid: number;
  startedAt: string;
}

interface Registry {
  projects: ProjectEntry[];
}

function ensureDir() {
  if (!existsSync(REGISTRY_DIR)) {
    mkdirSync(REGISTRY_DIR, { recursive: true });
  }
}

function readRegistry(): Registry {
  ensureDir();
  if (!existsSync(REGISTRY_FILE)) return { projects: [] };
  try {
    return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"));
  } catch {
    return { projects: [] };
  }
}

function writeRegistry(reg: Registry) {
  ensureDir();
  writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
}

/**
 * Deterministic port from project path.
 * Same project always gets the same port.
 */
export function autoPort(projectPath: string): number {
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    hash = ((hash << 5) - hash + projectPath.charCodeAt(i)) | 0;
  }
  const range = PORT_RANGE_END - PORT_RANGE_START;
  const offset = ((hash % range) + range) % range;
  return PORT_RANGE_START + offset;
}

/** Hub always runs on the fixed port. */
export function hubPort(): number {
  return HUB_PORT;
}

/**
 * Resolve the canonical project root for a directory.
 *
 * Two directories are the same project if they share the same canonical root.
 * Detection order:
 * 1. .apex/config.yaml `project_root: /path/to/main` (explicit link for non-git dirs)
 * 2. Git repo root (handles worktrees and subdirectories)
 * 3. Fallback: the directory itself
 */
function getCanonicalProjectRoot(dir: string): string {
  // 1. Explicit config link
  const configPath = join(dir, ".apex", "config.yaml");
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const match = content.match(/^project_root:\s*(.+)$/m);
      if (match) {
        const linked = resolve(dir, match[1].trim());
        if (existsSync(linked)) return linked;
      }
    } catch { /* ignore */ }
  }

  // 2. Git repo root
  try {
    const result = spawnSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: dir, encoding: "utf-8", timeout: 3000,
    });
    if (result.status === 0) {
      return resolve(dir, dirname(result.stdout.trim()));
    }
  } catch { /* ignore */ }

  // 3. Fallback: directory itself
  return dir;
}

/**
 * Register a project dashboard as active.
 * Deduplicates by canonical project root: if another directory with the same
 * root is already registered, replaces it instead of creating a duplicate.
 */
export function register(entry: ProjectEntry) {
  const reg = readRegistry();
  const canonicalRoot = getCanonicalProjectRoot(entry.path);

  // Remove entries that share the same canonical root OR the same path
  reg.projects = reg.projects.filter((p) => {
    if (p.path === entry.path) return false;
    if (getCanonicalProjectRoot(p.path) === canonicalRoot) return false;
    return true;
  });

  reg.projects.push(entry);
  writeRegistry(reg);
}

/**
 * Unregister a project dashboard (on exit).
 */
export function unregister(projectPath: string) {
  const reg = readRegistry();
  reg.projects = reg.projects.filter((p) => p.path !== projectPath);
  writeRegistry(reg);
}

/**
 * List all registered projects.
 * A project is considered active if its .apex/ directory exists
 * (the registering process may have exited — that's normal in Hub mode).
 */
export function listProjects(): ProjectEntry[] {
  const reg = readRegistry();
  return reg.projects.filter((p) => {
    try {
      return existsSync(join(p.path, ".apex"));
    } catch {
      return false;
    }
  });
}

/**
 * Prune entries whose .apex/ directory no longer exists.
 * Call from hub startup to clean up stale entries.
 */
export function pruneRegistry(): number {
  const reg = readRegistry();
  const valid = reg.projects.filter((p) => {
    try {
      return existsSync(join(p.path, ".apex"));
    } catch {
      return false;
    }
  });

  const pruned = reg.projects.length - valid.length;
  if (pruned > 0) {
    writeRegistry({ projects: valid });
  }
  return pruned;
}

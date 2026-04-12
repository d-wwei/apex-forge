/**
 * Project Dashboard Registry
 *
 * Shared registry at ~/.apex-forge/registry.json tracks all active dashboards.
 * Each dashboard registers on start, unregisters on exit.
 * Hub and sidebars read this to discover all active projects.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

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
 * Register a project dashboard as active.
 * Replaces any existing entry for the same path.
 */
export function register(entry: ProjectEntry) {
  const reg = readRegistry();
  // Remove stale entry for same path
  reg.projects = reg.projects.filter((p) => p.path !== entry.path);
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

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export interface WorkspaceInfo {
  taskId: string;
  path: string;
  isWorktree: boolean;
}

export interface ArtifactRef {
  taskId: string;
  resultPath: string;
}

/**
 * Check if a directory is inside a git repository.
 */
function isGitRepo(dir: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: dir,
    encoding: "utf-8",
    timeout: 5000,
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

/**
 * Create a per-task workspace directory with standard subdirectories.
 * Uses git worktree when inside a git repo; falls back to plain directories.
 */
export async function createWorkspace(
  taskId: string,
  root: string = ".workspaces",
): Promise<WorkspaceInfo> {
  const wsPath = join(root, `APEX-${taskId}`);
  const branchName = `apex/${taskId}`;

  // Try git worktree if we're in a git repo
  if (isGitRepo(process.cwd())) {
    mkdirSync(root, { recursive: true });
    const result = spawnSync(
      "git",
      ["worktree", "add", wsPath, "-b", branchName],
      {
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    if (result.status === 0) {
      // Worktree created — add standard subdirectories
      mkdirSync(join(wsPath, "output"), { recursive: true });
      mkdirSync(join(wsPath, "input"), { recursive: true });
      return { taskId, path: wsPath, isWorktree: true };
    }
    // Fall through to plain directory on failure
    console.warn(
      `[workspace] git worktree add failed for ${taskId}, falling back to plain directory: ${(result.stderr || "").trim()}`,
    );
  }

  // Fallback: plain directory
  mkdirSync(join(wsPath, "output"), { recursive: true });
  mkdirSync(join(wsPath, "input"), { recursive: true });
  return { taskId, path: wsPath, isWorktree: false };
}

/**
 * Copy upstream task results into a downstream task's input directory.
 */
export async function injectArtifacts(
  workspacePath: string,
  artifacts: ArtifactRef[],
): Promise<void> {
  const inputDir = join(workspacePath, "input");
  mkdirSync(inputDir, { recursive: true });

  for (const artifact of artifacts) {
    if (existsSync(artifact.resultPath)) {
      const destName = `${artifact.taskId}-result.json`;
      copyFileSync(artifact.resultPath, join(inputDir, destName));
    }
  }
}

/**
 * Remove a workspace directory. Uses git worktree remove if applicable.
 */
export async function cleanupWorkspace(workspacePath: string): Promise<void> {
  if (!existsSync(workspacePath)) return;

  // Try git worktree remove only if this is actually a worktree
  // (worktrees have a .git file, not a .git directory)
  const dotGitPath = join(workspacePath, ".git");
  const isWorktree =
    existsSync(dotGitPath) && !statSync(dotGitPath).isDirectory();
  if (isWorktree) {
    const result = spawnSync(
      "git",
      ["worktree", "remove", workspacePath, "--force"],
      {
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    if (result.status === 0) {
      // Also delete the branch (extract taskId from path: .../APEX-{taskId})
      const match = workspacePath.match(/APEX-(.+)$/);
      if (match) {
        spawnSync("git", ["branch", "-D", `apex/${match[1]}`], {
          encoding: "utf-8",
          timeout: 5000,
        });
      }
      return;
    }
    // Fall through to rmSync if worktree remove fails
  }

  rmSync(workspacePath, { recursive: true, force: true });
}

/**
 * Write a .claude/settings.json into the workspace granting agent permissions.
 * This avoids needing --dangerously-skip-permissions.
 */
export function writePermissionConfig(workspacePath: string): void {
  const claudeDir = join(workspacePath, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const settings = {
    permissions: {
      allow: ["Read", "Write", "Edit", "Bash(*)", "Glob", "Grep", "Agent"],
    },
  };

  writeFileSync(
    join(claudeDir, "settings.json"),
    JSON.stringify(settings, null, 2),
  );
}

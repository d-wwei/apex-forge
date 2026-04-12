import { mkdirSync, rmSync, existsSync, copyFileSync } from "fs";
import { join } from "path";

export interface WorkspaceInfo {
  taskId: string;
  path: string;
}

export interface ArtifactRef {
  taskId: string;
  resultPath: string;
}

/**
 * Create a per-task workspace directory with standard subdirectories.
 */
export async function createWorkspace(taskId: string, root: string = ".workspaces"): Promise<WorkspaceInfo> {
  const wsPath = join(root, `APEX-${taskId}`);
  mkdirSync(join(wsPath, "output"), { recursive: true });
  mkdirSync(join(wsPath, "input"), { recursive: true });

  return { taskId, path: wsPath };
}

/**
 * Copy upstream task results into a downstream task's input directory.
 */
export async function injectArtifacts(workspacePath: string, artifacts: ArtifactRef[]): Promise<void> {
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
 * Remove a workspace directory.
 */
export async function cleanupWorkspace(workspacePath: string): Promise<void> {
  if (existsSync(workspacePath)) {
    rmSync(workspacePath, { recursive: true, force: true });
  }
}

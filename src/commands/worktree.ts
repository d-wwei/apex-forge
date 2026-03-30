import { spawnSync } from "child_process";

export async function cmdWorktree(args: string[]): Promise<void> {
  const verb = args[0];

  switch (verb) {
    case "create": {
      const taskId = args[1];
      if (!taskId) {
        console.error("Usage: apex worktree create TASK_ID");
        process.exit(1);
      }

      // Verify we are in a git repo
      const gitCheck = spawnSync("git", [
        "rev-parse",
        "--is-inside-work-tree",
      ]);
      if (gitCheck.status !== 0) {
        console.error("Not in a git repository");
        process.exit(1);
      }

      const branch = `apex/${taskId}`;
      const dir = `.apex/worktrees/${taskId}`;

      const result = spawnSync("git", [
        "worktree",
        "add",
        dir,
        "-b",
        branch,
      ]);
      if (result.status !== 0) {
        const stderr = result.stderr?.toString().trim();
        console.error(
          `Failed to create worktree: ${stderr || "unknown error"}`,
        );
        process.exit(1);
      }
      console.log(`Created worktree: ${dir} (branch: ${branch})`);
      break;
    }

    case "list": {
      const result = spawnSync("git", ["worktree", "list"]);
      if (result.status !== 0) {
        console.error("Failed to list worktrees (not in a git repo?)");
        process.exit(1);
      }
      const output = result.stdout?.toString().trim();
      if (output) {
        console.log(output);
      } else {
        console.log("No worktrees");
      }
      break;
    }

    case "cleanup": {
      const taskId = args[1];
      if (!taskId) {
        console.error("Usage: apex worktree cleanup TASK_ID");
        process.exit(1);
      }
      const dir = `.apex/worktrees/${taskId}`;
      const result = spawnSync("git", [
        "worktree",
        "remove",
        dir,
        "--force",
      ]);
      if (result.status !== 0) {
        const stderr = result.stderr?.toString().trim();
        console.error(
          `Failed to remove worktree: ${stderr || "unknown error"}`,
        );
        process.exit(1);
      }
      console.log(`Removed worktree: ${dir}`);
      break;
    }

    default:
      console.error(
        `Unknown worktree command: ${verb || "(none)"}`,
      );
      console.error("Usage: apex worktree [create|list|cleanup]");
      process.exit(1);
  }
}

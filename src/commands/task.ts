import {
  taskCreate,
  taskAssign,
  taskStart,
  taskSubmit,
  taskVerify,
  taskBlock,
  taskRelease,
  taskList,
  taskNext,
  taskGet,
} from "../state/tasks.js";
import type { TaskStatus } from "../types/task.js";

export async function cmdTask(args: string[]): Promise<void> {
  const verb = args[0];

  switch (verb) {
    case "create": {
      const title = args[1];
      if (!title) {
        console.error("Usage: apex task create TITLE [DESC] [DEPS...]");
        process.exit(1);
      }
      const desc = args[2] || "";
      const deps = args.slice(3);
      const task = await taskCreate(title, desc, deps);
      console.log(`Created ${task.id}: ${task.title}`);
      break;
    }

    case "assign": {
      if (!args[1]) {
        console.error("Usage: apex task assign TASK_ID");
        process.exit(1);
      }
      const task = await taskAssign(args[1]);
      console.log(`Assigned ${task.id}: ${task.status}`);
      break;
    }

    case "start": {
      if (!args[1]) {
        console.error("Usage: apex task start TASK_ID");
        process.exit(1);
      }
      const task = await taskStart(args[1]);
      console.log(`Started ${task.id}: ${task.status}`);
      break;
    }

    case "submit": {
      if (!args[1]) {
        console.error("Usage: apex task submit TASK_ID EVIDENCE");
        process.exit(1);
      }
      const evidence = args.slice(2).join(" ");
      const task = await taskSubmit(args[1], evidence);
      console.log(`Submitted ${task.id} for verification`);
      break;
    }

    case "verify": {
      if (!args[1]) {
        console.error("Usage: apex task verify TASK_ID [pass|fail]");
        process.exit(1);
      }
      const pass = args[2] !== "fail";
      const task = await taskVerify(args[1], pass);
      console.log(
        `${task.id}: ${pass ? "verified -> done" : "failed -> in_progress"}`,
      );
      break;
    }

    case "block": {
      if (!args[1]) {
        console.error("Usage: apex task block TASK_ID REASON");
        process.exit(1);
      }
      const reason = args.slice(2).join(" ");
      const task = await taskBlock(args[1], reason);
      console.log(`Blocked ${task.id}: ${task.block_reason}`);
      break;
    }

    case "release": {
      if (!args[1]) {
        console.error("Usage: apex task release TASK_ID");
        process.exit(1);
      }
      const task = await taskRelease(args[1]);
      console.log(`Released ${task.id}: back to open`);
      break;
    }

    case "list": {
      const statusIdx = args.indexOf("--status");
      const statusFilter =
        statusIdx !== -1
          ? (args[statusIdx + 1] as TaskStatus | undefined)
          : undefined;
      const tasks = await taskList(
        statusFilter ? { status: statusFilter } : undefined,
      );
      if (tasks.length === 0) {
        console.log("No tasks");
        return;
      }
      for (const t of tasks) {
        const deps =
          t.depends_on.length > 0
            ? ` (depends: ${t.depends_on.join(",")})`
            : "";
        console.log(
          `  ${t.id.padEnd(5)} ${t.status.padEnd(14)} ${t.title}${deps}`,
        );
      }
      break;
    }

    case "next": {
      const task = await taskNext();
      if (task) {
        console.log(`Next: ${task.id} — ${task.title}`);
      } else {
        console.log("No available tasks");
      }
      break;
    }

    case "get": {
      if (!args[1]) {
        console.error("Usage: apex task get TASK_ID");
        process.exit(1);
      }
      const task = await taskGet(args[1]);
      console.log(JSON.stringify(task, null, 2));
      break;
    }

    default:
      console.error(`Unknown task command: ${verb || "(none)"}`);
      console.error(
        "Usage: apex task [create|assign|start|submit|verify|block|release|list|next|get]",
      );
      process.exit(1);
  }
}

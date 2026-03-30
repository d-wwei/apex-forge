import { describe, test, expect, beforeEach } from "bun:test";
import {
  taskCreate,
  taskAssign,
  taskStart,
  taskSubmit,
  taskVerify,
  taskBlock,
  taskRelease,
  taskNext,
  taskList,
} from "../state/tasks.js";
import { writeJSON } from "../utils/json.js";
import { mkdirSync, rmSync } from "fs";

beforeEach(async () => {
  rmSync(".apex", { recursive: true, force: true });
  mkdirSync(".apex", { recursive: true });
  await writeJSON(".apex/tasks.json", { tasks: [], next_id: 1 });
});

describe("Task State Machine", () => {
  test("create task", async () => {
    const task = await taskCreate("Test", "Description");
    expect(task.id).toBe("T1");
    expect(task.status).toBe("open");
  });

  test("valid transition: open -> assigned -> in_progress -> to_verify -> done", async () => {
    await taskCreate("Test", "Desc");
    await taskAssign("T1");
    await taskStart("T1");
    const submitted = await taskSubmit("T1", "Tests pass");
    expect(submitted.status).toBe("to_verify");
    const done = await taskVerify("T1", true);
    expect(done.status).toBe("done");
    expect(done.completed_at).toBeTruthy();
  });

  test("invalid transition: open -> in_progress throws", async () => {
    await taskCreate("Test", "Desc");
    expect(async () => await taskStart("T1")).toThrow("Invalid transition");
  });

  test("block from any active state", async () => {
    await taskCreate("Test", "Desc");
    const blocked = await taskBlock("T1", "Waiting for API key");
    expect(blocked.status).toBe("blocked");
    expect(blocked.block_reason).toBe("Waiting for API key");
  });

  test("cannot block a done task", async () => {
    await taskCreate("Test", "Desc");
    await taskAssign("T1");
    await taskStart("T1");
    await taskSubmit("T1", "evidence");
    await taskVerify("T1", true);
    expect(async () => await taskBlock("T1", "reason")).toThrow();
  });

  test("release: assigned -> open", async () => {
    await taskCreate("Test", "Desc");
    await taskAssign("T1");
    const released = await taskRelease("T1");
    expect(released.status).toBe("open");
  });

  test("verify fail: to_verify -> in_progress", async () => {
    await taskCreate("Test", "Desc");
    await taskAssign("T1");
    await taskStart("T1");
    await taskSubmit("T1", "evidence");
    const failed = await taskVerify("T1", false);
    expect(failed.status).toBe("in_progress");
  });

  test("taskNext respects dependencies", async () => {
    await taskCreate("A", "First");
    await taskCreate("B", "Second", ["T1"]);
    const next = await taskNext();
    expect(next?.id).toBe("T1"); // T2 is blocked by T1
  });

  test("taskNext returns null when all done", async () => {
    await taskCreate("A", "First");
    await taskAssign("T1");
    await taskStart("T1");
    await taskSubmit("T1", "done");
    await taskVerify("T1", true);
    const next = await taskNext();
    expect(next).toBeNull();
  });

  test("create multiple tasks with auto-increment IDs", async () => {
    const t1 = await taskCreate("First", "Desc1");
    const t2 = await taskCreate("Second", "Desc2");
    const t3 = await taskCreate("Third", "Desc3");
    expect(t1.id).toBe("T1");
    expect(t2.id).toBe("T2");
    expect(t3.id).toBe("T3");
  });

  test("taskList returns all tasks", async () => {
    await taskCreate("A", "Desc");
    await taskCreate("B", "Desc");
    const all = await taskList();
    expect(all.length).toBe(2);
  });

  test("taskList filters by status", async () => {
    await taskCreate("A", "Desc");
    await taskCreate("B", "Desc");
    await taskAssign("T1");
    const assigned = await taskList({ status: "assigned" });
    expect(assigned.length).toBe(1);
    expect(assigned[0].id).toBe("T1");
  });

  test("block from assigned state", async () => {
    await taskCreate("Test", "Desc");
    await taskAssign("T1");
    const blocked = await taskBlock("T1", "Blocked reason");
    expect(blocked.status).toBe("blocked");
  });

  test("block from in_progress state", async () => {
    await taskCreate("Test", "Desc");
    await taskAssign("T1");
    await taskStart("T1");
    const blocked = await taskBlock("T1", "Blocked reason");
    expect(blocked.status).toBe("blocked");
  });

  test("block from to_verify state", async () => {
    await taskCreate("Test", "Desc");
    await taskAssign("T1");
    await taskStart("T1");
    await taskSubmit("T1", "evidence");
    const blocked = await taskBlock("T1", "Blocked reason");
    expect(blocked.status).toBe("blocked");
  });

  test("invalid: cannot release from open", async () => {
    await taskCreate("Test", "Desc");
    // release is assigned -> open; calling from open is open -> open which is invalid
    expect(async () => await taskRelease("T1")).toThrow("Invalid transition");
  });

  test("submit without evidence throws", async () => {
    await taskCreate("Test", "Desc");
    await taskAssign("T1");
    await taskStart("T1");
    expect(async () => await taskSubmit("T1", "")).toThrow();
  });

  test("taskNext skips tasks with unmet deps", async () => {
    await taskCreate("Dep", "Dependency");
    await taskCreate("Child", "Depends on T1", ["T1"]);
    await taskCreate("Free", "No deps");
    const next = await taskNext();
    // T1 and T3 are both open with met deps; T1 comes first
    expect(next?.id).toBe("T1");
  });
});

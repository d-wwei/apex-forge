import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("orch lock management", () => {
  let tmpDir: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `apex-orch-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tmpDir, ".apex"), { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmpDir);

    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(origCwd);
    logSpy.mockRestore();
    errorSpy.mockRestore();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test("updateLock updates plan_agent_handle in existing lock", async () => {
    // Create a lock file first
    const lockPath = join(tmpDir, ".apex", "orch.lock");
    writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      session_id: "old-session",
      plan_agent_handle: null,
      started_at: new Date().toISOString(),
    }, null, 2));

    const { updateLock } = await import("../orch.js");
    const newHandle = { id: "@99", name: "plan-agent", adapter: "cmux" };
    updateLock({ plan_agent_handle: newHandle, session_id: "new-session" });

    const updated = JSON.parse(readFileSync(lockPath, "utf-8"));
    expect(updated.plan_agent_handle).toEqual(newHandle);
    expect(updated.session_id).toBe("new-session");
    // pid and started_at should be preserved
    expect(updated.pid).toBe(process.pid);
    expect(updated.started_at).toBeDefined();
  });

  test("updateLock is no-op when lock does not exist", async () => {
    const { updateLock } = await import("../orch.js");
    // Should not throw
    updateLock({ session_id: "new" });
    expect(existsSync(join(tmpDir, ".apex", "orch.lock"))).toBe(false);
  });

  test("--force with --handle parses handle into lock", async () => {
    // Create a stale lock (dead PID)
    const lockPath = join(tmpDir, ".apex", "orch.lock");
    writeFileSync(lockPath, JSON.stringify({
      pid: 999999, // very likely dead
      session_id: "stale",
      plan_agent_handle: null,
      started_at: new Date().toISOString(),
    }, null, 2));

    const { parseHandleFlag } = await import("../orch.js");
    const handle = parseHandleFlag(["--handle", '{"id":"@42","name":"plan-agent","adapter":"cmux"}']);
    expect(handle).toEqual({ id: "@42", name: "plan-agent", adapter: "cmux" });
  });

  test("parseHandleFlag returns null when no --handle", async () => {
    const { parseHandleFlag } = await import("../orch.js");
    expect(parseHandleFlag(["--force"])).toBeNull();
  });
});

describe("acquireLock", () => {
  let tmpDir: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `apex-acquire-lock-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tmpDir, ".apex"), { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmpDir);
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(origCwd);
    logSpy.mockRestore();
    // Clean up lock
    const { releaseLock } = require("../orch.js");
    try { releaseLock(); } catch {}
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test("first acquire succeeds", async () => {
    const { acquireLock, releaseLock } = await import("../orch.js");
    const result = acquireLock("test-session-1", null);
    expect(result).toBe(true);
    expect(existsSync(join(tmpDir, ".apex", "orch.lock"))).toBe(true);

    const lock = JSON.parse(readFileSync(join(tmpDir, ".apex", "orch.lock"), "utf-8"));
    expect(lock.session_id).toBe("test-session-1");
    expect(lock.pid).toBe(process.pid);
    releaseLock();
  });

  test("second acquire with live PID fails", async () => {
    const { acquireLock, releaseLock } = await import("../orch.js");
    // First acquire succeeds (our own PID is alive)
    acquireLock("session-a", null);

    // Second acquire should fail (PID is still alive — it's us)
    const result = acquireLock("session-b", null);
    expect(result).toBe(false);
    releaseLock();
  });

  test("acquire with dead PID succeeds (stale lock recovery)", async () => {
    const { acquireLock, releaseLock } = await import("../orch.js");
    // Write a lock with a dead PID
    writeFileSync(join(tmpDir, ".apex", "orch.lock"), JSON.stringify({
      pid: 999999, // very likely dead
      session_id: "dead-session",
      plan_agent_handle: null,
      started_at: new Date().toISOString(),
    }, null, 2));

    const result = acquireLock("new-session", null);
    expect(result).toBe(true);

    const lock = JSON.parse(readFileSync(join(tmpDir, ".apex", "orch.lock"), "utf-8"));
    expect(lock.session_id).toBe("new-session");
    releaseLock();
  });

  test("acquire with corrupt lock file recovers", async () => {
    const { acquireLock, releaseLock } = await import("../orch.js");
    // Write corrupt JSON
    writeFileSync(join(tmpDir, ".apex", "orch.lock"), "not-json{{{");

    const result = acquireLock("recovery-session", null);
    expect(result).toBe(true);

    const lock = JSON.parse(readFileSync(join(tmpDir, ".apex", "orch.lock"), "utf-8"));
    expect(lock.session_id).toBe("recovery-session");
    releaseLock();
  });

  test("acquireLock stores plan_agent_handle", async () => {
    const { acquireLock, releaseLock } = await import("../orch.js");
    const handle = { id: "@42", name: "plan-agent" };
    acquireLock("handle-session", handle as any);

    const lock = JSON.parse(readFileSync(join(tmpDir, ".apex", "orch.lock"), "utf-8"));
    expect(lock.plan_agent_handle).toEqual(handle);
    releaseLock();
  });
});

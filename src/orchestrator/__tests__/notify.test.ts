import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { appendNotification, readPendingNotifications } from "../notify.js";

describe("notification queue", () => {
  let origCwd: string;
  let tmpDir: string;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpDir = join(tmpdir(), `apex-notify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test("appendNotification creates file in .apex/notifications/", () => {
    appendNotification("Worker T1 completed");
    const dir = join(tmpDir, ".apex", "notifications");
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    expect(files[0]).toEndWith(".json");
  });

  test("readPendingNotifications returns empty when no notifications", () => {
    const result = readPendingNotifications();
    expect(result).toEqual([]);
  });

  test("readPendingNotifications returns notifications in order", () => {
    appendNotification("first");
    appendNotification("second");
    appendNotification("third");

    const result = readPendingNotifications();
    expect(result.length).toBe(3);
    expect(result[0].message).toBe("first");
    expect(result[1].message).toBe("second");
    expect(result[2].message).toBe("third");
  });

  test("readPendingNotifications marks files as processed", () => {
    appendNotification("test message");

    const before = readdirSync(join(tmpDir, ".apex", "notifications"));
    expect(before.some(f => f.endsWith(".json"))).toBe(true);

    readPendingNotifications();

    const after = readdirSync(join(tmpDir, ".apex", "notifications"));
    expect(after.every(f => f.includes(".processed."))).toBe(true);
  });

  test("readPendingNotifications does not return already-processed files", () => {
    appendNotification("once only");
    readPendingNotifications(); // Marks as processed
    const second = readPendingNotifications(); // Should find nothing new
    expect(second).toEqual([]);
  });
});

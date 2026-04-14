import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { WindowHandle, TerminalAdapter } from "../terminal.js";
import { CmuxAdapter, TmuxAdapter, detectAdapter } from "../terminal.js";

// --- WindowHandle structure ---

describe("WindowHandle", () => {
  test("has required fields: id, name, adapter", () => {
    const handle: WindowHandle = {
      id: "surface-abc",
      name: "T1-auth-api",
      adapter: "cmux",
    };

    expect(handle.id).toBe("surface-abc");
    expect(handle.name).toBe("T1-auth-api");
    expect(handle.adapter).toBe("cmux");
  });

  test("adapter field is 'cmux' or 'tmux'", () => {
    const cmuxHandle: WindowHandle = { id: "s1", name: "w1", adapter: "cmux" };
    const tmuxHandle: WindowHandle = { id: "t1", name: "w2", adapter: "tmux" };

    expect(["cmux", "tmux"]).toContain(cmuxHandle.adapter);
    expect(["cmux", "tmux"]).toContain(tmuxHandle.adapter);
  });
});

// --- CmuxAdapter ---

describe("CmuxAdapter", () => {
  test("name() returns 'cmux'", () => {
    const adapter = new CmuxAdapter();
    expect(adapter.name()).toBe("cmux");
  });

  test("available() returns boolean without throwing", () => {
    const adapter = new CmuxAdapter();
    const result = adapter.available();
    expect(typeof result).toBe("boolean");
  });

  test("implements TerminalAdapter interface", () => {
    const adapter: TerminalAdapter = new CmuxAdapter();
    expect(typeof adapter.name).toBe("function");
    expect(typeof adapter.available).toBe("function");
    expect(typeof adapter.createWindow).toBe("function");
    expect(typeof adapter.send).toBe("function");
    expect(typeof adapter.readScreen).toBe("function");
    expect(typeof adapter.close).toBe("function");
    expect(typeof adapter.isAlive).toBe("function");
    expect(typeof adapter.rename).toBe("function");
  });
});

// --- TmuxAdapter ---

describe("TmuxAdapter", () => {
  test("name() returns 'tmux'", () => {
    const adapter = new TmuxAdapter();
    expect(adapter.name()).toBe("tmux");
  });

  test("available() returns boolean without throwing", () => {
    const adapter = new TmuxAdapter();
    const result = adapter.available();
    expect(typeof result).toBe("boolean");
  });

  test("implements TerminalAdapter interface", () => {
    const adapter: TerminalAdapter = new TmuxAdapter();
    expect(typeof adapter.name).toBe("function");
    expect(typeof adapter.available).toBe("function");
    expect(typeof adapter.createWindow).toBe("function");
    expect(typeof adapter.send).toBe("function");
    expect(typeof adapter.readScreen).toBe("function");
    expect(typeof adapter.close).toBe("function");
    expect(typeof adapter.isAlive).toBe("function");
    expect(typeof adapter.rename).toBe("function");
  });
});

// --- detectAdapter ---

describe("detectAdapter", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    // Restore environment
    process.env = { ...origEnv };
  });

  test("returns CmuxAdapter when CMUX_SURFACE is set", () => {
    process.env.CMUX_SURFACE = "some-surface-id";
    const adapter = detectAdapter();
    expect(adapter.name()).toBe("cmux");
  });

  test("returns adapter that is a TerminalAdapter", () => {
    // In CI or on a dev machine, at least tmux or cmux should be available.
    // If neither is available, detectAdapter throws -- that's tested separately.
    try {
      const adapter = detectAdapter();
      expect(typeof adapter.name).toBe("function");
      expect(typeof adapter.createWindow).toBe("function");
      expect(typeof adapter.send).toBe("function");
      expect(typeof adapter.readScreen).toBe("function");
      expect(typeof adapter.close).toBe("function");
      expect(typeof adapter.isAlive).toBe("function");
      expect(typeof adapter.rename).toBe("function");
    } catch (e: any) {
      // If no terminal multiplexer is available, that's expected
      expect(e.message).toContain("requires tmux or cmux");
    }
  });

  test("throws when no multiplexer is available", () => {
    // Clear env vars that would trigger cmux
    delete process.env.CMUX_SURFACE;
    delete process.env.TMUX;
    // Override PATH to empty so neither cmux nor tmux is found
    process.env.PATH = "/nonexistent";

    expect(() => detectAdapter()).toThrow("requires tmux or cmux");
  });
});

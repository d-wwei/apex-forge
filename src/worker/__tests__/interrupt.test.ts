import { describe, test, expect } from "bun:test";
import { interruptKeys } from "../interrupt.js";

describe("interruptKeys", () => {
  test("claude returns Escape (tmux default)", () => {
    expect(interruptKeys("claude")).toEqual(["Escape"]);
  });

  test("codex returns C-c (tmux default)", () => {
    expect(interruptKeys("codex")).toEqual(["C-c"]);
  });

  test("gemini returns C-c (tmux default)", () => {
    expect(interruptKeys("gemini")).toEqual(["C-c"]);
  });

  test("unknown agent returns both Escape and C-c (tmux)", () => {
    expect(interruptKeys("some-agent")).toEqual(["Escape", "C-c"]);
  });

  test("claude returns escape for cmux adapter", () => {
    expect(interruptKeys("claude", "cmux")).toEqual(["escape"]);
  });

  test("codex returns ctrl-c for cmux adapter", () => {
    expect(interruptKeys("codex", "cmux")).toEqual(["ctrl-c"]);
  });

  test("unknown agent returns both for cmux adapter", () => {
    expect(interruptKeys("some-agent", "cmux")).toEqual(["escape", "ctrl-c"]);
  });
});

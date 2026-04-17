import { describe, expect, test } from "bun:test";

// Test the porcelain parsing logic by extracting the internal parser
// We test via the public API since finalizeWorktree is not exported

import {
  discoverWorktrees,
  getRepoRoot,
  groupProjectsByRepo,
} from "../worktree-discovery.js";

describe("worktree-discovery", () => {
  describe("getRepoRoot", () => {
    test("returns repo root for current directory", () => {
      const root = getRepoRoot(".");
      expect(root).not.toBeNull();
      expect(root?.length).toBeGreaterThan(0);
    });

    test("returns null for non-git directory", () => {
      const root = getRepoRoot("/tmp");
      expect(root).toBeNull();
    });

    test("same result on repeated calls (cache test)", () => {
      const root1 = getRepoRoot(".");
      const root2 = getRepoRoot(".");
      expect(root1).toBe(root2);
    });
  });

  describe("discoverWorktrees", () => {
    test("finds at least one worktree for current repo", () => {
      const wts = discoverWorktrees(".");
      expect(wts.length).toBeGreaterThanOrEqual(1);
    });

    test("first worktree is marked as main", () => {
      const wts = discoverWorktrees(".");
      expect(wts[0].isMain).toBe(true);
    });

    test("each worktree has required fields", () => {
      const wts = discoverWorktrees(".");
      for (const wt of wts) {
        expect(typeof wt.path).toBe("string");
        expect(wt.path.length).toBeGreaterThan(0);
        expect(typeof wt.branch).toBe("string");
        expect(typeof wt.label).toBe("string");
        expect(wt.label.length).toBeGreaterThan(0);
        expect(typeof wt.isMain).toBe("boolean");
        expect(typeof wt.hasApex).toBe("boolean");
      }
    });

    test("returns empty array for non-git directory", () => {
      const wts = discoverWorktrees("/tmp");
      expect(wts).toEqual([]);
    });

    test("returns same results on repeated calls (cache test)", () => {
      const wts1 = discoverWorktrees(".");
      const wts2 = discoverWorktrees(".");
      expect(wts1.length).toBe(wts2.length);
      expect(wts1[0].path).toBe(wts2[0].path);
    });

    test("label does not contain refs/heads/ prefix", () => {
      const wts = discoverWorktrees(".");
      for (const wt of wts) {
        expect(wt.label).not.toContain("refs/heads/");
      }
    });
  });

  describe("groupProjectsByRepo", () => {
    test("returns empty array for single project", () => {
      const groups = groupProjectsByRepo([
        { name: "test", path: ".", port: 3460, pid: 1, startedAt: "" },
      ]);
      expect(groups).toEqual([]);
    });

    test("returns empty array for non-git projects", () => {
      const groups = groupProjectsByRepo([
        {
          name: "a",
          path: "/tmp/nonexistent-a",
          port: 3460,
          pid: 1,
          startedAt: "",
        },
        {
          name: "b",
          path: "/tmp/nonexistent-b",
          port: 3461,
          pid: 2,
          startedAt: "",
        },
      ]);
      expect(groups).toEqual([]);
    });

    test("returns empty array for empty input", () => {
      const groups = groupProjectsByRepo([]);
      expect(groups).toEqual([]);
    });
  });
});

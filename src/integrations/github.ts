/**
 * Apex Forge — GitHub Issue Tracker Integration
 *
 * Connects to GitHub Issues via `gh` CLI for Symphony-style issue-driven orchestration.
 * Supports listing, importing, syncing, and commenting on issues.
 */

import { spawnSync } from "child_process";
import { taskCreate } from "../state/tasks.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  assignee: string | null;
  url: string;
}

export interface IssueFilter {
  label?: string;
  state?: "open" | "closed" | "all";
  limit?: number;
}

export interface SyncResult {
  imported: string[];
  skipped: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// gh CLI helpers
// ---------------------------------------------------------------------------

/**
 * Check if the GitHub CLI is installed and authenticated.
 */
export function checkGhCli(): boolean {
  const result = spawnSync("gh", ["--version"], { encoding: "utf-8" });
  return result.status === 0;
}

/**
 * Check if we're inside a GitHub repository.
 */
export function checkGhRepo(): boolean {
  const result = spawnSync("gh", ["repo", "view", "--json", "name"], {
    encoding: "utf-8",
  });
  return result.status === 0;
}

// ---------------------------------------------------------------------------
// Issue operations
// ---------------------------------------------------------------------------

/**
 * List issues from the current repository with optional filters.
 */
export function listIssues(filter?: IssueFilter): Issue[] {
  if (!checkGhCli()) {
    console.error("gh CLI not found. Install: https://cli.github.com/");
    return [];
  }

  const fields = "number,title,body,state,labels,assignees,url";
  const args = ["issue", "list", "--json", fields];

  if (filter?.label) args.push("--label", filter.label);
  if (filter?.state) args.push("--state", filter.state);
  if (filter?.limit) args.push("--limit", String(filter.limit));

  const result = spawnSync("gh", args, { encoding: "utf-8" });
  if (result.status !== 0) {
    if (result.stderr) console.error(`gh error: ${result.stderr.trim()}`);
    return [];
  }

  try {
    const raw = JSON.parse(result.stdout) as any[];
    return raw.map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body || "",
      state: i.state,
      labels: (i.labels || []).map((l: any) => l.name),
      assignee: i.assignees?.[0]?.login || null,
      url: i.url,
    }));
  } catch {
    console.error("Failed to parse gh output");
    return [];
  }
}

/**
 * Get a single issue by number.
 */
export function getIssue(issueNumber: number): Issue | null {
  const args = [
    "issue",
    "view",
    String(issueNumber),
    "--json",
    "number,title,body,state,labels,assignees,url",
  ];
  const result = spawnSync("gh", args, { encoding: "utf-8" });
  if (result.status !== 0) return null;

  try {
    const i = JSON.parse(result.stdout);
    return {
      number: i.number,
      title: i.title,
      body: i.body || "",
      state: i.state,
      labels: (i.labels || []).map((l: any) => l.name),
      assignee: i.assignees?.[0]?.login || null,
      url: i.url,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Task integration
// ---------------------------------------------------------------------------

/**
 * Import GitHub issues as apex tasks.
 * Creates tasks in .apex/tasks.json linked to their issue numbers.
 */
export async function createTasksFromIssues(issues: Issue[]): Promise<SyncResult> {
  const result: SyncResult = { imported: [], skipped: [], errors: [] };

  for (const issue of issues) {
    try {
      const desc = [
        `GitHub Issue #${issue.number}`,
        issue.body ? `\n${issue.body.slice(0, 500)}` : "",
        `\nURL: ${issue.url}`,
        issue.labels.length > 0 ? `\nLabels: ${issue.labels.join(", ")}` : "",
      ].join("");

      const task = await taskCreate(
        `[GH-${issue.number}] ${issue.title}`,
        desc,
      );
      result.imported.push(`${task.id} <- #${issue.number}: ${issue.title}`);
    } catch (err) {
      result.errors.push(`#${issue.number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Post a status comment on a GitHub issue.
 */
export function syncIssueStatus(
  taskId: string,
  issueNumber: number,
  status: string,
): boolean {
  const comment = `**[apex-forge]** Task \`${taskId}\` status: **${status}**`;
  const result = spawnSync(
    "gh",
    ["issue", "comment", String(issueNumber), "--body", comment],
    { encoding: "utf-8" },
  );
  return result.status === 0;
}

/**
 * Close a GitHub issue (when its linked task reaches done).
 */
export function closeIssue(issueNumber: number, reason?: string): boolean {
  const args = ["issue", "close", String(issueNumber)];
  if (reason) args.push("--comment", reason);
  const result = spawnSync("gh", args, { encoding: "utf-8" });
  return result.status === 0;
}

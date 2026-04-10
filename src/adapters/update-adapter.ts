import { UpdateKit } from "update-kit";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== "/") {
    if (existsSync(resolve(dir, ".git"))) return dir;
    dir = dirname(dir);
  }
  return startDir;
}

function loadVersion(repoRoot: string): string {
  const pkgPath = resolve(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  }
  const versionPath = resolve(repoRoot, "VERSION");
  if (existsSync(versionPath)) {
    return readFileSync(versionPath, "utf-8").trim();
  }
  return "0.0.0";
}

export function createApexUpdateKit(cwd?: string): UpdateKit {
  const repoRoot = findRepoRoot(cwd || process.cwd());
  const version = loadVersion(repoRoot);

  return new UpdateKit({
    appName: "apex-forge",
    currentVersion: version,
    sources: [{ type: "github", owner: "d-wwei", repo: "apex-forge" }],
    checkInterval: 60 * 60 * 1000, // 1 hour
  });
}

export interface QuickCheckResult {
  status: "up_to_date" | "update_available" | "error";
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  error?: string;
}

export async function quickCheck(cwd?: string): Promise<QuickCheckResult> {
  try {
    const kit = createApexUpdateKit(cwd);
    const updateStatus = await kit.checkUpdate("non-blocking");

    if (updateStatus.kind === "available") {
      return {
        status: "update_available",
        currentVersion: updateStatus.current,
        latestVersion: updateStatus.latest,
        releaseUrl: updateStatus.releaseUrl,
      };
    }

    if (updateStatus.kind === "up-to-date") {
      return {
        status: "up_to_date",
        currentVersion: updateStatus.current,
      };
    }

    // kind === "unknown"
    return {
      status: "up_to_date",
      currentVersion: loadVersion(findRepoRoot(cwd || process.cwd())),
    };
  } catch (err: any) {
    return {
      status: "error",
      currentVersion: loadVersion(findRepoRoot(cwd || process.cwd())),
      error: err.message,
    };
  }
}

export interface ApplyUpdateResult {
  success: boolean;
  fromVersion: string;
  toVersion?: string;
  postAction?: string;
  error?: string;
}

export async function applyUpdate(cwd?: string): Promise<ApplyUpdateResult> {
  const repoRoot = findRepoRoot(cwd || process.cwd());
  const fromVersion = loadVersion(repoRoot);

  try {
    const kit = createApexUpdateKit(cwd);
    const updateStatus = await kit.checkUpdate("blocking");

    if (updateStatus.kind !== "available") {
      return { success: true, fromVersion, toVersion: fromVersion };
    }

    const detection = await kit.detectInstall();
    const plan = kit.planUpdate(updateStatus, detection);

    if (!plan) {
      return { success: true, fromVersion };
    }

    const result = await kit.applyUpdate(plan);

    if (result.kind === "success") {
      return {
        success: true,
        fromVersion: result.fromVersion,
        toVersion: result.toVersion,
        postAction: result.postAction,
      };
    }

    if (result.kind === "up-to-date") {
      return { success: true, fromVersion, toVersion: fromVersion };
    }

    if (result.kind === "failed") {
      return {
        success: false,
        fromVersion,
        error: result.error.message,
      };
    }

    // needs-restart
    return {
      success: true,
      fromVersion,
      toVersion: fromVersion,
      postAction: "suggest-restart",
    };
  } catch (err: any) {
    return {
      success: false,
      fromVersion,
      error: err.message,
    };
  }
}

export async function rollbackUpdate(cwd?: string): Promise<{ success: boolean; error?: string }> {
  const { execSync } = await import("child_process");
  const repoRoot = findRepoRoot(cwd || process.cwd());

  try {
    execSync("git reset --hard HEAD@{1}", { cwd: repoRoot, encoding: "utf-8", stdio: "pipe" });
    execSync("bun install", { cwd: repoRoot, encoding: "utf-8", stdio: "pipe" });
    execSync("bun run build", { cwd: repoRoot, encoding: "utf-8", stdio: "pipe" });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

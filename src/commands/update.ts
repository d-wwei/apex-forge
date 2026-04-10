import { quickCheck, applyUpdate, rollbackUpdate } from "../adapters/update-adapter.js";

export async function cmdUpdate(args: string[]) {
  const sub = args[0];
  const json = args.includes("--json");

  if (sub === "check") {
    const result = await quickCheck();
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.status === "update_available") {
      console.log(`Update available: v${result.currentVersion} → v${result.latestVersion}`);
      if (result.releaseUrl) console.log(`Release: ${result.releaseUrl}`);
      console.log(`\nRun 'apex update apply' to update.`);
    } else if (result.status === "error") {
      console.error(`Check failed: ${result.error}`);
    } else {
      console.log(`Up to date: v${result.currentVersion}`);
    }
  } else if (sub === "apply") {
    console.log("Checking for updates...");
    const result = await applyUpdate();
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.success && result.toVersion && result.toVersion !== result.fromVersion) {
      console.log(`Updated: v${result.fromVersion} → v${result.toVersion}`);
      if (result.postAction === "suggest-restart") {
        console.log("Restart your terminal to use the new version.");
      }
    } else if (result.success) {
      console.log(`Already up to date: v${result.fromVersion}`);
    } else {
      console.error(`Update failed: ${result.error}`);
      console.log("Run 'apex update rollback' to revert.");
      process.exit(1);
    }
  } else if (sub === "rollback") {
    console.log("Rolling back to previous version...");
    const result = await rollbackUpdate();
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.success) {
      console.log("Rollback successful. Restart your terminal.");
    } else {
      console.error(`Rollback failed: ${result.error}`);
      process.exit(1);
    }
  } else {
    console.log(`
apex update — self-update management (powered by UpdateKit)

Usage:
  apex update check [--json]       Check for available updates
  apex update apply [--json]       Apply available update
  apex update rollback [--json]    Rollback to previous version
`);
  }
}

/**
 * Apex Forge — Daemon Management (launchd on macOS)
 *
 * Install/uninstall/status for persistent dashboard processes.
 * Uses launchd LaunchAgents on macOS, prints nohup hint on Linux.
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { autoPort, hubPort } from "../registry.js";

const LAUNCH_AGENTS_DIR = join(process.env.HOME || "/tmp", "Library", "LaunchAgents");
const LOGS_DIR = join(process.env.HOME || "/tmp", ".apex-forge", "logs");
const LABEL_PREFIX = "com.apexforge.dashboard";

function plistLabel(projectPath: string): string {
  // Deterministic label from project path (same hash as autoPort)
  let hash = 0;
  for (let i = 0; i < projectPath.length; i++) {
    hash = ((hash << 5) - hash + projectPath.charCodeAt(i)) | 0;
  }
  const hex = ((hash >>> 0) % 0xffff).toString(16).padStart(4, "0");
  return `${LABEL_PREFIX}-${hex}`;
}

function plistPath(label: string): string {
  return join(LAUNCH_AGENTS_DIR, `${label}.plist`);
}

function findBinary(): string {
  // 1. dist/apex-forge relative to project
  const distBin = join(process.cwd(), "dist", "apex-forge");
  if (existsSync(distBin)) return distBin;

  // 2. ~/.apex-forge/bin/apex-forge
  const homeBin = join(process.env.HOME || "/tmp", ".apex-forge", "bin", "apex-forge");
  if (existsSync(homeBin)) return homeBin;

  // 3. which apex-forge
  try {
    return execSync("which apex-forge", { encoding: "utf-8" }).trim();
  } catch { /* not found */ }

  throw new Error("Cannot find apex-forge binary. Build with: bun run build");
}

function generatePlist(
  label: string,
  binaryPath: string,
  projectPath: string,
  isHub: boolean,
): string {
  const args = isHub
    ? `    <array>
      <string>${binaryPath}</string>
      <string>dashboard</string>
      <string>hub</string>
      <string>--daemon</string>
    </array>`
    : `    <array>
      <string>${binaryPath}</string>
      <string>dashboard</string>
      <string>--daemon</string>
      <string>--project</string>
      <string>${projectPath}</string>
    </array>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
${args}
    <key>WorkingDirectory</key>
    <string>${projectPath}</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${join(LOGS_DIR, `${label}.stdout.log`)}</string>
    <key>StandardErrorPath</key>
    <string>${join(LOGS_DIR, `${label}.stderr.log`)}</string>
</dict>
</plist>`;
}

async function install(args: string[]) {
  if (process.platform !== "darwin") {
    console.log("Daemon install is macOS-only (launchd).");
    console.log("On Linux, use: nohup apex-forge dashboard --daemon > /dev/null 2>&1 &");
    return;
  }

  const isHub = args.includes("--hub");
  const projectIdx = args.indexOf("--project");
  const projectPath = projectIdx >= 0 ? args[projectIdx + 1] : process.cwd();

  const binaryPath = findBinary();
  const label = isHub ? `${LABEL_PREFIX}-hub` : plistLabel(projectPath);
  const plist = plistPath(label);

  // Ensure directories
  mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  mkdirSync(LOGS_DIR, { recursive: true });

  // Unload existing if present
  if (existsSync(plist)) {
    try { execSync(`launchctl unload "${plist}" 2>/dev/null`); } catch { /* ok */ }
  }

  // Write plist
  const content = generatePlist(label, binaryPath, projectPath, isHub);
  writeFileSync(plist, content);

  // Load
  execSync(`launchctl load "${plist}"`);

  const port = isHub ? hubPort() : autoPort(projectPath);
  console.log(`Daemon installed and started.`);
  console.log(`  Label:   ${label}`);
  console.log(`  Plist:   ${plist}`);
  console.log(`  Port:    ${port}`);
  console.log(`  Logs:    ${LOGS_DIR}/`);
  console.log(`  URL:     http://localhost:${port}`);
}

async function uninstall(args: string[]) {
  if (process.platform !== "darwin") {
    console.log("Daemon uninstall is macOS-only.");
    return;
  }

  const isHub = args.includes("--hub");
  const projectIdx = args.indexOf("--project");
  const projectPath = projectIdx >= 0 ? args[projectIdx + 1] : process.cwd();

  const label = isHub ? `${LABEL_PREFIX}-hub` : plistLabel(projectPath);
  const plist = plistPath(label);

  if (!existsSync(plist)) {
    console.log(`No daemon found for label: ${label}`);
    return;
  }

  try { execSync(`launchctl unload "${plist}"`); } catch { /* ok */ }
  unlinkSync(plist);

  console.log(`Daemon uninstalled.`);
  console.log(`  Label: ${label}`);
}

async function status() {
  if (process.platform !== "darwin") {
    console.log("Daemon status is macOS-only.");
    return;
  }

  // Find all apex-forge plists
  if (!existsSync(LAUNCH_AGENTS_DIR)) {
    console.log("No daemons installed.");
    return;
  }

  const plists = readdirSync(LAUNCH_AGENTS_DIR).filter(
    (f) => f.startsWith(LABEL_PREFIX) && f.endsWith(".plist"),
  );

  if (plists.length === 0) {
    console.log("No daemons installed.");
    return;
  }

  console.log(`Found ${plists.length} daemon(s):\n`);
  for (const f of plists) {
    const label = f.replace(".plist", "");
    let running = false;
    try {
      const out = execSync(`launchctl list "${label}" 2>/dev/null`, { encoding: "utf-8" });
      running = !out.includes("Could not find");
    } catch {
      running = false;
    }
    console.log(`  ${label}: ${running ? "RUNNING" : "STOPPED"}`);
  }
}

export async function cmdDaemon(args: string[]) {
  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case "install":
      await install(rest);
      break;
    case "uninstall":
      await uninstall(rest);
      break;
    case "status":
      await status();
      break;
    default:
      console.log("Usage: apex daemon <install|uninstall|status> [--hub] [--project PATH]");
  }
}

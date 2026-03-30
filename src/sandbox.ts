/**
 * Sandbox Execution — runs untrusted code in isolation using
 * Bun subprocesses with restricted environment variables and timeouts.
 */

import { spawn, spawnSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

// Check if Docker is available (cached)
let _dockerAvailable: boolean | null = null;
function isDockerAvailable(): boolean {
  if (_dockerAvailable === null) {
    _dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
  }
  return _dockerAvailable;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SandboxOptions {
  timeout?: number; // ms, default 30_000
  maxMemory?: number; // bytes, default 256 MB (informational — not enforced on all OSes)
  allowNetwork?: boolean; // default false
  workdir?: string; // default .apex/sandbox/
  env?: Record<string, string>; // extra env vars merged in
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  duration_ms: number;
  language: string;
}

export type SandboxLanguage = "javascript" | "typescript" | "python" | "bash";

// ---------------------------------------------------------------------------
// Extension & runner lookup
// ---------------------------------------------------------------------------

const EXTENSIONS: Record<SandboxLanguage, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  bash: "sh",
};

function getRunner(language: SandboxLanguage, codePath: string): string[] {
  const runners: Record<SandboxLanguage, string[]> = {
    javascript: ["bun", "run", codePath],
    typescript: ["bun", "run", codePath],
    python: ["python3", codePath],
    bash: ["bash", codePath],
  };
  const cmd = runners[language];
  if (!cmd) throw new Error(`Unsupported language: ${language}`);
  return cmd;
}

// ---------------------------------------------------------------------------
// Sandbox execution
// ---------------------------------------------------------------------------

export async function runInSandbox(
  code: string,
  language: SandboxLanguage,
  options: SandboxOptions = {},
): Promise<SandboxResult> {
  // Prefer Docker sandbox when available (real isolation)
  if (isDockerAvailable() && !options.env?.APEX_NO_DOCKER) {
    return runInDockerSandbox(code, language, options);
  }
  // Fallback: subprocess with restricted env (lightweight isolation)
  return runInSubprocessSandbox(code, language, options);
}

async function runInDockerSandbox(
  code: string,
  language: SandboxLanguage,
  options: SandboxOptions = {},
): Promise<SandboxResult> {
  const { timeout = 30_000, workdir = ".apex/sandbox" } = options;
  const absWorkdir = resolve(workdir);
  mkdirSync(absWorkdir, { recursive: true });

  const ext = EXTENSIONS[language];
  const codePath = join(absWorkdir, `run.${ext}`);
  writeFileSync(codePath, code, "utf-8");

  const images: Record<SandboxLanguage, string> = {
    javascript: "oven/bun:latest",
    typescript: "oven/bun:latest",
    python: "python:3.12-slim",
    bash: "alpine:latest",
  };

  const containerCmd: Record<SandboxLanguage, string[]> = {
    javascript: ["bun", "run", "/sandbox/run.js"],
    typescript: ["bun", "run", "/sandbox/run.ts"],
    python: ["python3", "/sandbox/run.py"],
    bash: ["sh", "/sandbox/run.sh"],
  };

  const startMs = Date.now();
  const args = [
    "run", "--rm",
    "--network=none",                    // No network access
    "--memory=256m",                     // Memory limit
    "--cpus=1",                          // CPU limit
    "--read-only",                       // Read-only root filesystem
    "--tmpfs", "/tmp:size=64m",          // Writable /tmp
    "-v", `${absWorkdir}:/sandbox:ro`,   // Mount code read-only
    images[language],
    ...containerCmd[language],
  ];

  return new Promise<SandboxResult>((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      resolvePromise({
        stdout: stdout.slice(0, 10_000),
        stderr: stderr.slice(0, 10_000),
        exitCode,
        timedOut,
        duration_ms: Date.now() - startMs,
        language,
      });
    };

    const proc = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code: number | null) => finish(code ?? 1));
    proc.on("error", (err: Error) => { stderr += err.message; finish(1); });

    const timer = setTimeout(() => { timedOut = true; proc.kill("SIGKILL"); }, timeout);
    proc.on("close", () => clearTimeout(timer));
  });
}

async function runInSubprocessSandbox(
  code: string,
  language: SandboxLanguage,
  options: SandboxOptions = {},
): Promise<SandboxResult> {
  const { timeout = 30_000, workdir = ".apex/sandbox", env = {} } = options;

  const absWorkdir = resolve(workdir);
  mkdirSync(absWorkdir, { recursive: true });

  // Write code to temp file
  const ext = EXTENSIONS[language];
  const codePath = join(absWorkdir, `run.${ext}`);
  writeFileSync(codePath, code, "utf-8");

  const cmd = getRunner(language, codePath);
  const startMs = Date.now();

  return new Promise<SandboxResult>((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      resolvePromise({
        stdout: stdout.slice(0, 10_000), // cap output
        stderr: stderr.slice(0, 10_000),
        exitCode,
        timedOut,
        duration_ms: Date.now() - startMs,
        language,
      });
    };

    const proc = spawn(cmd[0], cmd.slice(1), {
      cwd: absWorkdir,
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH, // keep PATH so runners are found
        HOME: absWorkdir,
        TMPDIR: absWorkdir,
        NODE_ENV: "sandbox",
        ...env,
      },
    });

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("close", (code: number | null) => {
      finish(code ?? 1);
    });

    proc.on("error", (err: Error) => {
      stderr += err.message;
      finish(1);
    });

    // Hard kill after timeout
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeout);

    proc.on("close", () => clearTimeout(timer));
  });
}

// ---------------------------------------------------------------------------
// Convenience: run a file directly
// ---------------------------------------------------------------------------

export async function runFileInSandbox(
  filePath: string,
  language: SandboxLanguage,
  options: SandboxOptions = {},
): Promise<SandboxResult> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const code = readFileSync(filePath, "utf-8");
  return runInSandbox(code, language, options);
}

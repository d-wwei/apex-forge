#!/usr/bin/env bun

/**
 * Smoke test for the Apex Forge MCP server.
 *
 * Spawns the server as a child process, sends JSON-RPC requests over
 * stdin/stdout, and verifies the responses.
 *
 * Usage:
 *   bun run src/test-mcp.ts
 */

import { spawn } from "child_process";

async function testMcp() {
  console.log("Testing MCP server...\n");

  const proc = spawn("bun", ["run", "src/mcp/server.ts", "--role", "admin"], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: import.meta.dir + "/..",
  });

  // Collect stderr for diagnostics on failure.
  let stderrBuf = "";
  proc.stderr!.on("data", (d: Buffer) => {
    stderrBuf += d.toString();
  });

  // Buffer stdout — MCP messages are newline-delimited JSON.
  let stdoutBuf = "";
  const waiters: Array<{
    id: number;
    resolve: (v: any) => void;
    reject: (e: Error) => void;
  }> = [];

  proc.stdout!.on("data", (data: Buffer) => {
    stdoutBuf += data.toString();
    // Try to parse complete lines.
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop()!; // keep incomplete trailing chunk
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        const idx = waiters.findIndex((w) => w.id === parsed.id);
        if (idx >= 0) {
          const [waiter] = waiters.splice(idx, 1);
          waiter.resolve(parsed);
        }
      } catch {
        // Not JSON — ignore (could be debug output).
      }
    }
  });

  function sendRequest(
    id: number,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const msg =
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.id === id);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(
          new Error(
            `Timeout waiting for response to ${method} (id=${id})` +
              (stderrBuf ? `\nstderr: ${stderrBuf}` : ""),
          ),
        );
      }, 10_000);

      waiters.push({
        id,
        resolve: (v: any) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      proc.stdin!.write(msg);
    });
  }

  function sendNotification(method: string, params: Record<string, unknown> = {}) {
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    proc.stdin!.write(msg);
  }

  let passed = 0;
  let failed = 0;

  try {
    // 1. Initialize
    const init = await sendRequest(1, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "apex-test", version: "1.0.0" },
    });
    if (init.result?.serverInfo?.name) {
      console.log(
        `  [PASS] initialize: ${init.result.serverInfo.name} v${init.result.serverInfo.version}`,
      );
      passed++;
    } else {
      console.log(`  [FAIL] initialize: unexpected response`, init);
      failed++;
    }

    // 2. Send initialized notification (required by MCP spec).
    sendNotification("notifications/initialized");

    // 3. List tools
    const tools = await sendRequest(2, "tools/list", {});
    const toolCount = tools.result?.tools?.length ?? 0;
    if (toolCount > 0) {
      const names = tools.result.tools.map((t: any) => t.name).join(", ");
      console.log(`  [PASS] tools/list: ${toolCount} tools (${names})`);
      passed++;
    } else {
      console.log(`  [FAIL] tools/list: no tools returned`, tools);
      failed++;
    }

    // 4. Call apex_status
    const status = await sendRequest(3, "tools/call", {
      name: "apex_status",
      arguments: {},
    });
    const statusText = status.result?.content?.[0]?.text;
    if (statusText) {
      console.log(
        `  [PASS] tools/call apex_status: ${statusText.slice(0, 80)}...`,
      );
      passed++;
    } else if (status.result?.content?.[0]?.text === "") {
      // Empty but valid.
      console.log(`  [PASS] tools/call apex_status: (empty response)`);
      passed++;
    } else {
      console.log(`  [FAIL] tools/call apex_status:`, status);
      failed++;
    }

    // Summary
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log("All MCP tests passed!");
    }
  } catch (err: any) {
    console.error(`\n  [FAIL] ${err.message}`);
    failed++;
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
  } finally {
    proc.kill();
    process.exit(failed > 0 ? 1 : 0);
  }
}

testMcp();

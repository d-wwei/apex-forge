#!/usr/bin/env bun

/**
 * Apex Forge — MCP Server
 *
 * Exposes apex-forge tools via the Model Context Protocol so Claude Code
 * (or any MCP client) can call them directly.
 *
 * Role-based tool registration (Chorus pattern):
 *   admin     — all tools (task + memory + browse + status)
 *   developer — task execution + browse QA + status
 *   pm        — task creation/viewing + memory management + status
 *
 * Usage:
 *   bun run src/mcp/server.ts [--role admin|developer|pm]
 *
 * Configure in Claude Code's MCP settings:
 *   {
 *     "mcpServers": {
 *       "apex": {
 *         "command": "bun",
 *         "args": ["run", "<project>/src/mcp/server.ts", "--role", "admin"]
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTaskTools } from "./tools/task.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerBrowseTools } from "./tools/browse.js";
import { registerStatusTools } from "./tools/status.js";

// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

const ROLES = ["developer", "pm", "admin"] as const;
type Role = (typeof ROLES)[number];

function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

function createServer(role: Role): McpServer {
  const server = new McpServer({
    name: "apex-forge",
    version: "0.1.0",
  });

  // Status is available to all roles
  registerStatusTools(server);

  switch (role) {
    case "admin":
      registerTaskTools(server);
      registerMemoryTools(server);
      registerBrowseTools(server);
      break;

    case "developer":
      // Task execution tools + browse for QA
      registerTaskTools(server);
      registerBrowseTools(server);
      break;

    case "pm":
      // Task creation/viewing + memory management
      registerTaskTools(server);
      registerMemoryTools(server);
      break;
  }

  return server;
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Parse --role flag
  const roleIndex = args.indexOf("--role");
  let role: Role = "admin";

  if (roleIndex >= 0 && roleIndex + 1 < args.length) {
    const candidate = args[roleIndex + 1];
    if (isValidRole(candidate)) {
      role = candidate;
    } else {
      console.error(
        `Invalid role "${candidate}". Valid roles: ${ROLES.join(", ")}. Defaulting to "admin".`,
      );
    }
  }

  const server = createServer(role);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("apex-mcp fatal:", err);
  process.exit(1);
});

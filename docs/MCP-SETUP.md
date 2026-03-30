# Apex Forge MCP Server Setup

Register the Apex Forge MCP server in Claude Code to expose all protocol tools
as native MCP tools (task management, memory, telemetry, orchestration).

---

## Method A: Global Registration

Add to `~/.claude/mcp_servers.json` (applies to all projects):

```json
{
  "apex-forge": {
    "command": "/path/to/apex-forge/dist/apex-forge-mcp",
    "args": ["--role", "admin"]
  }
}
```

Replace `/path/to/apex-forge` with the actual install path.

---

## Method B: Project-Level Registration

Add to your project's `.claude/mcp_servers.json` (applies only to that project):

```json
{
  "apex-forge": {
    "command": "/path/to/apex-forge/dist/apex-forge-mcp",
    "args": ["--role", "admin"]
  }
}
```

This keeps the server scoped to a single workspace.

---

## Method C: Copy the Config

A ready-made config is at the project root:

```bash
cp /path/to/apex-forge/mcp-config.json .claude/mcp_servers.json
```

Edit the command path to be absolute before using.

---

## Roles

The `--role` flag controls which tools are exposed. Three roles are available:

| Role | Tools | Use Case |
|------|-------|----------|
| `admin` | 27 (all) | Full access — project leads, solo developers |
| `developer` | 21 | Execution-focused — task, memory, telemetry, worktree |
| `pm` | 17 | Planning-focused — task, memory, status, orchestrate |

### Tool Availability by Role

| Tool | admin | developer | pm |
|------|:-----:|:---------:|:--:|
| `apex_init` | Y | Y | Y |
| `apex_status` | Y | Y | Y |
| `apex_task_create` | Y | Y | Y |
| `apex_task_assign` | Y | Y | N |
| `apex_task_start` | Y | Y | N |
| `apex_task_submit` | Y | Y | N |
| `apex_task_verify` | Y | Y | Y |
| `apex_task_block` | Y | Y | Y |
| `apex_task_release` | Y | Y | N |
| `apex_task_list` | Y | Y | Y |
| `apex_task_next` | Y | Y | Y |
| `apex_task_get` | Y | Y | Y |
| `apex_memory_add` | Y | Y | Y |
| `apex_memory_list` | Y | Y | Y |
| `apex_memory_search` | Y | Y | Y |
| `apex_memory_remove` | Y | N | N |
| `apex_memory_inject` | Y | Y | Y |
| `apex_memory_prune` | Y | N | N |
| `apex_memory_curate` | Y | Y | N |
| `apex_memory_extract` | Y | Y | N |
| `apex_telemetry_start` | Y | Y | N |
| `apex_telemetry_end` | Y | Y | N |
| `apex_telemetry_report` | Y | Y | Y |
| `apex_worktree_create` | Y | Y | N |
| `apex_worktree_list` | Y | Y | N |
| `apex_worktree_cleanup` | Y | Y | N |
| `apex_orchestrate` | Y | N | Y |

---

## Verification

After adding the configuration:

1. **Restart Claude Code** (or reload the MCP server list).
2. Check that Apex tools appear in the tool list. You should see tools prefixed with `apex_`.
3. Test with a simple command:
   ```
   Use the apex_status tool to show current state.
   ```
4. If tools do not appear, check the logs (see Troubleshooting below).

---

## Troubleshooting

### Tools not appearing

- Verify the `command` path is absolute and the binary exists:
  ```bash
  ls -la /path/to/apex-forge/dist/apex-forge-mcp
  ```
- Ensure the binary is executable:
  ```bash
  chmod +x /path/to/apex-forge/dist/apex-forge-mcp
  ```
- Check that `bun` is installed and on PATH (the MCP server is a Bun script).

### Permission errors

- The MCP server needs read/write access to the `.apex/` directory in the current project.
- If running in a sandboxed environment, ensure file system access is granted.

### Role not recognized

- Valid roles: `admin`, `developer`, `pm`. Case-sensitive, lowercase only.
- If `--role` is omitted, defaults to `admin`.

### Server crashes on startup

- Check for missing dependencies:
  ```bash
  cd /path/to/apex-forge && bun install
  ```
- Rebuild:
  ```bash
  cd /path/to/apex-forge && bun run build
  ```

### Conflict with other MCP servers

- Each MCP server must have a unique name in the config. If you have another server
  named `apex-forge`, rename one of them.
- Tool name collisions are prefixed automatically (`apex_` namespace).

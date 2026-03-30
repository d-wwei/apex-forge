# Contributing to apex-forge

## Architecture

apex-forge has three layers:

1. **TypeScript Runtime** (`src/`) -- Compiled binaries for task management, browser automation, MCP server
2. **Skill Files** (`workflow/`, `protocol/`) -- Markdown instructions for AI agents
3. **Infrastructure** (`hooks/`, `extension/`) -- Session hooks, Chrome extension, CI

## Development Setup

Prerequisites: Bun 1.3+

```bash
git clone https://github.com/USER/apex-forge.git
cd apex-forge
bun install
bun run build      # Build apex CLI
bun test           # Run tests
```

## Project Structure

```
src/
  cli.ts                 -- Main CLI entry point
  commands/              -- CLI command handlers
  state/                 -- JSON state management (tasks, memory, config)
  browse/                -- Headless browser daemon
  mcp/                   -- MCP server with role-based tools
  consensus/             -- Raft, BFT, Gossip, CRDT protocols
  integrations/          -- GitHub issue tracker
  dashboard.ts           -- Web dashboard server
  design.ts              -- AI design generation
  sandbox.ts             -- Sandboxed code execution
  tracing.ts             -- Observability spans
  orchestrator.ts        -- Multi-agent task dispatcher
workflow/
  stages/                -- 7 pipeline stage skills
  roles/                 -- 30+ role-based skills
protocol/                -- Core execution discipline
extension/               -- Chrome extension for Side Panel
hooks/                   -- Session-start, pre-commit hooks
```

## Adding a New Skill

1. Create `workflow/roles/my-skill.md` with YAML frontmatter
2. Register in `.claude-plugin`
3. Or use `/apex-skill-author` which guides you through it

## Adding a New CLI Command

1. Add handler in `src/commands/` or inline in `src/cli.ts`
2. Add to the switch statement in `src/cli.ts`
3. Add to help text
4. Add tests in `src/__tests__/`
5. Rebuild: `bun run build`

## Testing

```bash
bun test                    # All tests
bun test --filter tasks     # Just task tests
bun test --filter memory    # Just memory tests
bun test --filter consensus # Just consensus tests
bun test --filter cli       # Integration tests (requires build first)
```

## CI

GitHub Actions runs on every push/PR to `main`:

1. Type check (`tsc --noEmit`)
2. Build binaries (`bun run build`)
3. Run all unit tests (`bun test`)
4. Run CLI integration smoke tests

See `.github/workflows/ci.yml`.

## Error Recovery

The `apex recover` command handles crash recovery:

- Cleans stale browse daemon state files
- Removes expired telemetry sessions
- Releases tasks stuck in `assigned`/`in_progress` back to `open`
- Validates JSON state files for corruption

Run it after unexpected crashes or when state seems inconsistent.

## Code Style

- TypeScript strict mode
- No external CLI parser libraries
- Atomic JSON writes (temp file + rename)
- ESM imports with `.js` extension
- Keep tests co-located in `src/__tests__/`

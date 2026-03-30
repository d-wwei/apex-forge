/**
 * Apex Forge — MCP Memory Tools
 *
 * Registers memory (fact store) tools on the MCP server.
 * Covers: add, list, search, remove, inject, prune.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  memoryAdd,
  memoryList,
  memorySearch,
  memoryRemove,
  memoryInject,
  memoryPrune,
} from "../../state/memory.js";

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

export function registerMemoryTools(server: McpServer) {
  // ── Add ─────────────────────────────────────────────────────────────────
  server.tool(
    "apex_memory_add",
    "Add a fact to memory with confidence score (0.0-1.0), optional tags, and source",
    {
      content: z.string(),
      confidence: z.number().min(0).max(1),
      tags: z.array(z.string()).optional(),
      source: z.string().optional(),
    },
    async ({ content, confidence, tags, source }) => {
      try {
        const fact = await memoryAdd(content, confidence, tags || [], source || "");
        return ok(`Added ${fact.id}: ${fact.content} (confidence: ${fact.confidence})`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── List ────────────────────────────────────────────────────────────────
  server.tool(
    "apex_memory_list",
    "List facts at or above a minimum confidence threshold (default 0)",
    { min_confidence: z.number().min(0).max(1).optional() },
    async ({ min_confidence }) => {
      try {
        const facts = await memoryList(min_confidence ?? 0);
        if (facts.length === 0) return ok("No facts stored");
        const text = facts
          .map((f) => {
            const tagStr = f.tags.length > 0 ? ` [${f.tags.join(", ")}]` : "";
            return `${f.id} (${f.confidence.toFixed(2)}) ${f.content}${tagStr}`;
          })
          .join("\n");
        return ok(text);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Search ──────────────────────────────────────────────────────────────
  server.tool(
    "apex_memory_search",
    "Case-insensitive search across fact content and tags",
    { query: z.string() },
    async ({ query }) => {
      try {
        const facts = await memorySearch(query);
        if (facts.length === 0) return ok(`No facts matching "${query}"`);
        const text = facts
          .map((f) => {
            const tagStr = f.tags.length > 0 ? ` [${f.tags.join(", ")}]` : "";
            return `${f.id} (${f.confidence.toFixed(2)}) ${f.content}${tagStr}`;
          })
          .join("\n");
        return ok(text);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Remove ──────────────────────────────────────────────────────────────
  server.tool(
    "apex_memory_remove",
    "Remove a fact by ID",
    { fact_id: z.string() },
    async ({ fact_id }) => {
      try {
        await memoryRemove(fact_id);
        return ok(`Removed ${fact_id}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Inject ──────────────────────────────────────────────────────────────
  server.tool(
    "apex_memory_inject",
    "Format all facts as an <apex-memory> XML block for context injection",
    {},
    async () => {
      try {
        const block = await memoryInject();
        return ok(block || "(empty — no facts stored)");
      } catch (e) {
        return err(e);
      }
    },
  );

  // ── Prune ───────────────────────────────────────────────────────────────
  server.tool(
    "apex_memory_prune",
    "Remove low-confidence facts (<0.5) and cap total at 100",
    {},
    async () => {
      try {
        const result = await memoryPrune();
        return ok(`Pruned: ${result.removed} removed, ${result.kept} kept`);
      } catch (e) {
        return err(e);
      }
    },
  );
}

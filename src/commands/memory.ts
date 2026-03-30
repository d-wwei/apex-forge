import {
  memoryAdd,
  memoryList,
  memorySearch,
  memoryRemove,
  memoryInject,
  memoryPrune,
} from "../state/memory.js";
import { curateFacts } from "../state/curate.js";

export async function cmdMemory(args: string[]): Promise<void> {
  const verb = args[0];

  switch (verb) {
    case "add": {
      const content = args[1];
      if (!content) {
        console.error(
          "Usage: apex memory add FACT CONFIDENCE [TAGS...]",
        );
        process.exit(1);
      }
      const confidence = parseFloat(args[2] ?? "0.5");
      if (isNaN(confidence)) {
        console.error("Confidence must be a number between 0 and 1");
        process.exit(1);
      }
      const tags = args.slice(3);
      const fact = await memoryAdd(content, confidence, tags);
      console.log(
        `Added ${fact.id}: "${fact.content}" (confidence: ${fact.confidence.toFixed(2)})`,
      );
      break;
    }

    case "list": {
      const minIdx = args.indexOf("--min");
      const minConf =
        minIdx !== -1 ? parseFloat(args[minIdx + 1]) : undefined;
      const facts = await memoryList(minConf);
      if (facts.length === 0) {
        console.log("No facts in memory");
        return;
      }
      for (const f of facts) {
        const tags =
          f.tags.length > 0 ? ` [${f.tags.join(", ")}]` : "";
        console.log(
          `  ${f.id.padEnd(5)} ${f.confidence.toFixed(2)}  ${f.content}${tags}`,
        );
      }
      break;
    }

    case "search": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error("Usage: apex memory search QUERY");
        process.exit(1);
      }
      const results = await memorySearch(query);
      if (results.length === 0) {
        console.log("No matching facts");
        return;
      }
      for (const f of results) {
        const tags =
          f.tags.length > 0 ? ` [${f.tags.join(", ")}]` : "";
        console.log(
          `  ${f.id.padEnd(5)} ${f.confidence.toFixed(2)}  ${f.content}${tags}`,
        );
      }
      break;
    }

    case "remove": {
      const factId = args[1];
      if (!factId) {
        console.error("Usage: apex memory remove FACT_ID");
        process.exit(1);
      }
      await memoryRemove(factId);
      console.log(`Removed ${factId}`);
      break;
    }

    case "inject": {
      const output = await memoryInject();
      console.log(output);
      break;
    }

    case "prune": {
      const result = await memoryPrune();
      if (result.removed > 0) {
        console.log(
          `Pruned ${result.removed} fact${result.removed > 1 ? "s" : ""}, ${result.kept} remaining`,
        );
      } else {
        console.log(`Nothing to prune (${result.kept} facts, all >= 0.5 confidence)`);
      }
      break;
    }

    case "curate": {
      // Auto-extract facts from recent activity:
      // 1. Read recent git commits (last 7 days)
      // 2. Read .apex/tasks.json for completed tasks
      // 3. Read docs/solutions/ for documented knowledge
      // 4. Extract patterns and add as facts
      const facts = await curateFacts();
      if (facts.length === 0) {
        console.log("No new facts to curate");
      } else {
        for (const f of facts) {
          await memoryAdd(f.content, f.confidence, f.tags);
        }
        console.log(`Curated ${facts.length} fact(s) from recent activity`);
      }
      break;
    }

    case "extract-llm": {
      const { llmCurate, buildCurationContext } = await import(
        "../state/llm-curate.js"
      );

      // Check if context is piped via stdin or auto-built
      let context: string;
      if (args[1] === "--stdin") {
        // Read from stdin (for piping conversation transcripts)
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        context = Buffer.concat(chunks).toString();
      } else {
        // Auto-build from git + tasks + solutions
        context = await buildCurationContext();
      }

      if (!context.trim()) {
        console.log("No activity context found");
        break;
      }

      console.log("Extracting facts via LLM...");
      const llmFacts = await llmCurate(context);

      if (llmFacts.length === 0) {
        console.log("No new facts extracted");
      } else {
        for (const f of llmFacts) {
          await memoryAdd(f.content, f.confidence, f.tags, "llm-curated");
        }
        console.log(`Extracted ${llmFacts.length} fact(s) via LLM:`);
        for (const f of llmFacts) {
          console.log(
            `  [${f.confidence.toFixed(2)}] ${f.content} [${f.tags.join(", ")}]`,
          );
        }
      }
      break;
    }

    default:
      console.error(`Unknown memory command: ${verb || "(none)"}`);
      console.error(
        "Usage: apex memory [add|list|search|remove|inject|prune|curate|extract-llm]",
      );
      process.exit(1);
  }
}

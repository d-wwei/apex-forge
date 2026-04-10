import { detectMemoryBackend } from "../memory/index.js";
import { curateFacts } from "../state/curate.js";

export async function cmdMemory(args: string[]): Promise<void> {
  const verb = args[0];

  // "backend" subcommand doesn't need the full backend — just detect and report
  if (verb === "backend") {
    const backend = await detectMemoryBackend();
    console.log(backend.name);
    return;
  }

  // Get the active memory backend for all other commands
  const backend = await detectMemoryBackend();

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
      const factId = await backend.addFact(content, confidence, tags);
      console.log(
        `Added ${factId}: "${content}" (confidence: ${confidence.toFixed(2)}) [${backend.name}]`,
      );
      break;
    }

    case "list": {
      const minIdx = args.indexOf("--min");
      const minConf =
        minIdx !== -1 ? parseFloat(args[minIdx + 1]) : undefined;
      const facts = await backend.listFacts(minConf);
      if (facts.length === 0) {
        console.log("No facts in memory");
        return;
      }
      for (const f of facts) {
        const tags =
          f.tags.length > 0 ? ` [${f.tags.join(", ")}]` : "";
        console.log(
          `  ${f.id.padEnd(8)} ${f.confidence.toFixed(2)}  ${f.content}${tags}`,
        );
      }
      console.log(`  (${facts.length} facts via ${backend.name})`);
      break;
    }

    case "search": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error("Usage: apex memory search QUERY");
        process.exit(1);
      }
      const results = await backend.searchFacts(query);
      if (results.length === 0) {
        console.log("No matching facts");
        return;
      }
      for (const f of results) {
        const tags =
          f.tags.length > 0 ? ` [${f.tags.join(", ")}]` : "";
        console.log(
          `  ${f.id.padEnd(8)} ${f.confidence.toFixed(2)}  ${f.content}${tags}`,
        );
      }
      console.log(`  (${results.length} results via ${backend.name})`);
      break;
    }

    case "remove": {
      const factId = args[1];
      if (!factId) {
        console.error("Usage: apex memory remove FACT_ID");
        process.exit(1);
      }
      await backend.removeFact(factId);
      console.log(`Removed ${factId}`);
      break;
    }

    case "inject": {
      const project = process.cwd().split("/").pop() || "unknown";
      const output = await backend.injectContext(project);
      console.log(output);
      break;
    }

    case "prune": {
      const removed = await backend.pruneFacts();
      if (removed > 0) {
        console.log(
          `Pruned ${removed} fact${removed > 1 ? "s" : ""} [${backend.name}]`,
        );
      } else {
        console.log(`Nothing to prune [${backend.name}]`);
      }
      break;
    }

    case "curate": {
      // curate still uses local memoryAdd since it auto-extracts from local sources
      const facts = await curateFacts();
      if (facts.length === 0) {
        console.log("No new facts to curate");
      } else {
        for (const f of facts) {
          await backend.addFact(f.content, f.confidence, f.tags);
        }
        console.log(`Curated ${facts.length} fact(s) from recent activity [${backend.name}]`);
      }
      break;
    }

    case "extract-llm": {
      const { llmCurate, buildCurationContext } = await import(
        "../state/llm-curate.js"
      );

      let context: string;
      if (args[1] === "--stdin") {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        context = Buffer.concat(chunks).toString();
      } else {
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
          await backend.addFact(f.content, f.confidence, f.tags);
        }
        console.log(`Extracted ${llmFacts.length} fact(s) via LLM [${backend.name}]:`);
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
        "Usage: apex memory [add|list|search|remove|inject|prune|curate|extract-llm|backend]",
      );
      process.exit(1);
  }
}

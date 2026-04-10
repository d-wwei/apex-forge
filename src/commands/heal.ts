import { createApexUddAdapter, createApexUddRuntime } from "../adapters/udd-adapter.js";

export async function cmdHeal(args: string[]) {
  const sub = args[0];
  const json = args.includes("--json");

  if (sub === "analyze" || sub === "diagnose") {
    const errorIdx = args.indexOf("--error");
    const errorMsg = errorIdx >= 0 ? args.slice(errorIdx + 1).filter(a => a !== "--json").join(" ") : undefined;
    if (!errorMsg) {
      console.error("Usage: apex heal analyze --error \"error message\"");
      process.exit(1);
    }

    const runtime = await createApexUddRuntime();
    const adapter = createApexUddAdapter();
    const diagnosis = await runtime.analyze(adapter, {
      error: { message: errorMsg },
    });

    if (json) {
      console.log(JSON.stringify(diagnosis, null, 2));
    } else {
      console.log(`Diagnosis: ${diagnosis.kind}`);
      console.log(`Confidence: ${diagnosis.confidence}`);
      if (diagnosis.suggestedStrategies?.length) {
        console.log(`Suggested strategies: ${diagnosis.suggestedStrategies.join(", ")}`);
      }
      if (diagnosis.summary) {
        console.log(`\nSummary: ${diagnosis.summary}`);
      }
    }
  } else if (sub === "run" || sub === "fix") {
    const errorIdx = args.indexOf("--error");
    const errorMsg = errorIdx >= 0 ? args.slice(errorIdx + 1).filter(a => a !== "--json").join(" ") : undefined;
    if (!errorMsg) {
      console.error("Usage: apex heal run --error \"error message\"");
      process.exit(1);
    }

    console.log("Starting self-heal...");
    const runtime = await createApexUddRuntime();
    const adapter = createApexUddAdapter();
    const result = await runtime.heal(adapter, {
      error: { message: errorMsg },
    });

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.status === "repaired") {
        console.log(`Repaired! Strategy: ${result.strategy}`);
        console.log(`Summary: ${result.summary}`);
        if (result.prUrl) console.log(`PR: ${result.prUrl}`);
      } else if (result.status === "escalated") {
        console.log(`Could not auto-heal. Escalated.`);
        console.log(`Summary: ${result.summary}`);
        if (result.issueUrl) console.log(`Issue: ${result.issueUrl}`);
        else console.log(`\nTry: apex heal issue-draft --error "${errorMsg}"`);
      } else {
        console.log(`Skipped: ${result.summary}`);
      }
    }
  } else if (sub === "issue-draft") {
    const errorIdx = args.indexOf("--error");
    const errorMsg = errorIdx >= 0 ? args.slice(errorIdx + 1).filter(a => a !== "--json").join(" ") : undefined;
    if (!errorMsg) {
      console.error("Usage: apex heal issue-draft --error \"error message\"");
      process.exit(1);
    }

    const runtime = await createApexUddRuntime();
    const adapter = createApexUddAdapter();
    const draft = await runtime.prepareIssue(adapter, {
      error: { message: errorMsg },
    });

    if (json) {
      console.log(JSON.stringify(draft, null, 2));
    } else {
      console.log("=== Issue Draft ===");
      console.log(`Title: ${draft.title}`);
      console.log(`\n${draft.body}`);
      console.log("\nTo submit: apex heal issue-submit --error \"...\" --token <GITHUB_TOKEN>");
    }
  } else if (sub === "contribute") {
    const summaryIdx = args.indexOf("--summary");
    const summary = summaryIdx >= 0 ? args.slice(summaryIdx + 1).filter(a => a !== "--json").join(" ") : "Fix from local heal";

    const runtime = await createApexUddRuntime();
    const adapter = createApexUddAdapter();
    const result = await runtime.contribute(adapter, {
      metadata: { summary },
    });

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.status === "pr_created") {
        console.log(`PR created: ${result.prUrl}`);
      } else if (result.status === "pushed") {
        console.log(`Branch pushed: ${result.branch}`);
        console.log(`Summary: ${result.summary}`);
      } else {
        console.log(`Blocked: ${result.reason}`);
      }
    }
  } else if (sub === "check") {
    const runtime = await createApexUddRuntime();
    const adapter = createApexUddAdapter();
    const result = await runtime.check(adapter);

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.hasUpdate) {
        console.log(`Upstream update: v${result.currentVersion} → v${result.latestVersion}`);
        if (result.highlights?.length) {
          console.log("Highlights:");
          for (const h of result.highlights) console.log(`  - ${h}`);
        }
      } else {
        console.log(`Up to date: v${result.currentVersion}`);
      }
    }
  } else {
    console.log(`
apex heal — self-healing & contribution (powered by UDD Kit)

Usage:
  apex heal check [--json]                     Check upstream for updates + changelog
  apex heal analyze --error "msg" [--json]     Diagnose an error
  apex heal run --error "msg" [--json]         Full self-heal loop
  apex heal issue-draft --error "msg" [--json] Draft a GitHub issue
  apex heal contribute [--summary "..."] [--json]
                                               Contribute local fix as PR
`);
  }
}

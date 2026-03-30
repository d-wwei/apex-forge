#!/usr/bin/env bun

/**
 * Design Image Generation — calls OpenAI GPT Image API
 * to produce UI mockups, variants, and comparison pages.
 */

import { mkdirSync, existsSync } from "fs";

const OPENAI_API_URL = "https://api.openai.com/v1/images/generations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DesignResult {
  path: string;
  prompt: string;
  timestamp: string;
}

export interface DesignOptions {
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "low" | "medium" | "high";
  model?: string;
  outputDir?: string;
}

// ---------------------------------------------------------------------------
// Core generation
// ---------------------------------------------------------------------------

export async function generateDesign(
  prompt: string,
  outputPath?: string,
  options: DesignOptions = {},
): Promise<DesignResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY not set. Set it to enable design generation.\n  export OPENAI_API_KEY=sk-...",
    );
  }

  const outDir = options.outputDir || ".apex/designs";
  mkdirSync(outDir, { recursive: true });
  const path = outputPath || `${outDir}/design-${Date.now()}.png`;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model || "gpt-image-1",
      prompt: `UI design mockup: ${prompt}. Professional, clean, modern web/mobile interface. High fidelity wireframe with realistic content.`,
      n: 1,
      size: options.size || "1536x1024",
      quality: options.quality || "high",
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(
      `OpenAI API error: ${err.error?.message || response.statusText}`,
    );
  }

  const data = await response.json();

  // GPT Image returns base64 or URL depending on the model / request params
  if (data.data?.[0]?.b64_json) {
    const buffer = Buffer.from(data.data[0].b64_json, "base64");
    await Bun.write(path, buffer);
  } else if (data.data?.[0]?.url) {
    const imgResp = await fetch(data.data[0].url);
    await Bun.write(path, await imgResp.arrayBuffer());
  } else {
    throw new Error("Unexpected API response: no image data returned");
  }

  return { path, prompt, timestamp: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Variant generation
// ---------------------------------------------------------------------------

const DEFAULT_STYLES = [
  "minimalist and clean",
  "bold and colorful",
  "dark theme professional",
  "soft pastel organic",
  "high-contrast corporate",
];

export async function generateVariants(
  prompt: string,
  count: number = 3,
  options: DesignOptions = {},
): Promise<DesignResult[]> {
  const results: DesignResult[] = [];
  const outDir = options.outputDir || ".apex/designs";
  mkdirSync(outDir, { recursive: true });

  const limit = Math.min(count, DEFAULT_STYLES.length);

  for (let i = 0; i < limit; i++) {
    const style = DEFAULT_STYLES[i];
    const variantPath = `${outDir}/variant-${i + 1}.png`;
    console.log(`  Generating variant ${i + 1}/${limit} (${style})...`);
    const result = await generateDesign(
      `${prompt}. Style: ${style}`,
      variantPath,
      options,
    );
    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Comparison page
// ---------------------------------------------------------------------------

export async function compareDesigns(paths: string[]): Promise<string> {
  const outDir = ".apex/designs";
  mkdirSync(outDir, { recursive: true });

  const cards = paths
    .map((p, i) => {
      // Use absolute path for file:// URLs
      const abs = p.startsWith("/") ? p : `${process.cwd()}/${p}`;
      return `<div class="variant">
      <h3>Variant ${i + 1}</h3>
      <img src="file://${abs}" alt="Variant ${i + 1}">
      <p class="path">${p}</p>
    </div>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Design Comparison — apex-forge</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #1a1a2e; color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 24px;
  }
  h1 { color: #f0c040; margin-bottom: 20px; font-size: 1.6rem; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
    gap: 20px;
  }
  .variant {
    background: #21262d; border-radius: 10px; padding: 14px;
    transition: transform 0.15s;
  }
  .variant:hover { transform: translateY(-3px); }
  .variant img { width: 100%; border-radius: 6px; }
  .variant h3 { margin: 10px 0 6px; color: #f0c040; font-size: 1.1rem; }
  .variant .path { font-size: 0.75rem; color: #888; margin-top: 6px; }
  .meta { color: #888; font-size: 0.8rem; margin-bottom: 16px; }
</style>
</head>
<body>
<h1>Design Comparison</h1>
<p class="meta">Generated ${new Date().toISOString()} &mdash; ${paths.length} variants</p>
<div class="grid">
${cards}
</div>
</body>
</html>`;

  const outPath = `${outDir}/comparison.html`;
  await Bun.write(outPath, html);
  return outPath;
}

// ---------------------------------------------------------------------------
// List existing designs
// ---------------------------------------------------------------------------

export function listDesigns(dir?: string): string[] {
  const designDir = dir || ".apex/designs";
  if (!existsSync(designDir)) return [];
  const { readdirSync } = require("fs");
  return (readdirSync(designDir) as string[])
    .filter((f: string) => f.endsWith(".png"))
    .map((f: string) => `${designDir}/${f}`);
}

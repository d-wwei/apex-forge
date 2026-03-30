#!/usr/bin/env bun

// apex convert --platform cursor|codex|factory|gemini|windsurf [--output DIR]
//
// Cross-platform skill converter. Reads apex skill files and converts them
// to formats compatible with other AI agent platforms.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

interface SkillMeta {
  name: string;
  description: string;
  userInvocable: boolean;
  path: string;
  content: string;
}

interface PlatformConfig {
  dir: string;
  manifest?: string;
  transform: (skill: SkillMeta) => string;
  manifest_template: (skills: SkillMeta[]) => string;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  cursor: {
    dir: ".cursor-plugin",
    manifest: ".cursor-plugin/manifest.json",
    transform: (skill: SkillMeta) => {
      // Cursor uses the same SKILL.md format but different manifest structure
      return skill.content;
    },
    manifest_template: (skills: SkillMeta[]) =>
      JSON.stringify(
        {
          name: "apex-forge",
          version: "0.1.0",
          skills: skills.map((s) => ({
            name: s.name,
            path: s.path,
            description: s.description,
          })),
        },
        null,
        2
      ),
  },

  codex: {
    dir: ".agents/skills",
    transform: (skill: SkillMeta) => {
      // Codex: remove Claude Code tool references, use generic phrasing
      let content = skill.content;
      content = content.replace(/use the Bash tool/g, "run this command");
      content = content.replace(/use the Read tool/g, "read the file");
      content = content.replace(/use the Write tool/g, "write the file");
      content = content.replace(/use the Edit tool/g, "edit the file");
      content = content.replace(/use the Agent tool/g, "spawn a subagent");
      content = content.replace(/use the Grep tool/g, "search for the pattern");
      content = content.replace(/use the Glob tool/g, "find files matching");
      return content;
    },
    manifest_template: (skills: SkillMeta[]) => {
      return [
        "# Apex Forge Skills for Codex",
        "",
        ...skills.map(
          (s) =>
            `## ${s.name}\n- Path: ${s.path}\n- ${s.description}\n`
        ),
      ].join("\n");
    },
  },

  factory: {
    dir: ".factory/skills",
    transform: (skill: SkillMeta) => {
      let content = skill.content;
      // Add Factory-specific frontmatter for sensitive skills
      const sensitivePatterns = [
        "ship",
        "land-and-deploy",
        "guard",
        "careful",
        "freeze",
        "unfreeze",
      ];
      const isSensitive = sensitivePatterns.some((s) =>
        skill.name.includes(s)
      );
      if (isSensitive) {
        content = content.replace(
          /^(---\n)/m,
          `---\ndisable-model-invocation: true\n`
        );
      }
      // Tool name translation
      content = content.replace(/use the Bash tool/g, "run this command");
      content = content.replace(/use the Read tool/g, "read the file");
      content = content.replace(/use the Write tool/g, "write the file");
      content = content.replace(/use the Edit tool/g, "edit the file");
      content = content.replace(/use the Agent tool/g, "spawn a subagent");
      return content;
    },
    manifest_template: (skills: SkillMeta[]) => {
      const sensitivePatterns = [
        "ship",
        "land-and-deploy",
        "guard",
        "careful",
        "freeze",
        "unfreeze",
      ];
      return [
        "# Apex Forge Skills for Factory Droid",
        "",
        ...skills.map((s) => {
          const isSensitive = sensitivePatterns.some((x) =>
            s.name.includes(x)
          );
          return [
            `## ${s.name}`,
            `- Path: ${s.path}`,
            `- ${s.description}`,
            isSensitive ? "- sensitive: true" : "",
            "",
          ]
            .filter(Boolean)
            .join("\n");
        }),
      ].join("\n");
    },
  },

  gemini: {
    dir: ".gemini/skills",
    transform: (skill: SkillMeta) => {
      // Gemini CLI format
      let content = skill.content;
      content = content.replace(/use the Bash tool/g, "run shell command");
      content = content.replace(/use the Read tool/g, "read the file");
      content = content.replace(/use the Write tool/g, "write the file");
      content = content.replace(/use the Edit tool/g, "edit the file");
      content = content.replace(/use the Agent tool/g, "use the agent tool");
      content = content.replace(/use the Grep tool/g, "search for");
      content = content.replace(/use the Glob tool/g, "find files");
      return content;
    },
    manifest_template: (skills: SkillMeta[]) => {
      return [
        "# Apex Forge Skills for Gemini CLI",
        "",
        ...skills.map(
          (s) => `- ${s.name}: ${s.path} — ${s.description}`
        ),
      ].join("\n");
    },
  },

  antigravity: {
    dir: ".agent/skills",
    transform: (skill: SkillMeta) => {
      // Antigravity (Google) — uses .agent/skills/ with SKILL.md
      // Powered by Gemini, uses generic tool phrasing
      let content = skill.content;
      content = content.replace(/use the Bash tool/g, "run this command");
      content = content.replace(/use the Read tool/g, "read the file");
      content = content.replace(/use the Write tool/g, "write the file");
      content = content.replace(/use the Edit tool/g, "edit the file");
      content = content.replace(/use the Agent tool/g, "delegate to a sub-agent");
      content = content.replace(/use the Grep tool/g, "search for");
      content = content.replace(/use the Glob tool/g, "find files matching");
      // Antigravity-specific: reference MCP tools for binary operations
      content = content.replace(
        /apex-forge task /g,
        "apex-forge task "  // keep as shell command — Antigravity agents can run shell
      );
      return content;
    },
    manifest_template: (skills: SkillMeta[]) => {
      // Antigravity uses .agent/ structure with config.yml + skills/ + agents/ + rules/
      const skillList = skills.map((s) => {
        const slug = s.name.replace(/^apex-forge-/, "");
        return `## ${s.name}\n- Slug: \`${slug}\`\n- Path: \`.agent/skills/${s.name}/SKILL.md\`\n- ${s.description}`;
      });
      return [
        "# Apex Forge Skills for Antigravity",
        "",
        `${skills.length} skills available. Each skill is a folder with a SKILL.md file.`,
        "",
        "## Installation",
        "",
        "1. Copy the `.agent/skills/` directory to your project root",
        "2. In Antigravity: Settings → Customizations → Skill Custom Paths → add `.agent/skills/`",
        "3. Refresh to load skills",
        "",
        "## MCP Integration",
        "",
        "Apex Forge also provides an MCP server for task management, memory, and browser tools:",
        "```yaml",
        "# .agent/config.yml",
        "mcp_servers:",
        "  apex-forge:",
        `    command: "${process.cwd()}/dist/apex-forge-mcp"`,
        '    args: ["--role", "admin"]',
        "```",
        "",
        "## Available Skills",
        "",
        ...skillList,
      ].join("\n");
    },
  },

  windsurf: {
    dir: ".windsurf/skills",
    transform: (skill: SkillMeta) => {
      // Windsurf/Codeium format — similar to Cursor but with Cascade-specific adjustments
      let content = skill.content;
      content = content.replace(/use the Bash tool/g, "run terminal command");
      content = content.replace(/use the Read tool/g, "read the file");
      content = content.replace(/use the Write tool/g, "write the file");
      content = content.replace(/use the Edit tool/g, "edit the file");
      content = content.replace(/use the Agent tool/g, "use cascade flow");
      content = content.replace(/use the Grep tool/g, "search codebase for");
      content = content.replace(/use the Glob tool/g, "find files matching");
      return content;
    },
    manifest_template: (skills: SkillMeta[]) =>
      JSON.stringify(
        {
          name: "apex-forge",
          version: "0.1.0",
          platform: "windsurf",
          skills: skills.map((s) => ({
            name: s.name,
            file: s.path,
            description: s.description,
            invocable: s.userInvocable,
          })),
        },
        null,
        2
      ),
  },
};

/**
 * Scan known skill directories and parse skill metadata from markdown frontmatter.
 */
function readSkillFiles(): SkillMeta[] {
  const skills: SkillMeta[] = [];

  const dirs = [
    { base: "protocol", prefix: "apex" },
    { base: "workflow/stages", prefix: "apex" },
    { base: "workflow/roles", prefix: "apex" },
  ];

  for (const dir of dirs) {
    const fullPath = dir.base;
    if (!existsSync(fullPath)) continue;

    for (const file of readdirSync(fullPath)) {
      if (!file.endsWith(".md")) continue;

      const filePath = join(fullPath, file);
      const content = readFileSync(filePath, "utf-8");

      // Parse YAML frontmatter
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descMatch = content.match(/^description:\s*(.+)$/m);
      const invocableMatch = content.includes("user-invocable: true");

      skills.push({
        name: nameMatch?.[1]?.trim() || basename(file, ".md"),
        description: descMatch?.[1]?.trim() || "",
        userInvocable: invocableMatch,
        path: filePath,
        content,
      });
    }
  }

  return skills;
}

/**
 * Convert all skills for the target platform and write to the output directory.
 */
function convertSkills(
  platform: string,
  skills: SkillMeta[],
  targetDir: string
): void {
  const config = PLATFORMS[platform];
  if (!config) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  mkdirSync(targetDir, { recursive: true });

  // Convert each skill file
  let converted = 0;
  for (const skill of skills) {
    const transformedContent = config.transform(skill);
    const skillDir = join(targetDir, skill.name);
    const targetPath = join(skillDir, "SKILL.md");

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(targetPath, transformedContent);
    converted++;
  }

  // Write platform manifest
  const manifestContent = config.manifest_template(skills);
  const isJsonManifest = platform === "cursor" || platform === "windsurf";
  // Antigravity uses AGENTS.md by convention, consistent with its .agent/ structure
  const manifestFilename = isJsonManifest ? "manifest.json" : "AGENTS.md";
  writeFileSync(join(targetDir, manifestFilename), manifestContent);

  console.log(
    `Converted ${converted} skills for ${platform} -> ${targetDir}`
  );
  console.log(
    `Manifest written to ${join(targetDir, manifestFilename)}`
  );
}

/**
 * Print usage help.
 */
function printUsage(): void {
  const platforms = Object.keys(PLATFORMS).join("|");
  console.log(
    `Usage: apex convert --platform ${platforms} [--output DIR]`
  );
  console.log("");
  console.log("Available platforms:");
  for (const [name, config] of Object.entries(PLATFORMS)) {
    console.log(`  ${name.padEnd(12)} -> ${config.dir}`);
  }
  console.log("");
  console.log("Options:");
  console.log(
    "  --platform PLATFORM   Target platform (required)"
  );
  console.log(
    "  --output DIR          Output directory (default: platform default)"
  );
  console.log(
    "  --list                List discovered skills without converting"
  );
}

export async function main(args?: string[]): Promise<void> {
  const argv = args || process.argv.slice(2);

  // Parse --list flag
  if (argv.includes("--list")) {
    const skills = readSkillFiles();
    console.log(`Found ${skills.length} skills:\n`);
    for (const skill of skills) {
      console.log(
        `  ${skill.name.padEnd(30)} ${skill.path}`
      );
      if (skill.description) {
        console.log(
          `  ${"".padEnd(30)} ${skill.description}`
        );
      }
    }
    return;
  }

  // Parse --platform
  const platformIdx = argv.indexOf("--platform");
  const platform =
    platformIdx >= 0 ? argv[platformIdx + 1] : null;

  if (!platform || !(platform in PLATFORMS)) {
    printUsage();
    process.exit(1);
  }

  // Parse --output
  const outputIdx = argv.indexOf("--output");
  const outputDir =
    outputIdx >= 0 ? argv[outputIdx + 1] : null;

  const skills = readSkillFiles();
  if (skills.length === 0) {
    console.error(
      "No skills found. Run from the apex-forge root directory."
    );
    process.exit(1);
  }

  const targetDir = outputDir || PLATFORMS[platform].dir;
  convertSkills(platform, skills, targetDir);
}

// Run directly if invoked as script
if (import.meta.main) {
  main();
}

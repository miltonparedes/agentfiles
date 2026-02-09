import { readdirSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_DIR, RULES_DIR, HOOKS_DIR, dirExists } from "./config.ts";
import { extractFrontmatter, parseFrontmatter } from "./helpers.ts";
import { getSkillMeta } from "./skills.ts";

const SUBAGENTS_DIR = join(SKILLS_DIR, "..", "subagents");

export async function list() {
  console.log("📦 Skills:");
  if (dirExists(SKILLS_DIR)) {
    for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillDir = join(SKILLS_DIR, entry.name);
      const meta = await getSkillMeta(skillDir);
      if (!meta) continue;

      const desc = (await extractFrontmatter(join(skillDir, "SKILL.md"), "description")).slice(
        0,
        60,
      );
      const scopeTag = meta.scope === "project" ? "project" : "global";
      const langTag = meta.langs.length > 0 ? meta.langs.join(",") : "all";

      console.log(`  ${entry.name}`);
      console.log(`    scope: ${scopeTag}  langs: ${langTag}  targets: claude, codex, factory`);
      console.log(`    ${desc}`);
    }
  }

  console.log("");
  console.log("🤖 Agents (Claude Code only):");
  if (dirExists(SUBAGENTS_DIR)) {
    for (const entry of readdirSync(SUBAGENTS_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const agentPath = join(SUBAGENTS_DIR, entry.name);
      const agentName = entry.name.replace(/\.md$/, "");
      const desc = await extractFrontmatter(agentPath, "name");
      console.log(`  ${agentName} - ${desc}`);
    }
  }

  console.log("");
  console.log("📏 Rules:");
  if (dirExists(RULES_DIR)) {
    for (const entry of readdirSync(RULES_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const ruleName = entry.name.replace(/\.md$/, "");
      const { data } = await parseFrontmatter(join(RULES_DIR, entry.name));
      const paths = Array.isArray(data.paths) ? (data.paths as string[]).join(", ") : "all files";
      console.log(`  ${ruleName} (${paths}) -> claude, codex, factory`);
    }
  }

  console.log("");
  console.log("🪝 Hooks (Claude Code only):");
  let hookFound = 0;
  if (dirExists(HOOKS_DIR)) {
    for (const entry of readdirSync(HOOKS_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".sh") && !entry.name.endsWith(".bash")) continue;
      hookFound++;
      console.log(`  ${entry.name}`);
    }
  }
  if (hookFound === 0) {
    console.log("  (none — add .sh scripts to hooks/)");
  }
}

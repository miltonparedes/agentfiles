import {
  extractFrontmatterFromString,
  parseFrontmatterFromString,
} from "./helpers.ts";
import { getSkillMeta } from "./skills.ts";
import {
  listSkillDirsAsync,
  readSkillFile,
  listSubagentFiles,
  readSubagentContent,
  listRuleFiles,
  readRuleContent,
  listHookFiles,
} from "./assets.ts";

export async function list() {
  console.log("📦 Skills:");
  const skills = await listSkillDirsAsync();
  for (const skillName of skills) {
    const meta = await getSkillMeta(skillName);
    if (!meta) continue;

    const raw = await readSkillFile(skillName, "SKILL.md");
    const desc = raw
      ? extractFrontmatterFromString(raw, "description").slice(0, 60)
      : "";
    const scopeTag = meta.scope === "project" ? "project" : "global";
    const langTag = meta.langs.length > 0 ? meta.langs.join(",") : "all";

    console.log(`  ${skillName}`);
    console.log(
      `    scope: ${scopeTag}  langs: ${langTag}  targets: claude, codex, factory`,
    );
    console.log(`    ${desc}`);
  }

  console.log("");
  console.log("🤖 Agents (Claude Code only):");
  const agents = await listSubagentFiles();
  for (const fileName of agents) {
    const agentName = fileName.replace(/\.md$/, "");
    const raw = await readSubagentContent(fileName);
    const desc = raw ? extractFrontmatterFromString(raw, "name") : "";
    console.log(`  ${agentName} - ${desc}`);
  }

  console.log("");
  console.log("📏 Rules:");
  const ruleFiles = await listRuleFiles();
  for (const fileName of ruleFiles) {
    const ruleName = fileName.replace(/\.md$/, "");
    const raw = await readRuleContent(fileName);
    if (!raw) continue;
    const { data } = parseFrontmatterFromString(raw);
    const paths = Array.isArray(data.paths)
      ? (data.paths as string[]).join(", ")
      : "all files";
    console.log(`  ${ruleName} (${paths}) -> claude, codex, factory`);
  }

  console.log("");
  console.log("🪝 Hooks (Claude Code only):");
  const hookFiles = await listHookFiles();
  if (hookFiles.length === 0) {
    console.log("  (none — add .sh scripts to hooks/)");
  } else {
    for (const hookName of hookFiles) {
      console.log(`  ${hookName}`);
    }
  }
}

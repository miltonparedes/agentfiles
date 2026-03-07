import { extractFrontmatterFromString, parseFrontmatterFromString } from "./helpers.ts";
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

// ── Shared metadata types ────────────────────────────────────

export interface SkillInfo {
  name: string;
  scope: string;
  langs: string[];
  description: string;
}

export interface RuleInfo {
  name: string;
  paths: string;
  description: string;
}

export interface SubagentInfo {
  name: string;
  description: string;
}

export interface ResourceMetadata {
  skills: SkillInfo[];
  rules: RuleInfo[];
  hooks: string[];
  subagents: SubagentInfo[];
}

// ── Shared loader ────────────────────────────────────────────

export async function loadAllMetadata(): Promise<ResourceMetadata> {
  const skillDirs = await listSkillDirsAsync();
  const skills: SkillInfo[] = [];
  for (const skillName of skillDirs) {
    const meta = await getSkillMeta(skillName);
    if (!meta) continue;
    const raw = await readSkillFile(skillName, "SKILL.md");
    const desc = raw ? extractFrontmatterFromString(raw, "description").slice(0, 60) : "";
    skills.push({
      name: skillName,
      scope: meta.scope,
      langs: meta.langs,
      description: desc,
    });
  }

  const ruleFiles = await listRuleFiles();
  const rules: RuleInfo[] = [];
  for (const fileName of ruleFiles) {
    const ruleName = fileName.replace(/\.md$/, "");
    const raw = await readRuleContent(fileName);
    if (!raw) continue;
    const { data } = parseFrontmatterFromString(raw);
    const paths = Array.isArray(data.paths) ? (data.paths as string[]).join(", ") : "all files";
    const desc = (data.description as string) || `${ruleName} conventions`;
    rules.push({ name: ruleName, paths, description: desc });
  }

  const hooks = await listHookFiles();

  const agentFiles = await listSubagentFiles();
  const subagents: SubagentInfo[] = [];
  for (const fileName of agentFiles) {
    const agentName = fileName.replace(/\.md$/, "");
    const raw = await readSubagentContent(fileName);
    const desc = raw ? extractFrontmatterFromString(raw, "description") : "";
    subagents.push({ name: agentName, description: desc });
  }

  return { skills, rules, hooks, subagents };
}

// ── List command ─────────────────────────────────────────────

export async function list() {
  const meta = await loadAllMetadata();

  console.log("📦 Skills:");
  for (const s of meta.skills) {
    const langTag = s.langs.length > 0 ? s.langs.join(",") : "all";
    console.log(`  ${s.name}`);
    console.log(`    scope: ${s.scope}  langs: ${langTag}  targets: claude, codex, factory`);
    console.log(`    ${s.description}`);
  }

  console.log("");
  console.log("🤖 Agents (Claude Code only):");
  for (const a of meta.subagents) {
    console.log(`  ${a.name} - ${a.description}`);
  }

  console.log("");
  console.log("📏 Rules:");
  for (const r of meta.rules) {
    console.log(`  ${r.name} (${r.paths}) -> claude, codex, factory`);
  }

  console.log("");
  console.log("🪝 Hooks (Claude Code only):");
  if (meta.hooks.length === 0) {
    console.log("  (none — add .sh scripts to hooks/)");
  } else {
    for (const hookName of meta.hooks) {
      console.log(`  ${hookName}`);
    }
  }
}

import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { config, SKILLS_DIR, RULES_DIR, dirExists } from "./config.ts";
import { parseFrontmatter, buildRulesyncFrontmatter } from "./helpers.ts";
import { getSkillMeta } from "./skills.ts";

const TARGETS = ["claudecode", "codexcli", "factorydroid"];

export interface SyncOptions {
  features: ("skills" | "rules")[];
  global: boolean;
  langs?: Set<string>;
  filter?: { skill?: string; rule?: string };
  dryRun?: boolean;
}

export async function sync(opts: SyncOptions): Promise<void> {
  ensureRulesync();
  const cwd = process.cwd();
  guardExistingRulesync(cwd);

  try {
    await prepareTemp(cwd, opts);
    runRulesync(cwd, opts);
  } finally {
    cleanup(cwd);
  }
}

function ensureRulesync(): void {
  const result = Bun.spawnSync(["which", "rulesync"]);
  if (result.exitCode !== 0) {
    console.log("❌ rulesync not found. Install it first:");
    console.log("   npm i -g rulesync");
    process.exit(1);
  }
}

function guardExistingRulesync(cwd: string): void {
  if (
    dirExists(join(cwd, ".rulesync")) ||
    Bun.spawnSync(["test", "-f", join(cwd, "rulesync.jsonc")]).exitCode === 0
  ) {
    console.log(
      "❌ .rulesync/ or rulesync.jsonc already exists — this project may use rulesync natively",
    );
    process.exit(1);
  }
}

async function prepareTemp(cwd: string, opts: SyncOptions): Promise<void> {
  if (opts.features.includes("skills")) {
    await prepareSkills(cwd, opts);
  }
  if (opts.features.includes("rules")) {
    await prepareRules(cwd, opts);
  }

  const rulesyncConfig = {
    $schema:
      "https://raw.githubusercontent.com/dyoshikawa/rulesync/refs/heads/main/config-schema.json",
    targets: TARGETS,
    features: opts.features,
    global: opts.global,
    delete: false,
  };
  await Bun.write(join(cwd, "rulesync.jsonc"), JSON.stringify(rulesyncConfig, null, 2));
}

async function prepareSkills(cwd: string, opts: SyncOptions): Promise<void> {
  if (!dirExists(SKILLS_DIR)) return;

  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const skillDir = join(SKILLS_DIR, entry.name);
    const meta = await getSkillMeta(skillDir);
    if (!meta) continue;

    // Filter by scope
    if (opts.global && meta.scope !== "global") continue;
    if (!opts.global && meta.scope !== "project") continue;

    // Filter by lang if applicable
    if (opts.langs && meta.langs.length > 0) {
      const hasMatch = meta.langs.some((l) => opts.langs!.has(l));
      if (!hasMatch) continue;
    }

    // Filter by name if installing a single skill
    if (opts.filter?.skill && entry.name !== opts.filter.skill) continue;

    const destDir = join(cwd, ".rulesync", "skills", entry.name);
    await copyDirRecursive(skillDir, destDir);

    // Rewrite SKILL.md frontmatter: add targets
    const skillMd = join(destDir, "SKILL.md");
    const raw = await Bun.file(skillMd).text();
    const rewritten = addTargetsToFrontmatter(raw);
    await Bun.write(skillMd, rewritten);
  }
}

function addTargetsToFrontmatter(raw: string): string {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    // No frontmatter — wrap entire content
    const targetLines = TARGETS.map((t) => `  - ${t}`).join("\n");
    return `---\ntargets:\n${targetLines}\n---\n${raw}`;
  }

  const yaml = fmMatch[1];
  const body = fmMatch[2];
  const targetLines = TARGETS.map((t) => `  - ${t}`).join("\n");
  return `---\n${yaml}\ntargets:\n${targetLines}\n---\n${body}`;
}

async function prepareRules(cwd: string, opts: SyncOptions): Promise<void> {
  if (!dirExists(RULES_DIR)) return;

  const tempRulesDir = join(cwd, ".rulesync", "rules");
  mkdirSync(tempRulesDir, { recursive: true });

  for (const entry of readdirSync(RULES_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const ruleName = entry.name.replace(/\.md$/, "");

    // Filter by name if installing a single rule
    if (opts.filter?.rule && ruleName !== opts.filter.rule) continue;

    // Skip language-specific rules if language not detected (unless global/user-level with no filter)
    if (opts.langs && !opts.global) {
      if (ruleName === "typescript" && !opts.langs.has("typescript")) continue;
      if (ruleName === "python" && !opts.langs.has("python")) continue;
    }

    const srcPath = join(RULES_DIR, entry.name);
    const { data, content } = await parseFrontmatter(srcPath);

    const description = (data.description as string) || ruleName + " conventions";

    // Convert paths -> globs
    let globs: string[] | undefined;
    if (Array.isArray(data.paths)) {
      globs = data.paths as string[];
    } else if (Array.isArray(data.globs)) {
      globs = data.globs as string[];
    }

    const root = !globs;

    const frontmatter = buildRulesyncFrontmatter({
      description,
      root,
      globs,
      targets: TARGETS,
    });

    await Bun.write(join(tempRulesDir, entry.name), frontmatter + "\n" + content);
  }
}

function runRulesync(cwd: string, opts: SyncOptions): void {
  const args = ["rulesync", "generate"];

  if (opts.dryRun ?? config.dryRun) {
    args.push("--dry-run");
  }

  const result = Bun.spawnSync(args, { cwd, stdout: "inherit", stderr: "inherit" });

  if (result.exitCode !== 0) {
    console.log("❌ rulesync generate failed");
    process.exit(1);
  }
}

function cleanup(cwd: string): void {
  const rulesyncDir = join(cwd, ".rulesync");
  const configFile = join(cwd, "rulesync.jsonc");

  if (dirExists(rulesyncDir)) {
    rmSync(rulesyncDir, { recursive: true, force: true });
  }
  if (Bun.spawnSync(["test", "-f", configFile]).exitCode === 0) {
    rmSync(configFile, { force: true });
  }
}

async function copyDirRecursive(srcDir: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await Bun.write(destPath, Bun.file(srcPath));
    }
  }
}

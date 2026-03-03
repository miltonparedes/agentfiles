#!/usr/bin/env bun
import {
  config,
  IS_COMPILED,
  loadConfig,
  CONFIG_PATH,
  REPO_ROOT,
  HAS_REPO_PATH,
} from "./config.ts";
import { sync } from "./sync.ts";
import { installHooks } from "./hooks.ts";
import { installSubagents } from "./subagents.ts";
import { detectLanguages } from "./detect.ts";
import { list } from "./list.ts";
import { interactive } from "./interactive.ts";
import { setup } from "./setup.ts";
import { parseCliArgs, getUsageText, VERSION } from "./parser.ts";
import { listSkillDirsAsync, listRuleFiles, listSubagentFiles } from "./assets.ts";

// ── Helpers ────────────────────────────────────────────────────

async function installAll() {
  await sync({ features: ["skills"], global: true });
  await installHooks();
  await installSubagents();
  console.log("");
  const cmd = IS_COMPILED ? "af rules" : "bun cli/src/cli.ts rules";
  console.log(`✅ All installed. Rules are per-project — run '${cmd}' inside a project.`);
}

// ── Parse & dispatch ───────────────────────────────────────────

const scriptName = IS_COMPILED ? "af" : "bun cli/src/cli.ts";
const intent = parseCliArgs(Bun.argv.slice(2), scriptName);

switch (intent.type) {
  // ── Meta commands ──────────────────────────────────────────
  case "version":
    console.log(`af ${VERSION}`);
    process.exit(0);
    break;

  case "help":
    console.log(intent.text);
    process.exit(0);
    break;

  case "unknown":
    console.log(getUsageText(scriptName));
    process.exit(1);
    break;

  case "missingName":
    console.log(`❌ Usage: ${intent.command} <name>`);
    process.exit(1);
    break;

  // ── Family commands ────────────────────────────────────────
  case "install": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    if (intent.flags.all) {
      await installAll();
    } else {
      await interactive();
    }
    break;
  }

  case "skills": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    if (intent.flags.all) {
      await sync({ features: ["skills"], global: true });
    } else {
      await interactive("skills");
    }
    break;
  }

  case "rules": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    if (intent.flags.all) {
      if (config.userLevel) {
        await sync({ features: ["rules"], global: true });
      } else {
        const cwd = process.cwd();
        const langs = detectLanguages(cwd);
        const langList = langs.size > 0 ? [...langs].join(", ") : "none";
        console.log(`Detected languages: ${langList}`);
        await sync({ features: ["rules"], global: false, langs });
      }
    } else {
      await interactive("rules");
    }
    break;
  }

  case "hooks": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    if (intent.flags.all) {
      await installHooks(undefined, config.userLevel);
    } else {
      await interactive("hooks");
    }
    break;
  }

  case "subagents": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    if (intent.flags.all) {
      await installSubagents(undefined, config.userLevel);
    } else {
      await interactive("subagents");
    }
    break;
  }

  // ── Singular commands ──────────────────────────────────────
  case "skill": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    const knownSkills = await listSkillDirsAsync();
    if (!knownSkills.includes(intent.name)) {
      console.error(
        `❌ Unknown skill: "${intent.name}". Available skills: ${knownSkills.join(", ") || "(none)"}`,
      );
      process.exit(1);
    }
    await sync({
      features: ["skills"],
      global: true,
      filter: { skill: intent.name },
    });
    break;
  }

  case "rule": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    const knownRuleFiles = await listRuleFiles();
    const knownRules = knownRuleFiles.map((f) => f.replace(/\.md$/, ""));
    if (!knownRules.includes(intent.name)) {
      console.error(
        `❌ Unknown rule: "${intent.name}". Available rules: ${knownRules.join(", ") || "(none)"}`,
      );
      process.exit(1);
    }
    const langs = config.userLevel ? undefined : detectLanguages(process.cwd());
    await sync({
      features: ["rules"],
      global: config.userLevel,
      filter: { rule: intent.name },
      langs,
    });
    break;
  }

  case "subagent": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    const knownSubagentFiles = await listSubagentFiles();
    const knownSubagents = knownSubagentFiles.map((f) => f.replace(/\.md$/, ""));
    if (!knownSubagents.includes(intent.name)) {
      console.error(
        `❌ Unknown subagent: "${intent.name}". Available subagents: ${knownSubagents.join(", ") || "(none)"}`,
      );
      process.exit(1);
    }
    await installSubagents([intent.name], config.userLevel);
    break;
  }

  // ── Utility commands ───────────────────────────────────────
  case "list":
    await list();
    break;

  case "setup":
    await setup(intent.path);
    break;

  case "config": {
    const cfg = loadConfig();
    console.log(`Config file: ${CONFIG_PATH}`);
    if (cfg.repoPath) {
      const valid = HAS_REPO_PATH;
      console.log(`Repo path:   ${cfg.repoPath} ${valid ? "✓" : "✗ (not found)"}`);
    } else {
      console.log("Repo path:   (not set)");
    }
    console.log(`Resolved:    ${REPO_ROOT}`);
    break;
  }
}

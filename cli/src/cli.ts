#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { config, IS_COMPILED } from "./config.ts";
import { sync } from "./sync.ts";
import { installHooks } from "./hooks.ts";
import { installSubagents } from "./subagents.ts";
import { detectLanguages } from "./detect.ts";
import { list } from "./list.ts";
import { interactive } from "./interactive.tsx";

const VERSION = "0.1.0";

async function installAll() {
  await sync({ features: ["skills"], global: true });
  await installHooks();
  await installSubagents();
  console.log("");
  const cmd = IS_COMPILED ? "af rules" : "bun cli/src/cli.ts rules";
  console.log(`✅ All installed. Rules are per-project — run '${cmd}' inside a project.`);
}

function showUsage(): void {
  const bin = IS_COMPILED ? "af" : "bun cli/src/cli.ts";
  console.log(`Usage: ${bin} [command] [flags]`);
  console.log("");
  console.log("Commands:");
  console.log("  install              Interactive selection (default)");
  console.log("  skills               Interactive skill selection");
  console.log("  rules                Interactive rule selection");
  console.log("  hooks                Interactive hook selection");
  console.log("  subagents            Interactive subagent selection");
  console.log("  skill <name>         Install one skill");
  console.log("  rule <name>          Install one rule to project");
  console.log("  subagent <name>      Install one subagent");
  console.log("  list                 Show available resources");
  console.log("");
  console.log("Flags:");
  console.log("  -y, --all            Install everything (skip interactive)");
  console.log("  -n, --dry-run        Preview changes");
  console.log("  -u, --user           Install to user-level (~/)");
  console.log("  -v, --version        Show version");
}

// ── CLI parsing ────────────────────────────────────────────────

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "dry-run": { type: "boolean", short: "n", default: false },
    user: { type: "boolean", short: "u", default: false },
    version: { type: "boolean", short: "v", default: false },
    all: { type: "boolean", short: "y", default: false },
  },
  strict: false,
  allowPositionals: true,
});

if (values.version) {
  console.log(`af ${VERSION}`);
  process.exit(0);
}

config.dryRun = values["dry-run"] || !!Bun.env.DRY_RUN;
config.userLevel = values.user || !!Bun.env.USER_LEVEL;

// ── Dispatch ───────────────────────────────────────────────────

const command = positionals[0] ?? "install";

switch (command) {
  case "install":
    if (values.all) {
      await installAll();
    } else {
      await interactive();
    }
    break;
  case "skills":
    if (values.all) {
      await sync({ features: ["skills"], global: true });
    } else {
      await interactive("skills");
    }
    break;
  case "rules":
    if (values.all) {
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
  case "hooks":
    if (values.all) {
      await installHooks();
    } else {
      await interactive("hooks");
    }
    break;
  case "subagents":
    if (values.all) {
      await installSubagents(undefined, config.userLevel);
    } else {
      await interactive("subagents");
    }
    break;
  case "skill":
    await sync({
      features: ["skills"],
      global: true,
      filter: { skill: positionals[1] },
    });
    break;
  case "rule": {
    const ruleName = positionals[1];
    if (!ruleName) {
      console.log("❌ Usage: rule <name>");
      process.exit(1);
    }
    const langs = config.userLevel ? undefined : detectLanguages(process.cwd());
    await sync({
      features: ["rules"],
      global: config.userLevel,
      filter: { rule: ruleName },
      langs,
    });
    break;
  }
  case "subagent": {
    const name = positionals[1];
    if (!name) {
      console.log("❌ Usage: subagent <name>");
      process.exit(1);
    }
    await installSubagents([name], config.userLevel);
    break;
  }
  case "list":
    await list();
    break;
  default:
    showUsage();
    process.exit(1);
}

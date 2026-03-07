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
import { parseCliArgs, getUsageText, VERSION, KNOWN_AGENTS } from "./parser.ts";
import type { AgentTarget } from "./parser.ts";
import { listSkillDirsAsync, listRuleFiles, listSubagentFiles } from "./assets.ts";
import {
  filterSupportedTargets,
  warnUnsupported,
  type ArtifactCategory,
} from "./support-matrix.ts";

// ── Helpers ────────────────────────────────────────────────────

/**
 * Check support for a single category against explicit targets.
 * Returns the supported target list (may be empty) after emitting warnings.
 * When no explicit targets are given, returns undefined (use defaults).
 */
function checkCategorySupport(
  category: ArtifactCategory,
  explicitTargets: AgentTarget[] | undefined,
): string[] | undefined {
  if (!explicitTargets) return undefined;
  const { supported, unsupported } = filterSupportedTargets(category, explicitTargets);
  warnUnsupported(unsupported);
  return supported;
}

async function installAll(targets?: string[]) {
  const global = config.userLevel;
  const agentTargets = targets as AgentTarget[] | undefined;

  let didWork = false;

  // Skills — supported by all targets
  const skillTargets = checkCategorySupport("skills", agentTargets);
  if (!agentTargets || (skillTargets && skillTargets.length > 0)) {
    await sync({ features: ["skills"], global, targets: skillTargets ?? targets });
    didWork = true;
  }

  // Hooks — may be unsupported for some targets
  const hookTargets = checkCategorySupport("hooks", agentTargets);
  if (!agentTargets || (hookTargets && hookTargets.length > 0)) {
    await installHooks(undefined, global);
    didWork = true;
  }

  // Subagents — may be unsupported for some targets
  const subagentTargets = checkCategorySupport("subagents", agentTargets);
  if (!agentTargets || (subagentTargets && subagentTargets.length > 0)) {
    await installSubagents(undefined, global);
    didWork = true;
  }

  // Rules — supported by all targets
  if (!global) {
    const ruleTargets = checkCategorySupport("rules", agentTargets);
    if (!agentTargets || (ruleTargets && ruleTargets.length > 0)) {
      const cwd = process.cwd();
      const langs = detectLanguages(cwd);
      const langList = langs.size > 0 ? [...langs].join(", ") : "none";
      console.log(`Detected languages: ${langList}`);
      if (langs.size === 0) {
        console.log(
          "⚠️  No supported language detected — skipping project rules. " + "No rules to install.",
        );
      } else {
        await sync({ features: ["rules"], global: false, langs, targets: ruleTargets ?? targets });
        didWork = true;
      }
    }
  }

  console.log("");
  if (!didWork) {
    console.log("⚠️  Nothing to install — all requested combinations are unsupported.");
  } else if (global) {
    const cmd = IS_COMPILED ? "af rules" : "bun cli/src/cli.ts rules";
    console.log(`✅ All installed. Rules are per-project — run '${cmd}' inside a project.`);
  } else {
    console.log("✅ All installed to project scope.");
  }
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

  case "invalidAgent":
    console.error(
      `❌ Invalid agent target(s): ${intent.invalid.map((a) => `"${a}"`).join(", ")}. ` +
        `Valid agents: ${KNOWN_AGENTS.join(", ")}`,
    );
    process.exit(1);
    break;

  // ── Family commands ────────────────────────────────────────
  case "install": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    const targets = intent.flags.agent ?? undefined;
    if (intent.flags.all) {
      await installAll(targets);
    } else {
      await interactive(undefined, targets);
    }
    break;
  }

  case "skills": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    const targets = intent.flags.agent ?? undefined;
    if (intent.flags.all) {
      await sync({ features: ["skills"], global: config.userLevel, targets });
    } else {
      await interactive("skills", targets);
    }
    break;
  }

  case "rules": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    const targets = intent.flags.agent ?? undefined;
    if (intent.flags.all) {
      if (config.userLevel) {
        await sync({ features: ["rules"], global: true, targets });
      } else {
        const cwd = process.cwd();
        const langs = detectLanguages(cwd);
        const langList = langs.size > 0 ? [...langs].join(", ") : "none";
        console.log(`Detected languages: ${langList}`);
        if (langs.size === 0) {
          console.log(
            "⚠️  No supported language detected — skipping project rules. " +
              "No rules to install.",
          );
        } else {
          await sync({ features: ["rules"], global: false, langs, targets });
        }
      }
    } else {
      await interactive("rules", targets);
    }
    break;
  }

  case "hooks": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    const hookAgentTargets = intent.flags.agent ?? undefined;
    const supportedHookTargets = checkCategorySupport("hooks", hookAgentTargets);
    if (hookAgentTargets && (!supportedHookTargets || supportedHookTargets.length === 0)) {
      // Fully unsupported — no-op with warnings already emitted
      console.log("\n⚠️  Nothing to install — all requested combinations are unsupported.");
      break;
    }
    if (intent.flags.all) {
      await installHooks(undefined, config.userLevel);
    } else {
      await interactive("hooks", hookAgentTargets);
    }
    break;
  }

  case "subagents": {
    config.dryRun = intent.flags.dryRun || !!Bun.env.DRY_RUN;
    config.userLevel = intent.flags.user || !!Bun.env.USER_LEVEL;
    const subagentAgentTargets = intent.flags.agent ?? undefined;
    const supportedSubagentTargets = checkCategorySupport("subagents", subagentAgentTargets);
    if (
      subagentAgentTargets &&
      (!supportedSubagentTargets || supportedSubagentTargets.length === 0)
    ) {
      // Fully unsupported — no-op with warnings already emitted
      console.log("\n⚠️  Nothing to install — all requested combinations are unsupported.");
      break;
    }
    if (intent.flags.all) {
      await installSubagents(undefined, config.userLevel);
    } else {
      await interactive("subagents", subagentAgentTargets);
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
    const skillSingularTargets = checkCategorySupport("skills", intent.flags.agent ?? undefined);
    if (intent.flags.agent && (!skillSingularTargets || skillSingularTargets.length === 0)) {
      console.log("\n⚠️  Nothing to install — all requested combinations are unsupported.");
      break;
    }
    await sync({
      features: ["skills"],
      global: config.userLevel,
      targets: skillSingularTargets ?? intent.flags.agent ?? undefined,
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
    const ruleSingularTargets = checkCategorySupport("rules", intent.flags.agent ?? undefined);
    if (intent.flags.agent && (!ruleSingularTargets || ruleSingularTargets.length === 0)) {
      console.log("\n⚠️  Nothing to install — all requested combinations are unsupported.");
      break;
    }
    const langs = config.userLevel ? undefined : detectLanguages(process.cwd());
    await sync({
      features: ["rules"],
      global: config.userLevel,
      targets: ruleSingularTargets ?? intent.flags.agent ?? undefined,
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
    const subagentSingularTargets = checkCategorySupport(
      "subagents",
      intent.flags.agent ?? undefined,
    );
    if (intent.flags.agent && (!subagentSingularTargets || subagentSingularTargets.length === 0)) {
      console.log("\n⚠️  Nothing to install — all requested combinations are unsupported.");
      break;
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

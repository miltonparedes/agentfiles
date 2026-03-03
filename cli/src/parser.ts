import yargs from "yargs";
import type { Argv } from "yargs";

export const VERSION = "0.1.0";

// ── Flag / intent types ────────────────────────────────────────

// ── Known agent targets ────────────────────────────────────────

/** Canonical set of supported agent/target identifiers (sorted). */
export const KNOWN_AGENTS = ["claudecode", "codexcli", "factorydroid"] as const;
export type AgentTarget = (typeof KNOWN_AGENTS)[number];

const KNOWN_AGENTS_SET = new Set<string>(KNOWN_AGENTS);

/**
 * Validate and normalise a raw `--agent` value (comma-separated string or
 * repeated flags) into a deduplicated, deterministically-sorted array of
 * valid agent targets.
 *
 * Returns `{ agents, invalid }` where `invalid` contains any values that
 * are not recognised.
 */
export function resolveAgents(raw: string[]): { agents: AgentTarget[]; invalid: string[] } {
  // Flatten comma-separated entries and trim whitespace
  const flat = raw.flatMap((v) => v.split(",").map((s) => s.trim().toLowerCase())).filter(Boolean);

  const seen = new Set<string>();
  const agents: AgentTarget[] = [];
  const invalid: string[] = [];

  for (const token of flat) {
    if (seen.has(token)) continue;
    seen.add(token);
    if (KNOWN_AGENTS_SET.has(token)) {
      agents.push(token as AgentTarget);
    } else {
      invalid.push(token);
    }
  }

  // Deterministic order: sort by canonical position
  agents.sort((a, b) => KNOWN_AGENTS.indexOf(a) - KNOWN_AGENTS.indexOf(b));

  return { agents, invalid };
}

export interface GlobalFlags {
  dryRun: boolean;
  user: boolean;
  all: boolean;
  agent: AgentTarget[] | undefined;
}

export type CommandIntent =
  | { type: "version" }
  | { type: "help"; text: string }
  | { type: "install"; flags: GlobalFlags }
  | { type: "skills"; flags: GlobalFlags }
  | { type: "rules"; flags: GlobalFlags }
  | { type: "hooks"; flags: GlobalFlags }
  | { type: "subagents"; flags: GlobalFlags }
  | { type: "skill"; name: string; flags: GlobalFlags }
  | { type: "rule"; name: string; flags: GlobalFlags }
  | { type: "subagent"; name: string; flags: GlobalFlags }
  | { type: "list"; flags: GlobalFlags }
  | { type: "setup"; path?: string; flags: GlobalFlags }
  | { type: "config"; flags: GlobalFlags }
  | { type: "missingName"; command: string }
  | { type: "unknown"; input: string }
  | { type: "invalidAgent"; invalid: string[]; command: string };

// ── Known command sets ─────────────────────────────────────────

const SINGULAR_COMMANDS = new Set(["skill", "rule", "subagent"]);
const FAMILY_COMMANDS = new Set(["install", "skills", "rules", "hooks", "subagents"]);
const UTIL_COMMANDS = new Set(["list", "setup", "config"]);

function isKnownCommand(cmd: string): boolean {
  return SINGULAR_COMMANDS.has(cmd) || FAMILY_COMMANDS.has(cmd) || UTIL_COMMANDS.has(cmd);
}

// ── Yargs builder ──────────────────────────────────────────────

interface ParserOptions {
  all: boolean;
  "dry-run": boolean;
  user: boolean;
  agent: string[];
}

/**
 * Build a yargs instance for parsing.  `--version` / `-v` are handled
 * **before** yargs runs (see {@link parseCliArgs}), so we disable the
 * built-in version behaviour and avoid registering "version" as an option
 * (which yargs treats as reserved).
 */
export function buildParser(argv: string[], scriptName = "af"): Argv<ParserOptions> {
  return yargs(argv)
    .scriptName(scriptName)
    .usage(
      `Usage: ${scriptName} [command] [flags]\n\n` +
        "Commands:\n" +
        "  install              Interactive selection (default)\n" +
        "  skills               Interactive skill selection\n" +
        "  rules                Interactive rule selection\n" +
        "  hooks                Interactive hook selection\n" +
        "  subagents            Interactive subagent selection\n" +
        "  skill <name>         Install one skill\n" +
        "  rule <name>          Install one rule to project\n" +
        "  subagent <name>      Install one subagent\n" +
        "  list                 Show available resources\n" +
        "  setup                Install af and save repo location\n" +
        "  config               Show current configuration\n\n" +
        "Flags:\n" +
        "  -v, --version        Show version",
    )
    .option("all", {
      alias: "y",
      type: "boolean" as const,
      default: false,
      describe: "Install everything (skip interactive)",
    })
    .option("dry-run", {
      alias: "n",
      type: "boolean" as const,
      default: false,
      describe: "Preview changes",
    })
    .option("user", {
      alias: "u",
      type: "boolean" as const,
      default: false,
      describe: "Install to user-level (~/)",
    })
    .option("agent", {
      alias: "target",
      type: "string" as const,
      array: true,
      default: [] as string[],
      describe: "Agent target(s): claudecode, codexcli, factorydroid",
    })
    .version(false)
    .help("help")
    .exitProcess(false);
}

// ── Public parser ──────────────────────────────────────────────

/**
 * Parse raw CLI argv (without the leading bun/node path) and return a typed
 * {@link CommandIntent} representing the resolved user intent.
 *
 * The function is pure (no side-effects, no process.exit) so it can be
 * unit-tested in isolation.
 */
export function parseCliArgs(argv: string[], scriptName = "af"): CommandIntent {
  // ── 1. Version flag has highest priority ─────────────────────
  // Check raw argv so -v always wins regardless of position.
  if (argv.includes("--version") || argv.includes("-v")) {
    return { type: "version" };
  }

  // ── 2. Help flag ─────────────────────────────────────────────
  if (argv.includes("--help")) {
    const parser = buildParser([], scriptName);
    let helpText = "";
    parser.showHelp((s: string) => {
      helpText = s;
    });
    return { type: "help", text: helpText };
  }

  // ── 3. Parse via yargs ───────────────────────────────────────
  const parser = buildParser(argv, scriptName);
  const parsed = parser.parseSync();

  // ── 4. Resolve positionals ────────────────────────────────────
  const positionals = parsed._ as (string | number)[];
  const rawCmd = positionals.length > 0 ? String(positionals[0]) : "";

  // ── Resolve agent targets ──────────────────────────────────
  const rawAgent = (parsed.agent ?? []).map(String);
  let agentTargets: AgentTarget[] | undefined;

  if (rawAgent.length > 0) {
    const { agents, invalid } = resolveAgents(rawAgent);
    const earlyCmd = rawCmd || "install";

    if (invalid.length > 0) {
      return {
        type: "invalidAgent",
        invalid,
        command: earlyCmd,
      };
    }
    agentTargets = agents.length > 0 ? agents : undefined;
  }

  const flags: GlobalFlags = {
    dryRun: !!parsed["dry-run"],
    user: !!parsed.user,
    all: !!parsed.all,
    agent: agentTargets,
  };
  const command = rawCmd || "install";

  if (!isKnownCommand(command)) {
    return { type: "unknown", input: command };
  }

  // ── 5. Singular commands require <name> ──────────────────────
  if (SINGULAR_COMMANDS.has(command)) {
    const name = positionals.length > 1 ? String(positionals[1]) : undefined;
    if (!name) {
      return { type: "missingName", command };
    }
    return { type: command as "skill" | "rule" | "subagent", name, flags };
  }

  // ── 6. Setup with optional path ────────────────────────────────
  if (command === "setup") {
    const path = positionals.length > 1 ? String(positionals[1]) : undefined;
    return { type: "setup", ...(path ? { path } : {}), flags };
  }

  // ── 7. Family / util commands ────────────────────────────────
  return { type: command, flags } as CommandIntent;
}

/**
 * Generate the usage/help text that should be shown for `--help` or unknown
 * commands.  Uses yargs internally so the output stays in sync with the
 * option definitions.
 */
export function getUsageText(scriptName = "af"): string {
  const parser = buildParser([], scriptName);
  let text = "";
  parser.showHelp((s: string) => {
    text = s;
  });
  return text;
}

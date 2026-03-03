import yargs from "yargs";
import type { Argv } from "yargs";

export const VERSION = "0.1.0";

// ── Flag / intent types ────────────────────────────────────────

export interface GlobalFlags {
  dryRun: boolean;
  user: boolean;
  all: boolean;
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
  | { type: "setup"; flags: GlobalFlags }
  | { type: "config"; flags: GlobalFlags }
  | { type: "missingName"; command: string }
  | { type: "unknown"; input: string };

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

  const flags: GlobalFlags = {
    dryRun: !!parsed["dry-run"],
    user: !!parsed.user,
    all: !!parsed.all,
  };

  // ── 4. Resolve command ───────────────────────────────────────
  const positionals = parsed._ as (string | number)[];
  const rawCmd = positionals.length > 0 ? String(positionals[0]) : "";
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

  // ── 6. Family / util commands ────────────────────────────────
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

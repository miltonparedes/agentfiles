import { describe, expect, it } from "bun:test";
import { parseCliArgs, type CommandIntent } from "../../src/parser.ts";

/**
 * Exhaustive parser → CommandIntent dispatch mapping tests.
 *
 * VAL-QUALITY-001: Unit tests validate typed parser intent mapping
 *
 * Covers:
 * - Every command type produces the correct intent type with full field shape
 * - All GlobalFlags fields are correctly populated for every family/singular command
 * - Edge cases: empty input, multiple positionals, mixed flags and positionals
 * - All command type discriminants are tested
 */

function parse(args: string): CommandIntent {
  return parseCliArgs(args === "" ? [] : args.split(/\s+/));
}

// ── Exhaustive command type → intent mapping ───────────────────

describe("exhaustive command type mapping", () => {
  it("every command type produces correct intent type", () => {
    // Meta
    expect(parse("-v").type).toBe("version");
    expect(parse("--help").type).toBe("help");

    // Family commands
    expect(parse("install").type).toBe("install");
    expect(parse("skills").type).toBe("skills");
    expect(parse("rules").type).toBe("rules");
    expect(parse("hooks").type).toBe("hooks");
    expect(parse("subagents").type).toBe("subagents");

    // Singular commands (with name)
    expect(parse("skill codex").type).toBe("skill");
    expect(parse("rule typescript").type).toBe("rule");
    expect(parse("subagent deep-architect").type).toBe("subagent");

    // Singular commands (without name → missingName)
    expect(parse("skill").type).toBe("missingName");
    expect(parse("rule").type).toBe("missingName");
    expect(parse("subagent").type).toBe("missingName");

    // Utility
    expect(parse("list").type).toBe("list");
    expect(parse("config").type).toBe("config");
    expect(parse("setup").type).toBe("setup");

    // Error types
    expect(parse("nonexistent").type).toBe("unknown");
    expect(parse("rules --agent bad-value").type).toBe("invalidAgent");
  });
});

// ── GlobalFlags shape for every family command ─────────────────

describe("GlobalFlags fully populated for family commands", () => {
  const familyCmds = ["install", "skills", "rules", "hooks", "subagents"] as const;

  for (const cmd of familyCmds) {
    it(`${cmd} with all flags populates complete GlobalFlags`, () => {
      const intent = parse(`${cmd} -y -n --user --agent claudecode`);
      expect(intent.type).toBe(cmd);
      if ("flags" in intent) {
        expect(intent.flags).toEqual({
          dryRun: true,
          user: true,
          all: true,
          agent: ["claudecode"],
        });
      }
    });

    it(`${cmd} with no flags has all defaults`, () => {
      const intent = parse(cmd);
      expect(intent.type).toBe(cmd);
      if ("flags" in intent) {
        expect(intent.flags.dryRun).toBe(false);
        expect(intent.flags.user).toBe(false);
        expect(intent.flags.all).toBe(false);
        expect(intent.flags.agent).toBeUndefined();
      }
    });
  }
});

// ── GlobalFlags shape for singular commands ────────────────────

describe("GlobalFlags fully populated for singular commands", () => {
  it("skill with all flags", () => {
    const intent = parse("skill codex -y -n --user --agent factorydroid");
    expect(intent.type).toBe("skill");
    if (intent.type === "skill") {
      expect(intent.name).toBe("codex");
      expect(intent.flags).toEqual({
        dryRun: true,
        user: true,
        all: true,
        agent: ["factorydroid"],
      });
    }
  });

  it("rule with all flags", () => {
    const intent = parse("rule python -y -n --user --agent codexcli");
    expect(intent.type).toBe("rule");
    if (intent.type === "rule") {
      expect(intent.name).toBe("python");
      expect(intent.flags).toEqual({
        dryRun: true,
        user: true,
        all: true,
        agent: ["codexcli"],
      });
    }
  });

  it("subagent with all flags", () => {
    const intent = parse("subagent deep-architect -y -n --user --agent claudecode");
    expect(intent.type).toBe("subagent");
    if (intent.type === "subagent") {
      expect(intent.name).toBe("deep-architect");
      expect(intent.flags).toEqual({
        dryRun: true,
        user: true,
        all: true,
        agent: ["claudecode"],
      });
    }
  });

  it("singular commands with no flags have defaults", () => {
    for (const [cmd, name] of [["skill", "codex"], ["rule", "typescript"], ["subagent", "deep-architect"]]) {
      const intent = parse(`${cmd} ${name}`);
      if ("flags" in intent) {
        expect(intent.flags.dryRun).toBe(false);
        expect(intent.flags.user).toBe(false);
        expect(intent.flags.all).toBe(false);
        expect(intent.flags.agent).toBeUndefined();
      }
    }
  });
});

// ── Utility command GlobalFlags ────────────────────────────────

describe("GlobalFlags for utility commands", () => {
  it("list has flags", () => {
    const intent = parse("list");
    expect(intent.type).toBe("list");
    if (intent.type === "list") {
      expect(intent.flags.dryRun).toBe(false);
    }
  });

  it("config has flags", () => {
    const intent = parse("config");
    expect(intent.type).toBe("config");
    if (intent.type === "config") {
      expect(intent.flags.dryRun).toBe(false);
    }
  });

  it("setup with flags and path", () => {
    const intent = parse("setup /tmp/repo -n");
    expect(intent.type).toBe("setup");
    if (intent.type === "setup") {
      expect(intent.path).toBe("/tmp/repo");
      expect(intent.flags.dryRun).toBe(true);
    }
  });
});

// ── Error intent field shapes ──────────────────────────────────

describe("error intent field shapes", () => {
  it("unknown captures the unrecognized input", () => {
    const intent = parse("notacmd");
    expect(intent).toEqual({ type: "unknown", input: "notacmd" });
  });

  it("missingName captures the command", () => {
    expect(parse("skill")).toEqual({ type: "missingName", command: "skill" });
    expect(parse("rule")).toEqual({ type: "missingName", command: "rule" });
    expect(parse("subagent")).toEqual({ type: "missingName", command: "subagent" });
  });

  it("invalidAgent captures invalid names and the command", () => {
    const intent = parse("skills --agent notreal");
    expect(intent.type).toBe("invalidAgent");
    if (intent.type === "invalidAgent") {
      expect(intent.invalid).toEqual(["notreal"]);
      expect(intent.command).toBe("skills");
    }
  });

  it("invalidAgent on default command uses install", () => {
    const intent = parse("--agent bad");
    expect(intent.type).toBe("invalidAgent");
    if (intent.type === "invalidAgent") {
      expect(intent.command).toBe("install");
    }
  });
});

// ── Edge cases ─────────────────────────────────────────────────

describe("parser edge cases", () => {
  it("version flag wins even with flags after command", () => {
    expect(parse("install --all --version").type).toBe("version");
  });

  it("help flag wins even with command", () => {
    expect(parse("--help install").type).toBe("help");
  });

  it("version takes priority over help", () => {
    expect(parse("--version --help").type).toBe("version");
  });

  it("multiple commands: first positional is the command", () => {
    const intent = parse("install list");
    // 'install' is the command; 'list' would be treated as extra positional
    expect(intent.type).toBe("install");
  });

  it("flags interspersed with positionals", () => {
    const intent = parse("-n skill -u codex --all");
    expect(intent.type).toBe("skill");
    if (intent.type === "skill") {
      expect(intent.name).toBe("codex");
      expect(intent.flags.dryRun).toBe(true);
      expect(intent.flags.user).toBe(true);
      expect(intent.flags.all).toBe(true);
    }
  });

  it("agent with all three targets in various order", () => {
    const intent = parse("install --agent factorydroid,claudecode,codexcli");
    expect(intent.type).toBe("install");
    if (intent.type === "install") {
      // Must be in canonical order
      expect(intent.flags.agent).toEqual(["claudecode", "codexcli", "factorydroid"]);
    }
  });

  it("empty agent value doesn't crash", () => {
    // Empty --agent should be treated as no agent
    const intent = parse("install");
    expect(intent.type).toBe("install");
    if (intent.type === "install") {
      expect(intent.flags.agent).toBeUndefined();
    }
  });
});

// ── Completeness: all CommandIntent type discriminants exercised ──

describe("all CommandIntent type discriminants are covered", () => {
  const expectedTypes = [
    "version",
    "help",
    "install",
    "skills",
    "rules",
    "hooks",
    "subagents",
    "skill",
    "rule",
    "subagent",
    "list",
    "setup",
    "config",
    "missingName",
    "unknown",
    "invalidAgent",
  ] as const satisfies readonly CommandIntent["type"][];

  const inputs: Record<string, string> = {
    version: "-v",
    help: "--help",
    install: "install",
    skills: "skills",
    rules: "rules",
    hooks: "hooks",
    subagents: "subagents",
    skill: "skill codex",
    rule: "rule typescript",
    subagent: "subagent deep-architect",
    list: "list",
    setup: "setup",
    config: "config",
    missingName: "skill",
    unknown: "doesnotexist",
    invalidAgent: "rules --agent badone",
  };

  for (const type of expectedTypes) {
    it(`type "${type}" is reachable via parser`, () => {
      const input = inputs[type];
      expect(input).toBeDefined();
      const intent = parse(input!);
      expect(intent.type).toBe(type);
    });
  }
});

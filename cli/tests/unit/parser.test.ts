import { describe, expect, it } from "bun:test";
import { parseCliArgs, resolveAgents, KNOWN_AGENTS, VERSION, type CommandIntent } from "../../src/parser.ts";

// ── Helper ─────────────────────────────────────────────────────

function parse(args: string): CommandIntent {
  return parseCliArgs(args === "" ? [] : args.split(/\s+/));
}

// ── Version (VAL-CORE-001) ─────────────────────────────────────

describe("version flag", () => {
  it("-v returns version intent", () => {
    expect(parse("-v")).toEqual({ type: "version" });
  });

  it("--version returns version intent", () => {
    expect(parse("--version")).toEqual({ type: "version" });
  });

  it("-v takes priority over command", () => {
    expect(parse("list -v")).toEqual({ type: "version" });
  });

  it("--version takes priority over command", () => {
    expect(parse("config --version")).toEqual({ type: "version" });
  });
});

// ── Help (VAL-CORE-003A) ──────────────────────────────────────

describe("help flag", () => {
  it("--help returns help intent with text", () => {
    const intent = parse("--help");
    expect(intent.type).toBe("help");
    if (intent.type === "help") {
      expect(intent.text).toContain("Usage:");
      expect(intent.text).toContain("install");
    }
  });
});

// ── Default command (VAL-CORE-002) ─────────────────────────────

describe("default command", () => {
  it("no args defaults to install", () => {
    const intent = parse("");
    expect(intent.type).toBe("install");
    if (intent.type === "install") {
      expect(intent.flags).toEqual({ dryRun: false, user: false, all: false, agent: undefined });
    }
  });

  it("no args with --all defaults to install --all", () => {
    const intent = parse("--all");
    expect(intent.type).toBe("install");
    if (intent.type === "install") {
      expect(intent.flags.all).toBe(true);
    }
  });
});

// ── Unknown command (VAL-CORE-003) ─────────────────────────────

describe("unknown command", () => {
  it("returns unknown intent for unrecognized command", () => {
    expect(parse("unknowncmd")).toEqual({ type: "unknown", input: "unknowncmd" });
  });

  it("returns unknown intent for another unrecognized command", () => {
    expect(parse("foobar")).toEqual({ type: "unknown", input: "foobar" });
  });
});

// ── Singular commands (VAL-CORE-004) ───────────────────────────

describe("singular commands require name", () => {
  it("skill without name returns missingName", () => {
    expect(parse("skill")).toEqual({ type: "missingName", command: "skill" });
  });

  it("rule without name returns missingName", () => {
    expect(parse("rule")).toEqual({ type: "missingName", command: "rule" });
  });

  it("subagent without name returns missingName", () => {
    expect(parse("subagent")).toEqual({ type: "missingName", command: "subagent" });
  });

  it("skill with name works", () => {
    const intent = parse("skill codex");
    expect(intent.type).toBe("skill");
    if (intent.type === "skill") {
      expect(intent.name).toBe("codex");
    }
  });

  it("rule with name works", () => {
    const intent = parse("rule typescript");
    expect(intent.type).toBe("rule");
    if (intent.type === "rule") {
      expect(intent.name).toBe("typescript");
    }
  });

  it("subagent with name works", () => {
    const intent = parse("subagent deep-architect");
    expect(intent.type).toBe("subagent");
    if (intent.type === "subagent") {
      expect(intent.name).toBe("deep-architect");
    }
  });
});

// ── Short / long flag equivalence (VAL-CORE-008) ──────────────

describe("short and long flags are equivalent", () => {
  it("-y equals --all", () => {
    const a = parse("install -y");
    const b = parse("install --all");
    expect(a).toEqual(b);
  });

  it("-n equals --dry-run", () => {
    const a = parse("install -n");
    const b = parse("install --dry-run");
    expect(a).toEqual(b);
  });

  it("-u equals --user", () => {
    const a = parse("install -u");
    const b = parse("install --user");
    expect(a).toEqual(b);
  });

  it("-v equals --version", () => {
    const a = parse("-v");
    const b = parse("--version");
    expect(a).toEqual(b);
  });
});

// ── Flag order independence (VAL-CORE-009) ─────────────────────

describe("flag order does not change intent", () => {
  it("--dry-run skills --all equals skills --all --dry-run", () => {
    const a = parse("--dry-run skills --all");
    const b = parse("skills --all --dry-run");
    expect(a).toEqual(b);
  });

  it("-n skills -y equals skills -y -n", () => {
    const a = parse("-n skills -y");
    const b = parse("skills -y -n");
    expect(a).toEqual(b);
  });

  it("--user --dry-run install --all equals install --all --dry-run --user", () => {
    const a = parse("--user --dry-run install --all");
    const b = parse("install --all --dry-run --user");
    expect(a).toEqual(b);
  });

  it("--all --dry-run rules equals rules --dry-run --all", () => {
    const a = parse("--all --dry-run rules");
    const b = parse("rules --dry-run --all");
    expect(a).toEqual(b);
  });
});

// ── Family commands ────────────────────────────────────────────

describe("family commands", () => {
  for (const cmd of ["install", "skills", "rules", "hooks", "subagents"] as const) {
    it(`${cmd} is recognized`, () => {
      const intent = parse(cmd);
      expect(intent.type).toBe(cmd);
    });
  }

  it("skills --all sets all flag", () => {
    const intent = parse("skills --all");
    expect(intent.type).toBe("skills");
    if (intent.type === "skills") {
      expect(intent.flags.all).toBe(true);
      expect(intent.flags.dryRun).toBe(false);
      expect(intent.flags.user).toBe(false);
    }
  });

  it("rules -y -n --user sets all flags", () => {
    const intent = parse("rules -y -n --user");
    expect(intent.type).toBe("rules");
    if (intent.type === "rules") {
      expect(intent.flags.all).toBe(true);
      expect(intent.flags.dryRun).toBe(true);
      expect(intent.flags.user).toBe(true);
    }
  });
});

// ── Utility commands (VAL-CORE-010) ────────────────────────────

describe("utility commands", () => {
  it("list is recognized", () => {
    expect(parse("list").type).toBe("list");
  });

  it("config is recognized", () => {
    expect(parse("config").type).toBe("config");
  });

  it("setup is recognized", () => {
    expect(parse("setup").type).toBe("setup");
  });
});

// ── Setup with path argument (VAL-CORE-010A) ──────────────────

describe("setup with optional path argument", () => {
  it("setup without path has no path field", () => {
    const intent = parse("setup");
    expect(intent.type).toBe("setup");
    if (intent.type === "setup") {
      expect(intent.path).toBeUndefined();
    }
  });

  it("setup with path captures the path", () => {
    const intent = parse("setup /tmp/my-repo");
    expect(intent.type).toBe("setup");
    if (intent.type === "setup") {
      expect(intent.path).toBe("/tmp/my-repo");
    }
  });

  it("setup with relative path captures it as-is", () => {
    const intent = parse("setup ./some/repo");
    expect(intent.type).toBe("setup");
    if (intent.type === "setup") {
      expect(intent.path).toBe("./some/repo");
    }
  });

  it("setup with path preserves flags", () => {
    const intent = parse("setup /tmp/my-repo -n");
    expect(intent.type).toBe("setup");
    if (intent.type === "setup") {
      expect(intent.path).toBe("/tmp/my-repo");
      expect(intent.flags.dryRun).toBe(true);
    }
  });
});

// ── Combined flag scenarios ────────────────────────────────────

describe("combined flags", () => {
  it("skill codex -n resolves correctly", () => {
    const intent = parse("skill codex -n");
    expect(intent.type).toBe("skill");
    if (intent.type === "skill") {
      expect(intent.name).toBe("codex");
      expect(intent.flags.dryRun).toBe(true);
    }
  });

  it("subagent deep-architect --dry-run --user resolves correctly", () => {
    const intent = parse("subagent deep-architect --dry-run --user");
    expect(intent.type).toBe("subagent");
    if (intent.type === "subagent") {
      expect(intent.name).toBe("deep-architect");
      expect(intent.flags.dryRun).toBe(true);
      expect(intent.flags.user).toBe(true);
    }
  });
});

// ── Agent resolution (resolveAgents) ───────────────────────────

describe("resolveAgents", () => {
  it("resolves a single valid agent", () => {
    const result = resolveAgents(["codexcli"]);
    expect(result.agents).toEqual(["codexcli"]);
    expect(result.invalid).toEqual([]);
  });

  it("resolves comma-separated agents", () => {
    const result = resolveAgents(["claudecode,factorydroid"]);
    expect(result.agents).toEqual(["claudecode", "factorydroid"]);
    expect(result.invalid).toEqual([]);
  });

  it("deduplicates repeated agents", () => {
    const result = resolveAgents(["claudecode,claudecode,codexcli"]);
    expect(result.agents).toEqual(["claudecode", "codexcli"]);
    expect(result.invalid).toEqual([]);
  });

  it("returns agents in deterministic canonical order", () => {
    const result = resolveAgents(["factorydroid,codexcli,claudecode"]);
    expect(result.agents).toEqual(["claudecode", "codexcli", "factorydroid"]);
    expect(result.invalid).toEqual([]);
  });

  it("identifies invalid agents", () => {
    const result = resolveAgents(["invalid-agent"]);
    expect(result.agents).toEqual([]);
    expect(result.invalid).toEqual(["invalid-agent"]);
  });

  it("separates valid from invalid agents", () => {
    const result = resolveAgents(["claudecode,badone,codexcli"]);
    expect(result.agents).toEqual(["claudecode", "codexcli"]);
    expect(result.invalid).toEqual(["badone"]);
  });

  it("handles multiple --agent flags (array entries)", () => {
    const result = resolveAgents(["claudecode", "factorydroid"]);
    expect(result.agents).toEqual(["claudecode", "factorydroid"]);
    expect(result.invalid).toEqual([]);
  });

  it("normalizes case to lowercase", () => {
    const result = resolveAgents(["ClaudeCode,CODEXCLI"]);
    expect(result.agents).toEqual(["claudecode", "codexcli"]);
    expect(result.invalid).toEqual([]);
  });

  it("handles whitespace around comma-separated values", () => {
    const result = resolveAgents(["claudecode , codexcli"]);
    expect(result.agents).toEqual(["claudecode", "codexcli"]);
    expect(result.invalid).toEqual([]);
  });
});

// ── --agent flag parsing (VAL-SCOPE-002/011/012) ──────────────

describe("--agent flag parsing", () => {
  it("single agent is captured in flags", () => {
    const intent = parse("skills -y -n --agent codexcli");
    expect(intent.type).toBe("skills");
    if (intent.type === "skills") {
      expect(intent.flags.agent).toEqual(["codexcli"]);
    }
  });

  it("comma-separated agents are captured in canonical order", () => {
    const intent = parse("rules -y -n --agent claudecode,factorydroid");
    expect(intent.type).toBe("rules");
    if (intent.type === "rules") {
      expect(intent.flags.agent).toEqual(["claudecode", "factorydroid"]);
    }
  });

  it("--target alias works the same as --agent", () => {
    const intent = parse("skills -y -n --target codexcli");
    expect(intent.type).toBe("skills");
    if (intent.type === "skills") {
      expect(intent.flags.agent).toEqual(["codexcli"]);
    }
  });

  it("invalid agent returns invalidAgent intent", () => {
    const intent = parse("rules -y -n --agent invalid-agent");
    expect(intent.type).toBe("invalidAgent");
    if (intent.type === "invalidAgent") {
      expect(intent.invalid).toEqual(["invalid-agent"]);
      expect(intent.command).toBe("rules");
    }
  });

  it("mixed valid+invalid returns invalidAgent with invalid list", () => {
    const intent = parse("rules --agent claudecode,badone");
    expect(intent.type).toBe("invalidAgent");
    if (intent.type === "invalidAgent") {
      expect(intent.invalid).toEqual(["badone"]);
    }
  });

  it("no --agent leaves flags.agent undefined", () => {
    const intent = parse("skills -y -n");
    expect(intent.type).toBe("skills");
    if (intent.type === "skills") {
      expect(intent.flags.agent).toBeUndefined();
    }
  });

  it("multi-agent deduplicates in deterministic order", () => {
    const intent = parse("install -y --agent factorydroid,codexcli,claudecode");
    expect(intent.type).toBe("install");
    if (intent.type === "install") {
      expect(intent.flags.agent).toEqual(["claudecode", "codexcli", "factorydroid"]);
    }
  });

  it("repeated --agent flags are merged", () => {
    const intent = parse("skills -y --agent claudecode --agent factorydroid");
    expect(intent.type).toBe("skills");
    if (intent.type === "skills") {
      expect(intent.flags.agent).toEqual(["claudecode", "factorydroid"]);
    }
  });

  it("singular command with --agent", () => {
    const intent = parse("skill codex --agent codexcli");
    expect(intent.type).toBe("skill");
    if (intent.type === "skill") {
      expect(intent.name).toBe("codex");
      expect(intent.flags.agent).toEqual(["codexcli"]);
    }
  });
});

// ── KNOWN_AGENTS constant ──────────────────────────────────────

describe("KNOWN_AGENTS constant", () => {
  it("contains exactly three agents in canonical order", () => {
    expect(KNOWN_AGENTS).toEqual(["claudecode", "codexcli", "factorydroid"]);
  });
});

// ── VERSION constant ───────────────────────────────────────────

describe("VERSION constant", () => {
  it("is defined and is a semver-like string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

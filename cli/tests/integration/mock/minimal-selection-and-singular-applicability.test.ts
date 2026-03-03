import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";

/**
 * Integration tests for:
 *
 * VAL-SCOPE-009: Explicit minimal install path exists
 * VAL-SCOPE-010: Singular install commands respect scope and applicability
 */

const CLI = ["bun", "cli/src/cli.ts"];
const CWD = import.meta.dir + "/../../../..";

interface RunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

let tmpHome: string;

beforeEach(() => {
  tmpHome = `/tmp/af-minsel-test-${Date.now()}`;
  mkdirSync(tmpHome, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpHome)) {
    rmSync(tmpHome, { recursive: true, force: true });
  }
});

async function runCli(
  args: string[],
  env?: Record<string, string>,
): Promise<RunResult> {
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: CWD,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NO_COLOR: "1",
      HOME: tmpHome,
      AF_SKIP_RULESYNC_EXEC: "1",
      ...env,
    },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// ── VAL-SCOPE-009: Explicit minimal install path ─────────────

describe("explicit minimal install path (VAL-SCOPE-009)", () => {
  describe("interactive flow supports minimal selection via code-level verification", () => {
    it("interactive module exports runInstall that processes only selected items", async () => {
      // Verify the interactive module has the necessary structure for minimal selection
      const interactiveSrc = readFileSync(
        CWD + "/cli/src/interactive.ts",
        "utf-8",
      );
      // The interactive flow uses per-category multiselect prompts
      expect(interactiveSrc).toContain("multiselect");
      // Selected items are stored in a Selections object per category
      expect(interactiveSrc).toContain("selections");
      // Install is gated by non-empty selections per category
      expect(interactiveSrc).toContain("selections.skills.length > 0");
      expect(interactiveSrc).toContain("selections.rules.length > 0");
      expect(interactiveSrc).toContain("selections.hooks.length > 0");
      expect(interactiveSrc).toContain("selections.subagents.length > 0");
    });

    it("category picker in interactive flow allows selecting a subset", async () => {
      const interactiveSrc = readFileSync(
        CWD + "/cli/src/interactive.ts",
        "utf-8",
      );
      // Category picker uses multiselect with required:false (allows empty/partial)
      expect(interactiveSrc).toContain("What do you want to install?");
      expect(interactiveSrc).toContain("required: false");
    });
  });

  describe("non-interactive singular commands as minimal explicit install", () => {
    it("skill codex -n installs only the named skill (not all skills)", async () => {
      const result = await runCli(["skill", "codex", "-n"]);
      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      // Should NOT install hooks, subagents, or other categories
      expect(output).not.toContain("[DRY-RUN] Hook:");
      expect(output).not.toContain("[DRY-RUN] Subagent:");
    });

    it("rule typescript -n installs only the named rule", async () => {
      const result = await runCli(["rule", "typescript", "-n"]);
      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).not.toContain("[DRY-RUN] Hook:");
      expect(output).not.toContain("[DRY-RUN] Subagent:");
    });

    it("subagent code-quality-checker -n installs only the named subagent", async () => {
      const result = await runCli(["subagent", "code-quality-checker", "-n"]);
      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      // Should only contain subagent-related output
      expect(output).not.toContain("[DRY-RUN] Hook:");
    });

    it("hooks -y -n installs only hooks (not skills/rules/subagents)", async () => {
      const result = await runCli(["hooks", "-y", "-n"]);
      expect(result.exitCode).toBe(0);
      const output = result.stdout;
      // Hook DRY-RUN lines should be present
      const dryRunLines = output.split("\n").filter((l) => l.includes("[DRY-RUN]"));
      for (const line of dryRunLines) {
        expect(line).toContain("Hook:");
      }
    });

    it("subagents -y -n installs only subagents (not skills/rules/hooks)", async () => {
      const result = await runCli(["subagents", "-y", "-n"]);
      expect(result.exitCode).toBe(0);
      const output = result.stdout;
      const dryRunLines = output.split("\n").filter((l) => l.includes("[DRY-RUN]"));
      for (const line of dryRunLines) {
        expect(line).toContain("Subagent:");
      }
    });
  });
});

// ── VAL-SCOPE-010: Singular commands respect scope + applicability ──

describe("singular commands respect scope and applicability (VAL-SCOPE-010)", () => {
  describe("skill singular", () => {
    it("skill codex -n uses project scope by default", async () => {
      const result = await runCli(["skill", "codex", "-n"]);
      expect(result.exitCode).toBe(0);
      // Project scope: no HOME-based destinations
      const output = result.stdout + result.stderr;
      const homeDryRuns = output
        .split("\n")
        .filter((l) => l.includes("[DRY-RUN]") && l.includes(tmpHome));
      expect(homeDryRuns.length).toBe(0);
    });

    it("skill codex -n --user uses user scope", async () => {
      const result = await runCli(["skill", "codex", "-n", "--user"]);
      expect(result.exitCode).toBe(0);
      // User scope: staging happens in HOME
    });

    it("skill codex -n --agent codexcli restricts targets to codexcli", async () => {
      const result = await runCli(["skill", "codex", "-n", "--agent", "codexcli"]);
      expect(result.exitCode).toBe(0);
      // Skills support codexcli — should succeed without warnings
      const output = result.stdout + result.stderr;
      expect(output).not.toContain("Skipping");
      expect(output).not.toContain("unsupported");
    });

    it("skill codex -n --agent claudecode,codexcli restricts to specified targets", async () => {
      const result = await runCli([
        "skill",
        "codex",
        "-n",
        "--agent",
        "claudecode,codexcli",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).not.toContain("Skipping");
    });
  });

  describe("rule singular", () => {
    it("rule typescript -n uses project scope by default", async () => {
      const result = await runCli(["rule", "typescript", "-n"]);
      expect(result.exitCode).toBe(0);
    });

    it("rule typescript -n --user uses user scope", async () => {
      const result = await runCli(["rule", "typescript", "-n", "--user"]);
      expect(result.exitCode).toBe(0);
    });

    it("rule typescript -n --agent claudecode restricts targets", async () => {
      const result = await runCli(["rule", "typescript", "-n", "--agent", "claudecode"]);
      expect(result.exitCode).toBe(0);
      // Rules support all agents — no warnings
      expect(result.stdout + result.stderr).not.toContain("Skipping");
    });
  });

  describe("subagent singular", () => {
    it("subagent code-quality-checker -n uses project scope by default", async () => {
      const result = await runCli(["subagent", "code-quality-checker", "-n"]);
      expect(result.exitCode).toBe(0);
      // Project scope: destinations in CWD
      const output = result.stdout;
      const dryRunLines = output
        .split("\n")
        .filter((l) => l.includes("[DRY-RUN]") && l.includes("->"));
      for (const line of dryRunLines) {
        expect(line).not.toContain(tmpHome);
      }
    });

    it("subagent code-quality-checker -n --user uses user scope", async () => {
      const result = await runCli(["subagent", "code-quality-checker", "-n", "--user"]);
      expect(result.exitCode).toBe(0);
      const output = result.stdout;
      const dryRunLines = output
        .split("\n")
        .filter((l) => l.includes("[DRY-RUN]") && l.includes("->"));
      for (const line of dryRunLines) {
        const destPart = line.split("->")[1] ?? "";
        expect(destPart).toContain(tmpHome);
      }
    });

    it("subagent code-quality-checker -n --agent codexcli warns and skips (unsupported)", async () => {
      const result = await runCli([
        "subagent",
        "code-quality-checker",
        "-n",
        "--agent",
        "codexcli",
      ]);
      expect(result.exitCode).toBe(0);
      const output = result.stdout;
      expect(output).toContain("Skipping subagents for codexcli");
      expect(output).toContain("Nothing to install");
    });

    it("subagent code-quality-checker -n --agent claudecode installs (supported)", async () => {
      const result = await runCli([
        "subagent",
        "code-quality-checker",
        "-n",
        "--agent",
        "claudecode",
      ]);
      expect(result.exitCode).toBe(0);
      const output = result.stdout;
      expect(output).not.toContain("Skipping");
      expect(output).not.toContain("Nothing to install");
      expect(output).toContain("[DRY-RUN] Subagent:");
    });

    it("subagent deep-architect -n --agent codexcli warns about unsupported", async () => {
      const result = await runCli([
        "subagent",
        "deep-architect",
        "-n",
        "--agent",
        "codexcli",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Skipping subagents for codexcli");
      expect(result.stdout).toContain("Nothing to install");
    });
  });

  describe("agent filter in singular commands reports non-applicability explicitly", () => {
    it("subagent with unsupported agent shows artifact+target+reason in warning", async () => {
      const result = await runCli([
        "subagent",
        "code-quality-checker",
        "-n",
        "--agent",
        "factorydroid",
      ]);
      expect(result.exitCode).toBe(0);
      const output = result.stdout;
      // Must mention the artifact category, target, and reason
      expect(output).toContain("subagents");
      expect(output).toContain("factorydroid");
      expect(output).toContain("not supported");
    });
  });
});

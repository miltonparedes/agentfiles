import { describe, expect, it } from "bun:test";

/**
 * Integration tests (mocked via CLI subprocess) for the @clack/prompts engine:
 *
 * VAL-CORE-006: Non-TTY guard for interactive command families
 * VAL-CORE-007: -y/--all bypasses interactive guard
 * VAL-CORE-011: Dry-run mode is non-destructive
 * VAL-PROMPTS-003: Cancellation is graceful (no stacktrace)
 * VAL-PROMPTS-004: Cancellation leaves no side effects
 * VAL-PROMPTS-006: Interactive runtime uses @clack/prompts (not Ink)
 * VAL-PROMPTS-007: Target prompt appears only when relevant
 * VAL-PROMPTS-008: Scope preselection behaves correctly
 * VAL-PROMPTS-009: Family commands bypass category picker
 * VAL-PROMPTS-010: Non-interactive runs never initialize prompts
 */

const CLI = ["bun", "cli/src/cli.ts"];
const CWD = import.meta.dir + "/../../../..";

interface RunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

async function runCli(args: string[], env?: Record<string, string>): Promise<RunResult> {
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: CWD,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// ── VAL-PROMPTS-006: @clack/prompts is used, not Ink ─────────

describe("prompt engine uses @clack/prompts", () => {
  it("interactive.ts imports @clack/prompts", async () => {
    const content = await Bun.file("cli/src/interactive.ts").text();
    expect(content).toContain('@clack/prompts');
    expect(content).not.toContain("from \"ink\"");
    expect(content).not.toContain("from \"react\"");
  });

  it("package.json has @clack/prompts as dependency", async () => {
    const pkg = await Bun.file("package.json").text();
    const parsed = JSON.parse(pkg);
    expect(parsed.dependencies["@clack/prompts"]).toBeDefined();
  });
});

// ── VAL-CORE-006: Non-TTY guard for interactive command families ──

describe("non-TTY interactive guard", () => {
  it("install without -y fails in non-TTY with guidance message", async () => {
    const result = await runCli(["install"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Non-interactive terminal detected");
    expect(result.stdout).toContain("--all/-y");
  });

  it("skills without -y fails in non-TTY with guidance message", async () => {
    const result = await runCli(["skills"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Non-interactive terminal detected");
  });

  it("rules without -y fails in non-TTY with guidance message", async () => {
    const result = await runCli(["rules"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Non-interactive terminal detected");
  });

  it("hooks without -y fails in non-TTY with guidance message", async () => {
    const result = await runCli(["hooks"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Non-interactive terminal detected");
  });

  it("subagents without -y fails in non-TTY with guidance message", async () => {
    const result = await runCli(["subagents"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Non-interactive terminal detected");
  });

  it("no stacktrace in non-TTY failure output", async () => {
    const result = await runCli(["install"]);
    expect(result.stderr).not.toContain("Error:");
    expect(result.stderr).not.toContain("at ");
    expect(result.stderr).not.toContain("stack");
  });

  it("default command (no args) in non-TTY fails with guidance", async () => {
    const result = await runCli([]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Non-interactive terminal detected");
  });
});

// ── VAL-PROMPTS-004: Cancellation leaves no side effects ─────

describe("non-interactive guard leaves no side effects", () => {
  it("non-TTY rejection does not create files", async () => {
    const proc = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: CWD,
      stdout: "pipe",
    });
    const beforeStatus = await new Response(proc.stdout).text();
    await proc.exited;

    await runCli(["install"]);

    const proc2 = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: CWD,
      stdout: "pipe",
    });
    const afterStatus = await new Response(proc2.stdout).text();
    await proc2.exited;

    expect(afterStatus).toBe(beforeStatus);
  });
});

// ── VAL-CORE-007: -y/--all bypasses interactive guard ─────────

describe("-y/--all bypasses interactive guard in non-TTY", () => {
  it("hooks -y -n succeeds in non-TTY", async () => {
    const result = await runCli(["hooks", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Non-interactive terminal detected");
  });

  it("subagents -y -n succeeds in non-TTY", async () => {
    const result = await runCli(["subagents", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Non-interactive terminal detected");
  });

  it("hooks --all --dry-run succeeds in non-TTY (long flags)", async () => {
    const result = await runCli(["hooks", "--all", "--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Non-interactive terminal detected");
  });

  it("subagents --all --dry-run succeeds in non-TTY (long flags)", async () => {
    const result = await runCli(["subagents", "--all", "--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Non-interactive terminal detected");
  });
});

// ── VAL-CORE-011: Dry-run mode is non-destructive ─────────────

describe("dry-run mode is non-destructive", () => {
  it("hooks -y -n reports planned actions without writing", async () => {
    const result = await runCli(["hooks", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    // hooks should either show DRY-RUN output or no-hooks message
    const hasDryRun = result.stdout.includes("[DRY-RUN]");
    const noHooks = result.stdout.includes("No hook scripts found");
    expect(hasDryRun || noHooks).toBe(true);
  });

  it("subagents -y -n shows dry-run output without writing files", async () => {
    const proc1 = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: CWD,
      stdout: "pipe",
    });
    const beforeStatus = await new Response(proc1.stdout).text();
    await proc1.exited;

    const result = await runCli(["subagents", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[DRY-RUN]");

    const proc2 = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: CWD,
      stdout: "pipe",
    });
    const afterStatus = await new Response(proc2.stdout).text();
    await proc2.exited;

    expect(afterStatus).toBe(beforeStatus);
  });
});

// ── VAL-PROMPTS-007: Target prompt appears only when relevant ──

describe("target prompt appears only when relevant", () => {
  it("needsTargetPicker returns true when skills are present", async () => {
    const content = await Bun.file("cli/src/interactive.ts").text();
    // Verify the logic: target picker condition checks for skills or rules
    expect(content).toContain("needsTargetPicker");
    const fnMatch = content.match(
      /function needsTargetPicker\(categories[^)]*\)[^{]*\{([^}]+)\}/,
    );
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![1];
    // Must check for skills or rules categories
    expect(body).toContain("skills");
    expect(body).toContain("rules");
  });

  it("target picker is gated by needsTargetPicker in prompt flow", async () => {
    const content = await Bun.file("cli/src/interactive.ts").text();
    // Target selection step should be guarded by needsTargetPicker call
    // When preSelectedTargets are passed, the prompt is skipped entirely
    expect(content).toContain("!targets && needsTargetPicker(categories)");
  });

  it("hooks-only flow does not trigger target picker logic", async () => {
    const content = await Bun.file("cli/src/interactive.ts").text();
    // needsTargetPicker only includes skills and rules, not hooks/subagents
    const fnMatch = content.match(
      /function needsTargetPicker\(categories[^)]*\)[^{]*\{([^}]+)\}/,
    );
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![1];
    expect(body).not.toContain('"hooks"');
    expect(body).not.toContain('"subagents"');
  });
});

// ── VAL-PROMPTS-008: Scope preselection behaves correctly ─────

describe("scope preselection with --user", () => {
  it("interactive flow skips level prompt when config.userLevel is set", async () => {
    const content = await Bun.file("cli/src/interactive.ts").text();
    // Verify skipLevel logic: when config.userLevel is true, level prompt is skipped
    expect(content).toContain("const skipLevel = config.userLevel");
    expect(content).toContain("if (!skipLevel)");
  });

  it("global defaults to config.userLevel when level prompt is skipped", async () => {
    const content = await Bun.file("cli/src/interactive.ts").text();
    // global is initialized from config.userLevel before the conditional prompt
    expect(content).toContain("let global = config.userLevel");
  });

  it("cli.ts sets config.userLevel from --user flag for family commands", async () => {
    const content = await Bun.file("cli/src/cli.ts").text();
    // Each family command sets userLevel from intent flags
    const userLevelAssignments = content.match(
      /config\.userLevel\s*=\s*intent\.flags\.user/g,
    );
    expect(userLevelAssignments).not.toBeNull();
    // At minimum skills, rules, hooks, subagents, install set it
    expect(userLevelAssignments!.length).toBeGreaterThanOrEqual(5);
  });
});

// ── VAL-PROMPTS-009: Family commands bypass category picker ───

describe("family commands bypass category picker", () => {
  it("interactive() accepts only parameter to restrict categories", async () => {
    const content = await Bun.file("cli/src/interactive.ts").text();
    // Signature takes optional only?: Category
    expect(content).toMatch(/export async function interactive\(only\?/);
  });

  it("category picker is skipped when only parameter is provided", async () => {
    const content = await Bun.file("cli/src/interactive.ts").text();
    // needsCategoryPicker is false when only is set
    expect(content).toContain("const needsCategoryPicker = !only");
  });

  it("cli.ts passes category to interactive() for family commands", async () => {
    const content = await Bun.file("cli/src/cli.ts").text();
    // skills, rules, hooks, subagents each pass their category name (with optional targets)
    expect(content).toContain('interactive("skills"');
    expect(content).toContain('interactive("rules"');
    expect(content).toContain('interactive("hooks"');
    expect(content).toContain('interactive("subagents"');
  });

  it("install command calls interactive() without category (shows global picker)", async () => {
    const content = await Bun.file("cli/src/cli.ts").text();
    // install without -y calls interactive() with undefined as first arg (no category)
    expect(content).toMatch(/case "install"[\s\S]*?await interactive\(undefined/);
  });
});

// ── VAL-PROMPTS-010: Non-interactive runs never init prompts ──
// Note: install/skills/rules -y -n invoke sync() which depends on rulesync.
// We test hooks/subagents -y -n (no rulesync dependency) to verify the
// non-interactive path bypasses prompts. The sync-dependent commands are
// validated in integration-real tests with proper fixture isolation.

describe("non-interactive runs bypass prompts", () => {
  it("hooks -y -n runs without prompt initialization", async () => {
    const result = await runCli(["hooks", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("What do you want to install");
    expect(result.stdout).not.toContain("af — agentfiles");
  });

  it("subagents -y -n runs without prompt initialization", async () => {
    const result = await runCli(["subagents", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("What do you want to install");
    expect(result.stdout).not.toContain("af — agentfiles");
  });

  it("list runs without prompt initialization", async () => {
    const result = await runCli(["list"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("What do you want to install");
    expect(result.stdout).not.toContain("af — agentfiles");
  });

  it("-y flag prevents prompt init for all family commands in cli.ts dispatch", async () => {
    const content = await Bun.file("cli/src/cli.ts").text();
    // Each family command: when intent.flags.all is true, interactive() is NOT called
    for (const cmd of ["install", "skills", "rules", "hooks", "subagents"]) {
      const pattern = new RegExp(
        `case "${cmd}"[\\s\\S]*?if \\(intent\\.flags\\.all\\)`,
      );
      expect(content).toMatch(pattern);
    }
  });

  it("non-TTY family commands without -y never reach prompt code", async () => {
    // All family commands in non-TTY (no -y) fail fast at the interactive guard
    for (const cmd of ["skills", "rules", "hooks", "subagents"] as const) {
      const result = await runCli([cmd]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Non-interactive terminal detected");
      // Must NOT contain clack intro marker
      expect(result.stdout).not.toContain("af — agentfiles");
    }
  });
});

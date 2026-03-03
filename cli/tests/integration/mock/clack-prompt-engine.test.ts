import { describe, expect, it } from "bun:test";

/**
 * Integration tests (mocked via CLI subprocess) for the @clack/prompts engine:
 *
 * VAL-PROMPTS-003: Cancellation is graceful (no stacktrace)
 * VAL-PROMPTS-004: Cancellation leaves no side effects
 * VAL-PROMPTS-006: Interactive runtime uses @clack/prompts (not Ink)
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

// ── VAL-PROMPTS-003: Graceful cancellation (non-TTY) ─────────

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
  });

  it("subagents -y -n runs without prompt initialization", async () => {
    const result = await runCli(["subagents", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("What do you want to install");
  });

  it("list runs without prompt initialization", async () => {
    const result = await runCli(["list"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("What do you want to install");
  });
});

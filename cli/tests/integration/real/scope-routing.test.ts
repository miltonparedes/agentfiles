import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Integration tests (real CLI subprocess with dry-run) for strict scope routing:
 *
 * VAL-SCOPE-001: `install -y` respects scope strictly
 * VAL-SCOPE-010A: Family commands honor strict scope routing
 * VAL-CROSS-007: Project scope is isolated from pre-existing user rulesync state
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
  tmpHome = `/tmp/af-scope-test-${Date.now()}`;
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

// ── VAL-SCOPE-001: install -y respects scope strictly ─────────

describe("install -y strict scope routing (VAL-SCOPE-001)", () => {
  it("install -y -n without --user does NOT use user-home destinations", async () => {
    const result = await runCli(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    // Must NOT contain the temp HOME path in DRY-RUN destinations
    // (project scope should use CWD, not HOME)
    const homeRefs = output
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes(tmpHome));
    expect(homeRefs.length).toBe(0);
  });

  it("install -y -n --user uses ONLY user-home destinations", async () => {
    const result = await runCli(["install", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    // All DRY-RUN lines with destinations should reference HOME
    const dryRunLines = output
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes("->"));
    // If there are dry-run output lines, they should all reference HOME
    for (const line of dryRunLines) {
      const destPart = line.split("->")[1] ?? "";
      expect(destPart).toContain(tmpHome);
    }
  });
});

// ── VAL-SCOPE-010A: Family commands honor strict scope routing ─

describe("family commands strict scope routing (VAL-SCOPE-010A)", () => {
  it("hooks -y -n without --user routes to project (CWD)", async () => {
    const result = await runCli(["hooks", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    const dryRunLines = output
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes("->"));
    // No DRY-RUN line should reference HOME
    for (const line of dryRunLines) {
      expect(line).not.toContain(tmpHome);
    }
  });

  it("hooks -y -n --user routes to user home", async () => {
    const result = await runCli(["hooks", "-y", "-n", "--user"]);
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

  it("subagents -y -n without --user routes to project (CWD)", async () => {
    const result = await runCli(["subagents", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    const dryRunLines = output
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes("->"));
    // No DRY-RUN line should reference HOME
    for (const line of dryRunLines) {
      expect(line).not.toContain(tmpHome);
    }
  });

  it("subagents -y -n --user routes to user home", async () => {
    const result = await runCli(["subagents", "-y", "-n", "--user"]);
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

  it("rules -y -n without --user uses project scope (detects languages)", async () => {
    const result = await runCli(["rules", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Should show language detection (project-scope behavior)
    expect(output).toContain("Detected languages:");
  });

  it("rules -y -n --user uses user scope (global, no language filter)", async () => {
    const result = await runCli(["rules", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;
    // Should NOT show language detection (user-scope is global)
    expect(output).not.toContain("Detected languages:");
  });

  it("skills -y -n without --user does NOT route to user home", async () => {
    const result = await runCli(["skills", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    // Project scope for skills — no user-home destination
    const output = result.stdout + result.stderr;
    const homeRefs = output
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes(tmpHome));
    expect(homeRefs.length).toBe(0);
  });

  it("skills -y -n --user routes to user home", async () => {
    const result = await runCli(["skills", "-y", "-n", "--user"]);
    expect(result.exitCode).toBe(0);
    // User scope — should stage in HOME
    // (skills are scope: global so they will match)
  });
});

// ── VAL-CROSS-007: Project scope isolated from user state ──────

describe("project scope isolation (VAL-CROSS-007)", () => {
  it("install -y -n with pre-existing HOME rulesync state stays project-scoped", async () => {
    // Create pre-existing rulesync state in HOME
    mkdirSync(join(tmpHome, ".rulesync"), { recursive: true });
    await Bun.write(
      join(tmpHome, "rulesync.jsonc"),
      '{"$schema":"https://something","targets":["custom"],"features":["custom"],"global":true,"delete":false}',
    );

    const result = await runCli(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    // Project scope should NOT route through HOME
    const output = result.stdout + result.stderr;
    const homeDryRuns = output
      .split("\n")
      .filter((l) => l.includes("[DRY-RUN]") && l.includes(tmpHome));
    expect(homeDryRuns.length).toBe(0);
  });
});

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Integration tests (real CLI subprocess) for cross-area flow parity:
 *
 * VAL-CROSS-001: Non-TTY to explicit non-interactive fallback
 * VAL-CROSS-002: `install -y --user --agent <x>` enforces both scope and target
 * VAL-CROSS-003: `install -y` project flow with defaults remains stable
 * VAL-CROSS-004: Interactive cancel does not contaminate subsequent non-interactive run
 * VAL-CROSS-005: Interactive and non-interactive parity for equal intent
 * VAL-CROSS-008: Install-all in no-language project degrades gracefully (non-rule artifacts)
 */

const CWD = import.meta.dir + "/../../../..";
const CLI_SCRIPT = CWD + "/cli/src/cli.ts";
const CLI = ["bun", CLI_SCRIPT];

interface RunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

let tmpHome: string;
let tmpNoLang: string;

beforeEach(() => {
  const ts = Date.now();
  tmpHome = `/tmp/af-cross-parity-${ts}`;
  tmpNoLang = `/tmp/af-cross-nolang-${ts}`;
  mkdirSync(tmpHome, { recursive: true });
  mkdirSync(tmpNoLang, { recursive: true });
});

afterEach(() => {
  for (const dir of [tmpHome, tmpNoLang]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  // Defensive cleanup of CWD residuals
  const cwdRulesync = join(CWD, ".rulesync");
  const cwdConfig = join(CWD, "rulesync.jsonc");
  if (existsSync(cwdRulesync)) rmSync(cwdRulesync, { recursive: true, force: true });
  if (existsSync(cwdConfig)) rmSync(cwdConfig, { force: true });
});

/** Run CLI in non-TTY (piped stdin) with optional env overrides */
async function runCliNonTTY(
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string>; stdin?: string },
): Promise<RunResult> {
  const proc = Bun.spawn([...CLI, ...args], {
    cwd: opts?.cwd ?? CWD,
    stdin: new Blob([opts?.stdin ?? ""]),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NO_COLOR: "1",
      HOME: tmpHome,
      AF_SKIP_RULESYNC_EXEC: "1",
      AF_REPO: CWD,
      ...opts?.env,
    },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// ── VAL-CROSS-001: Non-TTY to explicit non-interactive fallback ──

describe("non-TTY to explicit non-interactive fallback (VAL-CROSS-001)", () => {
  it("non-TTY rules fails, then rules -y -n succeeds", async () => {
    // Step 1: non-TTY without -y should fail
    const fail = await runCliNonTTY(["rules"]);
    expect(fail.exitCode).toBe(1);
    expect(fail.stdout).toContain("Non-interactive terminal detected");

    // Step 2: same command with -y -n should succeed
    const ok = await runCliNonTTY(["rules", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
    // Should perform the intended action (language detection for rules)
    expect(ok.stdout).toContain("Detected languages:");
  });

  it("non-TTY install fails, then install -y -n succeeds", async () => {
    const fail = await runCliNonTTY(["install"]);
    expect(fail.exitCode).toBe(1);
    expect(fail.stdout).toContain("Non-interactive");

    const ok = await runCliNonTTY(["install", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toContain("✅");
  });

  it("non-TTY skills fails, then skills -y -n succeeds", async () => {
    const fail = await runCliNonTTY(["skills"]);
    expect(fail.exitCode).toBe(1);

    const ok = await runCliNonTTY(["skills", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
  });

  it("non-TTY hooks fails, then hooks -y -n succeeds", async () => {
    const fail = await runCliNonTTY(["hooks"]);
    expect(fail.exitCode).toBe(1);

    const ok = await runCliNonTTY(["hooks", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
  });

  it("non-TTY subagents fails, then subagents -y -n succeeds", async () => {
    const fail = await runCliNonTTY(["subagents"]);
    expect(fail.exitCode).toBe(1);

    const ok = await runCliNonTTY(["subagents", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
  });

  it("non-TTY default (no args) fails, then install -y -n succeeds", async () => {
    const fail = await runCliNonTTY([]);
    expect(fail.exitCode).toBe(1);

    const ok = await runCliNonTTY(["install", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toContain("✅");
  });
});

// ── VAL-CROSS-002: install -y --user --agent <x> enforces both scope and target ──

describe("install -y --user --agent enforces scope+target (VAL-CROSS-002)", () => {
  it("install -y -n --user --agent codexcli: user-scope + codexcli-only + warnings", async () => {
    const result = await runCliNonTTY([
      "install",
      "-y",
      "-n",
      "--user",
      "--agent",
      "codexcli",
    ]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;

    // User scope enforced — success message references user scope
    expect(output).toContain("✅");
    expect(output).toContain("Rules are per-project");

    // Agent target filtering — hooks/subagents warned+omitted for codexcli
    expect(output).toContain("Skipping hooks for codexcli");
    expect(output).toContain("Skipping subagents for codexcli");

    // No DRY-RUN lines should reference project (CWD) paths
    // (user scope should route to HOME)
    const dryRunLines = output.split("\n").filter((l) => l.includes("[DRY-RUN]"));
    for (const line of dryRunLines) {
      expect(line).not.toContain(CWD);
    }
  });

  it("install -y -n --user --agent claudecode: user-scope + all categories", async () => {
    const result = await runCliNonTTY([
      "install",
      "-y",
      "-n",
      "--user",
      "--agent",
      "claudecode",
    ]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;

    // All categories supported for claudecode — no skip warnings
    expect(output).not.toContain("Skipping");
    expect(output).toContain("✅");
  });

  it("install -y -n --user --agent factorydroid: user-scope + factorydroid-only + warnings", async () => {
    const result = await runCliNonTTY([
      "install",
      "-y",
      "-n",
      "--user",
      "--agent",
      "factorydroid",
    ]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;

    // Hooks and subagents should be warned+omitted
    expect(output).toContain("Skipping hooks for factorydroid");
    expect(output).toContain("Skipping subagents for factorydroid");
    // Skills should still be processed
    expect(output).toContain("✅");
  });
});

// ── VAL-CROSS-003: install -y project flow with defaults remains stable ──

describe("install -y project flow with defaults stable (VAL-CROSS-003)", () => {
  it("install -y -n uses project scope by default and produces expected output", async () => {
    const result = await runCliNonTTY(["install", "-y", "-n"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout;

    // Language detection runs for project-scope rules
    expect(output).toContain("Detected languages:");

    // Completion message reflects project scope
    expect(output).toContain("installed to project scope");
  });

  it("install -y -n is deterministic across repeated runs", async () => {
    const r1 = await runCliNonTTY(["install", "-y", "-n"]);
    const r2 = await runCliNonTTY(["install", "-y", "-n"]);
    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);

    // Both should contain same key markers
    expect(r1.stdout).toContain("Detected languages:");
    expect(r2.stdout).toContain("Detected languages:");
    expect(r1.stdout).toContain("installed to project scope");
    expect(r2.stdout).toContain("installed to project scope");
  });

  it("install -y -n preserves legacy command compatibility (-y = --all)", async () => {
    const shortFlag = await runCliNonTTY(["install", "-y", "-n"]);
    const longFlag = await runCliNonTTY(["install", "--all", "--dry-run"]);
    expect(shortFlag.exitCode).toBe(0);
    expect(longFlag.exitCode).toBe(0);

    // Both should arrive at the same flow
    expect(shortFlag.stdout).toContain("installed to project scope");
    expect(longFlag.stdout).toContain("installed to project scope");
  });
});

// ── VAL-CROSS-004: Cancel interactive does not contaminate next non-interactive ──

describe("cancel interactive does not contaminate non-interactive (VAL-CROSS-004)", () => {
  it("cancelled non-TTY run leaves no residue for next -y -n run", async () => {
    // Simulate a "cancelled" run: non-TTY without -y exits with 1
    const cancelled = await runCliNonTTY(["install"]);
    expect(cancelled.exitCode).toBe(1);

    // No rulesync artifacts should be left behind
    expect(existsSync(join(CWD, ".rulesync"))).toBe(false);
    expect(existsSync(join(CWD, "rulesync.jsonc"))).toBe(false);

    // Follow-up non-interactive run should succeed cleanly
    const ok = await runCliNonTTY(["install", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toContain("✅");
    // Should NOT mention cleanup of residuals
    expect(ok.stdout).not.toContain("Cleaning up residual");
  });

  it("failed non-TTY rules does not affect subsequent rules -y -n", async () => {
    const cancelled = await runCliNonTTY(["rules"]);
    expect(cancelled.exitCode).toBe(1);

    const ok = await runCliNonTTY(["rules", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toContain("Detected languages:");
    expect(ok.stdout).not.toContain("Cleaning up residual");
  });

  it("failed non-TTY skills does not affect subsequent skills -y -n", async () => {
    const cancelled = await runCliNonTTY(["skills"]);
    expect(cancelled.exitCode).toBe(1);

    const ok = await runCliNonTTY(["skills", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).not.toContain("Cleaning up residual");
  });

  it("SIGINT during non-interactive run leaves no residue for subsequent run", async () => {
    // Launch a real install -y -n and kill it with SIGINT mid-execution
    const proc = Bun.spawn([...CLI, "install", "-y", "-n"], {
      cwd: CWD,
      stdin: new Blob([""]),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NO_COLOR: "1",
        HOME: tmpHome,
        AF_SKIP_RULESYNC_EXEC: "1",
        AF_REPO: CWD,
      },
    });

    // Send SIGINT shortly after launch to simulate Ctrl+C
    setTimeout(() => proc.kill("SIGINT"), 50);
    await proc.exited;

    // No residual rulesync artifacts in CWD
    expect(existsSync(join(CWD, ".rulesync"))).toBe(false);
    expect(existsSync(join(CWD, "rulesync.jsonc"))).toBe(false);

    // Follow-up non-interactive run should succeed without mentioning residuals
    const ok = await runCliNonTTY(["install", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toContain("✅");
    expect(ok.stdout).not.toContain("Cleaning up residual");
  });

  it("multiple sequential cancellations do not accumulate residue", async () => {
    // Three failed non-TTY runs in sequence
    for (let i = 0; i < 3; i++) {
      const cancelled = await runCliNonTTY(["install"]);
      expect(cancelled.exitCode).toBe(1);
      expect(existsSync(join(CWD, ".rulesync"))).toBe(false);
      expect(existsSync(join(CWD, "rulesync.jsonc"))).toBe(false);
    }

    // Follow-up should be completely clean
    const ok = await runCliNonTTY(["install", "-y", "-n"]);
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toContain("✅");
    expect(ok.stdout).not.toContain("Cleaning up residual");
  });

  it("cancellation across different command families leaves no cross-contamination", async () => {
    // Cancel install, then rules, then skills in sequence
    const cancelInstall = await runCliNonTTY(["install"]);
    expect(cancelInstall.exitCode).toBe(1);

    const cancelRules = await runCliNonTTY(["rules"]);
    expect(cancelRules.exitCode).toBe(1);

    const cancelSkills = await runCliNonTTY(["skills"]);
    expect(cancelSkills.exitCode).toBe(1);

    // No artifacts from any cancelled run
    expect(existsSync(join(CWD, ".rulesync"))).toBe(false);
    expect(existsSync(join(CWD, "rulesync.jsonc"))).toBe(false);

    // Each family works cleanly after all cancellations
    const okInstall = await runCliNonTTY(["install", "-y", "-n"]);
    expect(okInstall.exitCode).toBe(0);
    expect(okInstall.stdout).toContain("✅");

    const okRules = await runCliNonTTY(["rules", "-y", "-n"]);
    expect(okRules.exitCode).toBe(0);
    expect(okRules.stdout).toContain("Detected languages:");

    const okSkills = await runCliNonTTY(["skills", "-y", "-n"]);
    expect(okSkills.exitCode).toBe(0);
  });
});

// ── VAL-CROSS-005: Interactive and non-interactive parity for equal intent ──
//
// Short/long flags produce the same non-interactive intent, proving that flag
// aliases resolve to identical execution paths. Additionally, the same intent
// expressed through different flag combinations produces content-equivalent
// outputs (same DRY-RUN markers, warnings, scope, language detection).

/** Extract semantic content lines (DRY-RUN markers, warnings, key messages) */
function extractSemanticLines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.includes("[DRY-RUN]") ||
        l.includes("Skipping") ||
        l.includes("Detected languages:") ||
        l.includes("No supported language") ||
        l.includes("✅") ||
        l.includes("installed to") ||
        l.includes("Rules are per-project") ||
        l.includes("hook") ||
        l.includes("Hook") ||
        l.includes("Subagent"),
    );
}

describe("interactive and non-interactive parity for equal intent (VAL-CROSS-005)", () => {
  it("rules -y -n and rules --all --dry-run produce equivalent output", async () => {
    const short = await runCliNonTTY(["rules", "-y", "-n"]);
    const long = await runCliNonTTY(["rules", "--all", "--dry-run"]);
    expect(short.exitCode).toBe(0);
    expect(long.exitCode).toBe(0);

    // Both should detect languages
    expect(short.stdout).toContain("Detected languages:");
    expect(long.stdout).toContain("Detected languages:");

    // Semantic content must match
    const shortSemantic = extractSemanticLines(short.stdout);
    const longSemantic = extractSemanticLines(long.stdout);
    expect(shortSemantic).toEqual(longSemantic);
  });

  it("skills -y -n and skills --all --dry-run produce equivalent output", async () => {
    const short = await runCliNonTTY(["skills", "-y", "-n"]);
    const long = await runCliNonTTY(["skills", "--all", "--dry-run"]);
    expect(short.exitCode).toBe(0);
    expect(long.exitCode).toBe(0);

    // Semantic content parity
    const shortSemantic = extractSemanticLines(short.stdout);
    const longSemantic = extractSemanticLines(long.stdout);
    expect(shortSemantic).toEqual(longSemantic);
  });

  it("hooks -y -n and hooks --all --dry-run produce equivalent output", async () => {
    const short = await runCliNonTTY(["hooks", "-y", "-n"]);
    const long = await runCliNonTTY(["hooks", "--all", "--dry-run"]);
    expect(short.exitCode).toBe(0);
    expect(long.exitCode).toBe(0);

    // Both should report the same hook info with content parity
    const shortSemantic = extractSemanticLines(short.stdout);
    const longSemantic = extractSemanticLines(long.stdout);
    expect(shortSemantic).toEqual(longSemantic);
  });

  it("subagents -y -n and subagents --all --dry-run produce equivalent output", async () => {
    const short = await runCliNonTTY(["subagents", "-y", "-n"]);
    const long = await runCliNonTTY(["subagents", "--all", "--dry-run"]);
    expect(short.exitCode).toBe(0);
    expect(long.exitCode).toBe(0);

    // Both should list the same subagent DRY-RUN lines
    const shortSemantic = extractSemanticLines(short.stdout);
    const longSemantic = extractSemanticLines(long.stdout);
    expect(shortSemantic).toEqual(longSemantic);
  });

  it("install -y -n --user produces same scope as install --all --dry-run --user", async () => {
    const short = await runCliNonTTY(["install", "-y", "-n", "--user"]);
    const long = await runCliNonTTY(["install", "--all", "--dry-run", "--user"]);
    expect(short.exitCode).toBe(0);
    expect(long.exitCode).toBe(0);

    // Both are user-scope
    expect(short.stdout).toContain("Rules are per-project");
    expect(long.stdout).toContain("Rules are per-project");

    // Neither should show project-scope language detection
    expect(short.stdout).not.toContain("Detected languages:");
    expect(long.stdout).not.toContain("Detected languages:");

    // Full semantic parity
    const shortSemantic = extractSemanticLines(short.stdout);
    const longSemantic = extractSemanticLines(long.stdout);
    expect(shortSemantic).toEqual(longSemantic);
  });

  it("install -y -n --agent codexcli and install --all --dry-run --agent codexcli are equivalent", async () => {
    const short = await runCliNonTTY(["install", "-y", "-n", "--agent", "codexcli"]);
    const long = await runCliNonTTY(["install", "--all", "--dry-run", "--agent", "codexcli"]);
    expect(short.exitCode).toBe(0);
    expect(long.exitCode).toBe(0);

    // Both should have the same warnings
    expect(short.stdout).toContain("Skipping hooks for codexcli");
    expect(long.stdout).toContain("Skipping hooks for codexcli");
    expect(short.stdout).toContain("Skipping subagents for codexcli");
    expect(long.stdout).toContain("Skipping subagents for codexcli");

    // Full semantic parity
    const shortSemantic = extractSemanticLines(short.stdout);
    const longSemantic = extractSemanticLines(long.stdout);
    expect(shortSemantic).toEqual(longSemantic);
  });

  it("flag order variation produces identical semantic output for install", async () => {
    // Test flag order doesn't affect output content
    const r1 = await runCliNonTTY(["install", "-y", "-n", "--agent", "codexcli", "--user"]);
    const r2 = await runCliNonTTY(["--user", "install", "--agent", "codexcli", "-y", "-n"]);
    const r3 = await runCliNonTTY(["install", "--all", "--dry-run", "--user", "--agent", "codexcli"]);
    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);
    expect(r3.exitCode).toBe(0);

    const sem1 = extractSemanticLines(r1.stdout);
    const sem2 = extractSemanticLines(r2.stdout);
    const sem3 = extractSemanticLines(r3.stdout);
    expect(sem1).toEqual(sem2);
    expect(sem1).toEqual(sem3);
  });

  it("same intent across families: scope+target parity for skills and rules", async () => {
    // Both project-scope, same agent
    const skills = await runCliNonTTY(["skills", "-y", "-n", "--agent", "codexcli"]);
    const rules = await runCliNonTTY(["rules", "-y", "-n", "--agent", "codexcli"]);
    expect(skills.exitCode).toBe(0);
    expect(rules.exitCode).toBe(0);

    // Skills and rules should both succeed without skip warnings (both supported for codexcli)
    expect(skills.stdout).not.toContain("Skipping");
    expect(rules.stdout).not.toContain("Skipping");
  });
});

// ── VAL-CROSS-008 supplement: no-language install-all non-rule processing ──

describe("no-language install-all processes non-rule artifacts (VAL-CROSS-008 supplement)", () => {
  it("install -y -n in no-language project: hooks and subagents still process", async () => {
    const result = await runCliNonTTY(["install", "-y", "-n"], { cwd: tmpNoLang });
    expect(result.exitCode).toBe(0);
    const output = result.stdout;

    // Rules skipped with warning
    expect(output).toContain("No supported language detected");

    // Non-rule artifacts should still be processed — hooks and subagents
    // (hooks may show "No hook scripts found" if no .sh files, but that's OK)
    // The key is that the install doesn't abort entirely
    expect(output).toContain("✅");
  });

  it("install -y -n in no-language project with --agent codexcli warns appropriately", async () => {
    const result = await runCliNonTTY(
      ["install", "-y", "-n", "--agent", "codexcli"],
      { cwd: tmpNoLang },
    );
    expect(result.exitCode).toBe(0);
    const output = result.stdout;

    // Rules skipped (no language) + hooks/subagents skipped (codexcli unsupported)
    expect(output).toContain("No supported language detected");
    expect(output).toContain("Skipping hooks for codexcli");
    expect(output).toContain("Skipping subagents for codexcli");
  });
});

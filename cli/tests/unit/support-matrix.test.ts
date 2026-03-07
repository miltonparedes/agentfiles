import { describe, expect, it } from "bun:test";
import {
  isSupported,
  filterSupportedTargets,
  warnUnsupported,
  type UnsupportedCombination,
} from "../../src/support-matrix.ts";

// ── isSupported ─────────────────────────────────────────────────

describe("isSupported", () => {
  it("skills supported by all three targets", () => {
    expect(isSupported("skills", "claudecode")).toBe(true);
    expect(isSupported("skills", "codexcli")).toBe(true);
    expect(isSupported("skills", "factorydroid")).toBe(true);
  });

  it("rules supported by all three targets", () => {
    expect(isSupported("rules", "claudecode")).toBe(true);
    expect(isSupported("rules", "codexcli")).toBe(true);
    expect(isSupported("rules", "factorydroid")).toBe(true);
  });

  it("hooks supported only by claudecode", () => {
    expect(isSupported("hooks", "claudecode")).toBe(true);
    expect(isSupported("hooks", "codexcli")).toBe(false);
    expect(isSupported("hooks", "factorydroid")).toBe(false);
  });

  it("subagents supported only by claudecode", () => {
    expect(isSupported("subagents", "claudecode")).toBe(true);
    expect(isSupported("subagents", "codexcli")).toBe(false);
    expect(isSupported("subagents", "factorydroid")).toBe(false);
  });
});

// ── filterSupportedTargets ──────────────────────────────────────

describe("filterSupportedTargets", () => {
  it("returns all targets as supported for skills", () => {
    const result = filterSupportedTargets("skills", ["claudecode", "codexcli", "factorydroid"]);
    expect(result.supported).toEqual(["claudecode", "codexcli", "factorydroid"]);
    expect(result.unsupported).toEqual([]);
  });

  it("filters hooks to only claudecode", () => {
    const result = filterSupportedTargets("hooks", ["claudecode", "codexcli", "factorydroid"]);
    expect(result.supported).toEqual(["claudecode"]);
    expect(result.unsupported).toHaveLength(2);
    expect(result.unsupported.map((u) => u.target)).toEqual(["codexcli", "factorydroid"]);
  });

  it("filters subagents to only claudecode", () => {
    const result = filterSupportedTargets("subagents", ["claudecode", "codexcli"]);
    expect(result.supported).toEqual(["claudecode"]);
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0]!.target).toBe("codexcli");
  });

  it("returns empty supported array for fully unsupported combo", () => {
    const result = filterSupportedTargets("hooks", ["codexcli"]);
    expect(result.supported).toEqual([]);
    expect(result.unsupported).toHaveLength(1);
  });

  it("includes reason in unsupported entries", () => {
    const result = filterSupportedTargets("hooks", ["codexcli"]);
    expect(result.unsupported[0]!.reason).toContain("codexcli");
    expect(result.unsupported[0]!.reason).toContain("hooks");
  });

  it("preserves order of input targets in supported list", () => {
    const result = filterSupportedTargets("skills", ["factorydroid", "claudecode"]);
    expect(result.supported).toEqual(["factorydroid", "claudecode"]);
  });

  it("single target fully supported returns it alone", () => {
    const result = filterSupportedTargets("hooks", ["claudecode"]);
    expect(result.supported).toEqual(["claudecode"]);
    expect(result.unsupported).toEqual([]);
  });
});

// ── warnUnsupported ─────────────────────────────────────────────

describe("warnUnsupported", () => {
  it("outputs nothing for empty list", () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    warnUnsupported([]);
    console.log = orig;
    expect(logs).toEqual([]);
  });

  it("outputs warning per unsupported combination", () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    const combos: UnsupportedCombination[] = [
      { category: "hooks", target: "codexcli", reason: "not supported" },
      { category: "subagents", target: "factorydroid", reason: "not supported" },
    ];
    warnUnsupported(combos);
    console.log = orig;
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain("hooks");
    expect(logs[0]).toContain("codexcli");
    expect(logs[1]).toContain("subagents");
    expect(logs[1]).toContain("factorydroid");
  });
});

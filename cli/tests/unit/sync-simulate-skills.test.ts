import { describe, expect, it } from "bun:test";
import { shouldEnableSimulateSkills, type SyncOptions } from "../../src/sync.ts";

function makeOpts(partial: Partial<SyncOptions>): SyncOptions {
  return {
    features: ["skills"],
    global: false,
    ...partial,
  };
}

describe("shouldEnableSimulateSkills", () => {
  it("returns true when skills include factorydroid", () => {
    expect(
      shouldEnableSimulateSkills(makeOpts({ targets: ["factorydroid"], features: ["skills"] })),
    ).toBe(true);
  });

  it("returns true by default targets (includes factorydroid)", () => {
    expect(shouldEnableSimulateSkills(makeOpts({ features: ["skills"] }))).toBe(true);
  });

  it("returns false for skills without factorydroid target", () => {
    expect(
      shouldEnableSimulateSkills(makeOpts({ targets: ["claudecode", "codexcli"] })),
    ).toBe(false);
  });

  it("returns false when syncing only rules", () => {
    expect(
      shouldEnableSimulateSkills(makeOpts({ features: ["rules"], targets: ["factorydroid"] })),
    ).toBe(false);
  });
});

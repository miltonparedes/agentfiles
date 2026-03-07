import { describe, expect, it } from "bun:test";
import { stripV, detectPlatformAsset } from "../../src/update.ts";

describe("stripV", () => {
  it("strips leading v", () => {
    expect(stripV("v0.1.0")).toBe("0.1.0");
  });

  it("returns as-is without leading v", () => {
    expect(stripV("0.1.0")).toBe("0.1.0");
  });

  it("handles empty string", () => {
    expect(stripV("")).toBe("");
  });

  it("strips only first v", () => {
    expect(stripV("v1.2.3-v4")).toBe("1.2.3-v4");
  });
});

describe("detectPlatformAsset", () => {
  it("returns a string for the current platform", () => {
    const asset = detectPlatformAsset();
    // We're on linux-x64 in this environment
    if (process.platform === "linux" && process.arch === "x64") {
      expect(asset).toBe("af-linux-x64");
    } else if (process.platform === "darwin" && process.arch === "arm64") {
      expect(asset).toBe("af-darwin-arm64");
    } else {
      expect(asset).toBeNull();
    }
  });

  it("returns a value matching the expected naming pattern", () => {
    const asset = detectPlatformAsset();
    if (asset) {
      expect(asset).toMatch(/^af-(linux-x64|darwin-arm64)$/);
    }
  });
});

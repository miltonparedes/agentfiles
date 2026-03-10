import { describe, expect, it } from "bun:test";
import { getHookCommand, mergeInstalledHooksWithSettings } from "../../src/sync.ts";

describe("getHookCommand", () => {
  it("keeps project-scope hook commands project-relative", () => {
    expect(getHookCommand("claudecode", "block-factory-commit.sh", false)).toBe(
      ".claude/hooks/block-factory-commit.sh",
    );
    expect(getHookCommand("factorydroid", "block-factory-commit.sh", false)).toBe(
      ".factory/hooks/block-factory-commit.sh",
    );
  });

  it("uses HOME-based commands for user-scope hook installs", () => {
    expect(getHookCommand("claudecode", "block-factory-commit.sh", true)).toBe(
      "$HOME/.claude/hooks/block-factory-commit.sh",
    );
    expect(getHookCommand("factorydroid", "block-factory-commit.sh", true)).toBe(
      "$HOME/.factory/hooks/block-factory-commit.sh",
    );
  });
});

describe("mergeInstalledHooksWithSettings", () => {
  it("preserves existing Claude hooks and replaces only the selected managed hook", () => {
    const existingSettings = JSON.stringify(
      {
        theme: "dark",
        hooks: {
          PreToolUse: [
            {
              matcher: "Write",
              hooks: [{ type: "command", command: "./manual.sh" }],
            },
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "$CLAUDE_PROJECT_DIR/.claude/hooks/block-factory-commit.sh",
                },
              ],
            },
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "$CLAUDE_PROJECT_DIR/.claude/hooks/existing-other.sh",
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    );

    const merged = mergeInstalledHooksWithSettings(
      "claudecode",
      existingSettings,
      [{ event: "preToolUse", fileName: "block-factory-commit.sh", matcher: "Bash" }],
      true,
    );

    const commands = (merged.preToolUse ?? []).map((hook) => hook.command);

    expect(commands).toContain("./manual.sh");
    expect(commands).toContain("./.claude/hooks/existing-other.sh");
    expect(commands).toContain("$HOME/.claude/hooks/block-factory-commit.sh");
    expect(commands).not.toContain("./.claude/hooks/block-factory-commit.sh");
  });

  it("preserves existing Factory Droid hooks and updates user-scope commands", () => {
    const existingSettings = JSON.stringify(
      {
        model: "x",
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "$FACTORY_PROJECT_DIR/.factory/hooks/block-factory-commit.sh",
                },
              ],
            },
            {
              hooks: [{ type: "command", command: "./custom-hook.sh" }],
            },
          ],
        },
      },
      null,
      2,
    );

    const merged = mergeInstalledHooksWithSettings(
      "factorydroid",
      existingSettings,
      [{ event: "preToolUse", fileName: "block-factory-commit.sh", matcher: "Bash" }],
      true,
    );

    const commands = (merged.preToolUse ?? []).map((hook) => hook.command);

    expect(commands).toContain("./custom-hook.sh");
    expect(commands).toContain("$HOME/.factory/hooks/block-factory-commit.sh");
    expect(commands).not.toContain("./.factory/hooks/block-factory-commit.sh");
  });
});

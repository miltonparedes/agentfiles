import { describe, expect, it } from "bun:test";
import { parseHookFrontmatter } from "../../src/helpers.ts";

describe("parseHookFrontmatter", () => {
  it("parses valid frontmatter from bash script", () => {
    const script = `#!/usr/bin/env bash
# ---
# event: preToolUse
# matcher: Bash
# description: Block committing .factory folder
# ---
input=$(cat)
echo "$input"
exit 0
`;
    const result = parseHookFrontmatter(script);
    expect(result).not.toBeNull();
    expect(result!.event).toBe("preToolUse");
    expect(result!.matcher).toBe("Bash");
    expect(result!.description).toBe("Block committing .factory folder");
  });

  it("returns null without frontmatter", () => {
    const script = `#!/usr/bin/env bash
echo "hello"
exit 0
`;
    const result = parseHookFrontmatter(script);
    expect(result).toBeNull();
  });

  it("handles optional matcher", () => {
    const script = `#!/usr/bin/env bash
# ---
# event: stop
# description: Cleanup on stop
# ---
echo "stopping"
`;
    const result = parseHookFrontmatter(script);
    expect(result).not.toBeNull();
    expect(result!.event).toBe("stop");
    expect(result!.matcher).toBeUndefined();
    expect(result!.description).toBe("Cleanup on stop");
  });

  it("handles optional description", () => {
    const script = `#!/usr/bin/env bash
# ---
# event: postToolUse
# matcher: Write
# ---
echo "done"
`;
    const result = parseHookFrontmatter(script);
    expect(result).not.toBeNull();
    expect(result!.event).toBe("postToolUse");
    expect(result!.matcher).toBe("Write");
    expect(result!.description).toBeUndefined();
  });

  it("returns null when event is missing from frontmatter", () => {
    const script = `#!/usr/bin/env bash
# ---
# matcher: Bash
# description: No event here
# ---
echo "test"
`;
    const result = parseHookFrontmatter(script);
    expect(result).toBeNull();
  });
});

import type { AgentTarget } from "./parser.ts";

// ── Artifact category type ──────────────────────────────────────

export type ArtifactCategory = "skills" | "rules" | "hooks" | "subagents";

// ── Support matrix ──────────────────────────────────────────────

/**
 * Maps each artifact category to its set of supported agent targets.
 *
 * - skills and rules use rulesync, which supports all three targets.
 * - hooks install to .claude/hooks/ — only supported by claudecode.
 * - subagents install to .claude/agents/ — only supported by claudecode.
 */
const SUPPORT_MATRIX: Record<ArtifactCategory, Set<AgentTarget>> = {
  skills: new Set(["claudecode", "codexcli", "factorydroid"]),
  rules: new Set(["claudecode", "codexcli", "factorydroid"]),
  hooks: new Set(["claudecode", "factorydroid"]),
  subagents: new Set(["claudecode"]),
};

/**
 * Reason strings for unsupported combinations, keyed by
 * `${category}:${target}`.
 */
const UNSUPPORTED_REASONS: Record<string, string> = {
  "hooks:codexcli": "hooks require .claude/hooks/ which is not supported by codexcli",
  "subagents:codexcli": "subagents require .claude/agents/ which is not supported by codexcli",
  "subagents:factorydroid":
    "subagents require .claude/agents/ which is not supported by factorydroid",
};

// ── Public API ──────────────────────────────────────────────────

export interface UnsupportedCombination {
  category: ArtifactCategory;
  target: AgentTarget;
  reason: string;
}

/**
 * Check whether a given artifact category is supported for a specific
 * agent target.
 */
export function isSupported(category: ArtifactCategory, target: AgentTarget): boolean {
  return SUPPORT_MATRIX[category].has(target);
}

/**
 * Given an artifact category and a list of requested targets, return
 * the subset of targets that actually support this category plus any
 * unsupported combinations found.
 */
export function filterSupportedTargets(
  category: ArtifactCategory,
  targets: AgentTarget[],
): { supported: AgentTarget[]; unsupported: UnsupportedCombination[] } {
  const supported: AgentTarget[] = [];
  const unsupported: UnsupportedCombination[] = [];

  for (const target of targets) {
    if (isSupported(category, target)) {
      supported.push(target);
    } else {
      const key = `${category}:${target}`;
      unsupported.push({
        category,
        target,
        reason: UNSUPPORTED_REASONS[key] ?? `${category} is not supported for target ${target}`,
      });
    }
  }

  return { supported, unsupported };
}

/**
 * Emit warning messages for unsupported artifact-target combinations.
 */
export function warnUnsupported(combinations: UnsupportedCombination[]): void {
  for (const { category, target, reason } of combinations) {
    console.log(`⚠️  Skipping ${category} for ${target}: ${reason}`);
  }
}

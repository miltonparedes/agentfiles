import * as p from "@clack/prompts";
import { loadAllMetadata, type ResourceMetadata } from "./list.ts";
import { sync } from "./sync.ts";
import { installHooks } from "./hooks.ts";
import { installSubagents } from "./subagents.ts";
import { config } from "./config.ts";
import { detectLanguages } from "./detect.ts";

// ── Types ────────────────────────────────────────────────────

type Category = "skills" | "rules" | "hooks" | "subagents";

interface CategoryDef {
  key: Category;
  label: string;
  options: Array<{ label: string; value: string }>;
}

interface Selections {
  skills: string[];
  rules: string[];
  hooks: string[];
  subagents: string[];
}

const AVAILABLE_TARGETS = [
  { label: "claudecode", value: "claudecode" },
  { label: "codexcli", value: "codexcli" },
  { label: "factorydroid", value: "factorydroid" },
];

// ── Build categories from metadata ───────────────────────────

function buildCategories(meta: ResourceMetadata, only?: Category): CategoryDef[] {
  const cats: CategoryDef[] = [];

  if (meta.skills.length > 0 && (!only || only === "skills")) {
    cats.push({
      key: "skills",
      label: "Skills",
      options: meta.skills.map((s) => ({
        label: `${s.name}${s.description ? ` — ${s.description}` : ""}`,
        value: s.name,
      })),
    });
  }

  if (meta.rules.length > 0 && (!only || only === "rules")) {
    cats.push({
      key: "rules",
      label: "Rules",
      options: meta.rules.map((r) => ({
        label: `${r.name} (${r.paths})`,
        value: r.name,
      })),
    });
  }

  if (meta.hooks.length > 0 && (!only || only === "hooks")) {
    cats.push({
      key: "hooks",
      label: "Hooks",
      options: meta.hooks.map((h) => ({
        label: h,
        value: h,
      })),
    });
  }

  if (meta.subagents.length > 0 && (!only || only === "subagents")) {
    cats.push({
      key: "subagents",
      label: "Subagents",
      options: meta.subagents.map((a) => ({
        label: `${a.name}${a.description ? ` — ${a.description}` : ""}`,
        value: a.name,
      })),
    });
  }

  return cats;
}

function needsTargetPicker(categories: CategoryDef[]): boolean {
  return categories.some((c) => c.key === "skills" || c.key === "rules");
}

// ── Cancellation helper ──────────────────────────────────────

function handleCancel(): never {
  p.cancel("Operation cancelled.");
  process.exit(0);
}

// ── Install logic ────────────────────────────────────────────

async function runInstall(
  selections: Selections,
  global: boolean,
  targets?: string[],
): Promise<void> {
  if (selections.skills.length > 0) {
    await sync({
      features: ["skills"],
      global,
      targets,
      filter: { skills: selections.skills },
    });
  }

  if (selections.rules.length > 0) {
    const langs = global ? undefined : detectLanguages(process.cwd());
    await sync({
      features: ["rules"],
      global,
      targets,
      filter: { rules: selections.rules },
      langs,
    });
  }

  if (selections.hooks.length > 0) {
    await installHooks(selections.hooks, global);
  }

  if (selections.subagents.length > 0) {
    await installSubagents(selections.subagents, global);
  }
}

// ── Public API ───────────────────────────────────────────────

export async function interactive(only?: Category): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log("Non-interactive terminal detected. Use --all/-y to install everything.");
    process.exit(1);
  }

  const meta = await loadAllMetadata();
  const allCategories = buildCategories(meta, only);

  if (allCategories.length === 0) {
    console.log("No resources found.");
    return;
  }

  p.intro("af — agentfiles");

  const needsCategoryPicker = !only && allCategories.length > 1;
  const skipLevel = config.userLevel;

  // ── Step 1: Category selection ─────────────────────────────
  let categories: CategoryDef[];

  if (needsCategoryPicker) {
    const selected = await p.multiselect({
      message: "What do you want to install?",
      options: allCategories.map((c) => ({
        label: c.label,
        value: c.key,
      })),
      required: false,
    });

    if (p.isCancel(selected)) handleCancel();

    const selectedKeys = selected as Category[];
    categories = allCategories.filter((c) => selectedKeys.includes(c.key));

    if (categories.length === 0) {
      p.outro("Nothing selected.");
      return;
    }
  } else {
    categories = allCategories;
  }

  // ── Step 2: Level selection ────────────────────────────────
  let global = config.userLevel;

  if (!skipLevel) {
    const level = await p.select({
      message: "Install to:",
      options: [
        { label: "User (~/.claude/)", value: "user" },
        { label: "Project (./.claude/)", value: "project" },
      ],
    });

    if (p.isCancel(level)) handleCancel();

    global = level === "user";
  }

  // ── Step 3: Target selection ───────────────────────────────
  let targets: string[] | undefined;

  if (needsTargetPicker(categories)) {
    const selectedTargets = await p.multiselect({
      message: "Agents/targets:",
      options: AVAILABLE_TARGETS,
      required: false,
    });

    if (p.isCancel(selectedTargets)) handleCancel();

    const picked = selectedTargets as string[];
    targets = picked.length > 0 ? picked : undefined;
  }

  // ── Step 4: Item selection per category ────────────────────
  const selections: Selections = {
    skills: [],
    rules: [],
    hooks: [],
    subagents: [],
  };

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    if (!cat) continue;
    const selected = await p.multiselect({
      message: `${cat.label} (${i + 1}/${categories.length})`,
      options: cat.options,
      required: false,
    });

    if (p.isCancel(selected)) handleCancel();

    selections[cat.key] = selected as string[];
  }

  // ── Step 5: Install ────────────────────────────────────────
  const s = p.spinner();
  s.start("Installing…");

  try {
    await runInstall(selections, global, targets);
    s.stop("Done!");
  } catch (err) {
    s.stop("Installation failed.");
    throw err;
  }

  p.outro("✅ All done!");
}

import React, { useState, useEffect } from "react";
import { render, Box, Text, useApp } from "ink";
import { MultiSelect, Select, Spinner } from "@inkjs/ui";
import { loadAllMetadata, type ResourceMetadata } from "./list.ts";
import { sync } from "./sync.ts";
import { installHooks } from "./hooks.ts";
import { installSubagents } from "./subagents.ts";
import { config } from "./config.ts";
import { detectLanguages } from "./detect.ts";

// ── Types ────────────────────────────────────────────────────

type Category = "skills" | "rules" | "hooks" | "subagents";

type Phase =
  | "choosingCategories"
  | "choosingLevel"
  | "choosingTargets"
  | "selectingItems"
  | "transition"
  | "installing"
  | "done";

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

// ── App component ────────────────────────────────────────────

function App({
  allCategories,
  needsCategoryPicker,
  initialGlobal,
  skipLevel,
}: {
  allCategories: CategoryDef[];
  needsCategoryPicker: boolean;
  initialGlobal: boolean;
  skipLevel: boolean;
}) {
  const { exit } = useApp();

  const [phase, setPhase] = useState<Phase>(
    needsCategoryPicker
      ? "choosingCategories"
      : skipLevel
        ? needsTargetPicker(allCategories)
          ? "choosingTargets"
          : "selectingItems"
        : "choosingLevel",
  );
  const [nextPhase, setNextPhase] = useState<Phase | null>(null);

  const [categories, setCategories] = useState<CategoryDef[]>(
    needsCategoryPicker ? [] : allCategories,
  );
  const [step, setStep] = useState(0);
  const [global, setGlobal] = useState(initialGlobal);
  const [targets, setTargets] = useState<string[] | undefined>(undefined);
  const [selections, setSelections] = useState<Selections>({
    skills: [],
    rules: [],
    hooks: [],
    subagents: [],
  });

  // Transition handler: waits 50ms then moves to the real next phase.
  // During "transition", no input-handling components are rendered,
  // so any pending Enter keypress in stdin is discarded.
  useEffect(() => {
    if (phase !== "transition" || !nextPhase) return;
    const timer = setTimeout(() => {
      setPhase(nextPhase);
      setNextPhase(null);
    }, 50);
    return () => clearTimeout(timer);
  }, [phase, nextPhase]);

  function transitionTo(target: Phase) {
    setNextPhase(target);
    setPhase("transition");
  }

  // Run install
  useEffect(() => {
    if (phase !== "installing") return;
    runInstall(selections, global, targets).then(() => {
      setPhase("done");
    });
  }, [phase]);

  // Exit when done
  useEffect(() => {
    if (phase === "done") exit();
  }, [phase]);

  // ── Render phases ──

  if (phase === "transition") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="cyan">
          af — agentfiles
        </Text>
        <Text dimColor>…</Text>
      </Box>
    );
  }

  if (phase === "installing") {
    return <Spinner label="Installing…" />;
  }

  if (phase === "done") {
    return <Text color="green">Done!</Text>;
  }

  if (phase === "choosingCategories") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="cyan">
          af — agentfiles
        </Text>
        <Text>
          What do you want to install? <Text dimColor>space to select, enter to confirm</Text>
        </Text>
        <MultiSelect
          options={allCategories.map((c) => ({
            label: c.label,
            value: c.key,
          }))}
          onSubmit={(selected) => {
            const filtered = allCategories.filter((c) => selected.includes(c.key));
            setCategories(filtered);
            if (filtered.length === 0) {
              setPhase("installing");
            } else if (skipLevel) {
              transitionTo(needsTargetPicker(filtered) ? "choosingTargets" : "selectingItems");
            } else {
              transitionTo("choosingLevel");
            }
          }}
        />
      </Box>
    );
  }

  if (phase === "choosingLevel") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="cyan">
          af — agentfiles
        </Text>
        <Text>
          Install to: <Text dimColor>↑/↓ to move, enter to select</Text>
        </Text>
        <Select
          options={[
            { label: "User (~/.claude/)", value: "user" },
            { label: "Project (./.claude/)", value: "project" },
          ]}
          onChange={(value) => {
            const isGlobal = value === "user";
            setGlobal(isGlobal);
            if (needsTargetPicker(categories)) {
              transitionTo("choosingTargets");
            } else {
              transitionTo("selectingItems");
            }
          }}
        />
      </Box>
    );
  }

  if (phase === "choosingTargets") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="cyan">
          af — agentfiles
        </Text>
        <Text>
          Agents/targets: <Text dimColor>space to select, enter to confirm</Text>
        </Text>
        <MultiSelect
          options={AVAILABLE_TARGETS}
          onSubmit={(selected) => {
            setTargets(selected.length > 0 ? selected : undefined);
            transitionTo("selectingItems");
          }}
        />
      </Box>
    );
  }

  // phase === "selectingItems"
  const currentCat = categories[step];
  if (!currentCat) {
    // No more categories — install
    setPhase("installing");
    return null;
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        af — agentfiles
      </Text>
      <Text>
        {currentCat.label}{" "}
        <Text dimColor>
          ({step + 1}/{categories.length}) — space to select, enter to confirm
        </Text>
      </Text>
      <MultiSelect
        options={currentCat.options}
        onSubmit={(selected) => {
          setSelections((prev) => ({
            ...prev,
            [currentCat.key]: selected,
          }));

          if (step + 1 < categories.length) {
            setStep(step + 1);
            transitionTo("selectingItems");
          } else {
            setPhase("installing");
          }
        }}
      />
    </Box>
  );
}

// ── Public API ───────────────────────────────────────────────

export async function interactive(only?: Category): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log("Non-interactive terminal detected. Use --all/-y to install everything.");
    process.exit(1);
  }

  const meta = await loadAllMetadata();
  const categories = buildCategories(meta, only);

  if (categories.length === 0) {
    console.log("No resources found.");
    return;
  }

  const needsCategoryPicker = !only && categories.length > 1;
  const skipLevel = config.userLevel;

  const instance = render(
    <App
      allCategories={categories}
      needsCategoryPicker={needsCategoryPicker}
      initialGlobal={config.userLevel}
      skipLevel={skipLevel}
    />,
  );
  await instance.waitUntilExit();
}

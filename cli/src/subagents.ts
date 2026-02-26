import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config, HOME } from "./config.ts";
import { backupFile } from "./helpers.ts";
import { listSubagentFiles, readSubagentContent } from "./assets.ts";

export async function installSubagents(names?: string[], global = true): Promise<void> {
  const allFiles = await listSubagentFiles();
  const base = global ? HOME : process.cwd();

  for (const fileName of allFiles) {
    const agentName = fileName.replace(/\.md$/, "");
    if (names && !names.includes(agentName)) continue;

    const content = await readSubagentContent(fileName);
    if (!content) continue;

    const agentsDest = join(base, ".claude", "agents");

    if (config.dryRun) {
      console.log(`  [DRY-RUN] Subagent: ${agentName} -> ${agentsDest}/${fileName}`);
    } else {
      mkdirSync(agentsDest, { recursive: true });
      const destPath = join(agentsDest, fileName);
      await backupFile(destPath, "agents");
      await Bun.write(destPath, content);
      console.log(`  ✅ Subagent installed: ${agentName}`);
    }
  }
}

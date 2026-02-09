import { mkdirSync, readdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { config, HOME, HOOKS_DIR, dirExists } from "./config.ts";
import { backupFile } from "./helpers.ts";

export async function installHooks() {
  let found = 0;

  if (dirExists(HOOKS_DIR)) {
    for (const entry of readdirSync(HOOKS_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".sh") && !entry.name.endsWith(".bash")) continue;

      found++;
      const hooksDest = join(HOME, ".claude", "hooks");

      if (config.dryRun) {
        console.log(`  [DRY-RUN] Hook: ${entry.name} -> ${hooksDest}/${entry.name}`);
      } else {
        mkdirSync(hooksDest, { recursive: true });
        const destPath = join(hooksDest, entry.name);
        await backupFile(destPath, "hooks");
        await Bun.write(destPath, Bun.file(join(HOOKS_DIR, entry.name)));
        chmodSync(destPath, 0o755);
        console.log(`  ✅ Hook installed: ${entry.name}`);
      }
    }
  }

  if (found === 0) {
    console.log("  ℹ️  No hook scripts found (add .sh files to hooks/)");
  }
}

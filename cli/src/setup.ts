import { existsSync, symlinkSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { dirExists, saveConfig, HOME } from "./config.ts";

const LOCAL_BIN = join(HOME, ".local", "bin");

export async function setup(explicitPath?: string) {
  const repoPath = explicitPath ? resolve(explicitPath) : process.cwd();

  // 1. Validate repo structure
  const skillsDir = join(repoPath, "skills");
  const rulesDir = join(repoPath, "rules");
  if (!dirExists(skillsDir) || !dirExists(rulesDir)) {
    console.log("❌ Not an agentfiles repo (missing skills/ or rules/ directory).");
    console.log(
      `   ${explicitPath ? `The provided path does not point to` : "Run this command from the root of"} the agentfiles repository.`,
    );
    process.exit(1);
  }

  // 2. Write config
  saveConfig({ repoPath });
  console.log(`✅ Saved repo path: ${repoPath}`);

  // 3. Symlink dist/af → ~/.local/bin/af
  const distBin = join(repoPath, "dist", "af");
  if (existsSync(distBin)) {
    const target = join(LOCAL_BIN, "af");
    try {
      if (existsSync(target)) unlinkSync(target);
      symlinkSync(distBin, target);
      console.log(`✅ Symlinked ${distBin} → ${target}`);
    } catch {
      console.log(`⚠️  Could not symlink to ${target}. You may need to do this manually:`);
      console.log(`   ln -sf ${distBin} ${target}`);
    }

    // 4. Check PATH
    const pathDirs = (process.env.PATH ?? "").split(":");
    if (!pathDirs.includes(LOCAL_BIN)) {
      console.log("");
      console.log(`⚠️  ${LOCAL_BIN} is not in your PATH. Add it:`);
      console.log(`   export PATH="${LOCAL_BIN}:$PATH"`);
    }
  } else {
    console.log("");
    console.log(`ℹ️  No compiled binary found at dist/af.`);
    console.log(`   Run 'bun run build' first, then re-run setup to create the symlink.`);
  }

  console.log("");
  console.log("Done! The 'af' binary will now read skills/rules from this repo at runtime.");
}

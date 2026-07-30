#!/usr/bin/env node
// Build the Windows installer via a pnpm-deploy step, working around a real
// packaging bug: electron-builder's default asar packer does not correctly
// pack pnpm's isolated node_modules layout (each package's node_modules
// contains symlinks to its own siblings inside `.pnpm/<pkg>/node_modules/`,
// not real files). Confirmed on a real Windows install: the app crashed on
// launch with "Cannot find module 'fastparallel'" (a transitive dependency
// of `aedes`, present on disk via that sibling symlink, silently dropped
// from app.asar). `pnpm deploy` alone does not fix this -- it only
// dereferences the *top-level* node_modules/<pkg> entries, the transitive
// dependency symlinks one level deeper are untouched. Forcing
// `node-linker=hoisted` for just this deploy step produces a genuinely flat
// node_modules (every package, including transitive deps, as a real
// top-level directory) that electron-builder packs correctly -- verified by
// extracting the resulting app.asar and successfully requiring+instantiating
// `aedes` directly from the extracted files.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, appendFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(agentRoot, "../..");
const deployDir = path.join(agentRoot, ".build-win-deploy");

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: agentRoot, ...opts });
}

// 1. Build renderer/main/preload as usual (SAAS_BASE_URL override, if set,
//    flows through electron.vite.config.ts's existing `define` as before).
run("electron-vite build");

// 2. Fresh deploy directory with a flat, hoisted node_modules -- see header
//    comment for why this step exists.
rmSync(deployDir, { recursive: true, force: true });
mkdirSync(deployDir, { recursive: true });
run(`pnpm --filter @3pb/agent deploy --prod --legacy "${deployDir}"`, {
  cwd: repoRoot,
  env: { ...process.env, npm_config_node_linker: "hoisted" },
});

// 3. Copy the build output into the deploy directory (pnpm deploy only
//    snapshots source files it knows about via package.json/.gitignore --
//    `out/` is gitignored, so it isn't picked up automatically).
cpSync(path.join(agentRoot, "out"), path.join(deployDir, "out"), { recursive: true });

// 4. Copy electron-builder.yml, pinning the Electron version explicitly.
//    `--prod` deploy excludes devDependencies (electron itself is one, by
//    design -- customers never need it), so electron-builder can't infer
//    the target version from an installed `electron` package the way it
//    normally would; without this it fails with "Cannot compute electron
//    version from installed node modules".
const electronPkg = JSON.parse(
  readFileSync(path.join(agentRoot, "node_modules/electron/package.json"), "utf8"),
);
const builderConfig = readFileSync(path.join(agentRoot, "electron-builder.yml"), "utf8");
const deployConfigPath = path.join(deployDir, "electron-builder.yml");
cpSync(path.join(agentRoot, "electron-builder.yml"), deployConfigPath);
appendFileSync(deployConfigPath, `electronVersion: ${electronPkg.version}\n`);

// 5. Package. electron-builder resolves its own binary from `agentRoot`'s
//    devDependencies (run with agentRoot as cwd), but packages the app
//    found at --projectDir.
run(`npx electron-builder --win --projectDir "${deployDir}"`);

// 6. Copy the finished installer(s) back to apps/agent/release/, the
//    conventional/expected output location (matches `pack`/`dist` scripts).
const releaseOut = path.join(agentRoot, "release");
mkdirSync(releaseOut, { recursive: true });
const deployRelease = path.join(deployDir, "release");
for (const name of readdirSync(deployRelease)) {
  if (name === "win-unpacked" || name === "builder-effective-config.yaml") continue;
  cpSync(path.join(deployRelease, name), path.join(releaseOut, name));
}

// 7. Clean up the deploy directory -- it's already gitignored, but leaving
//    a stale full-source-tree copy around risks confusing other tooling
//    (it happened once: vitest's default test glob picked up duplicate
//    test files from inside it before `vitest.config.ts` explicitly
//    excluded this path too -- keep both defenses, this one avoids the
//    lingering copy in the first place).
rmSync(deployDir, { recursive: true, force: true });

console.log(`\nInstaller ready: ${releaseOut}`);

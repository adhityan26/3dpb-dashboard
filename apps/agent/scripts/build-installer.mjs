#!/usr/bin/env node
// Build the Windows or Mac installer via a pnpm-deploy step, working around a real
// packaging bug: electron-builder's default asar packer does not correctly
// pack pnpm's isolated node_modules layout (each package's node_modules
// contains symlinks to its own siblings inside `.pnpm/<pkg>/node_modules/`,
// not real files). Confirmed on a real Windows install: the app crashed on
// launch with "Cannot find module 'fastparallel'" (a transitive dependency
// of `aedes`, present on disk via that sibling symlink, silently dropped
// from app.asar). This is NOT platform-specific -- electron-builder's asar
// packer is the same code regardless of --win/--mac, so a plain `mac` build
// via `pack`/`dist` would very likely hit the identical bug -- which is why
// this script (not just the win one) is used for BOTH platforms. `pnpm
// deploy` alone does not fix this -- it only dereferences the *top-level*
// node_modules/<pkg> entries, the transitive dependency symlinks one level
// deeper are untouched. Forcing `node-linker=hoisted` for just this deploy
// step produces a genuinely flat node_modules (every package, including
// transitive deps, as a real top-level directory) that electron-builder
// packs correctly -- verified by extracting the resulting app.asar and
// successfully requiring+instantiating `aedes` directly from the extracted
// files.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, appendFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platformFlag = process.argv[2];
if (platformFlag !== "--win" && platformFlag !== "--mac") {
  console.error("Usage: node scripts/build-installer.mjs --win|--mac");
  process.exit(1);
}
const platformTag = platformFlag.slice(2); // "win" | "mac"

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(agentRoot, "../..");
const deployDir = path.join(agentRoot, `.build-${platformTag}-deploy`);
// Kalau dimount, hasil build selalu ikut dikumpulkan ke sini juga (selain apps/agent/release/
// seperti biasa) biar gampang ambil installer-nya buat coba di laptop lain -- lihat langkah 7.
const NAS_DIR = "/Volumes/Data/Documents/slizebiz binary";

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
const deployConfigPath = path.join(deployDir, "electron-builder.yml");
cpSync(path.join(agentRoot, "electron-builder.yml"), deployConfigPath);
appendFileSync(deployConfigPath, `electronVersion: ${electronPkg.version}\n`);

// 5. Package. electron-builder resolves its own binary from `agentRoot`'s
//    devDependencies (run with agentRoot as cwd), but packages the app
//    found at --projectDir.
run(`npx electron-builder ${platformFlag} --projectDir "${deployDir}"`);

// 6. Copy the finished installer(s) back to apps/agent/release/, the
//    conventional/expected output location (matches `pack`/`dist` scripts).
//    Skip directories (the *-unpacked build output -- "win-unpacked",
//    "mac"/"mac-arm64"/"mac-universal" depending on target, name varies) and
//    the metadata file; keep every other FILE (installer, blockmap,
//    latest*.yml, etc.) regardless of platform-specific naming.
const releaseOut = path.join(agentRoot, "release");
mkdirSync(releaseOut, { recursive: true });
const deployRelease = path.join(deployDir, "release");
const METADATA_FILES = new Set(["builder-effective-config.yaml", "builder-debug.yml"]);
const artifactNames = readdirSync(deployRelease).filter((name) => {
  if (METADATA_FILES.has(name)) return false;
  return !statSync(path.join(deployRelease, name)).isDirectory();
});
for (const name of artifactNames) {
  cpSync(path.join(deployRelease, name), path.join(releaseOut, name));
}

// 7. Also drop a copy on the NAS (kalau di-mount) supaya gampang diambil dari
//    laptop lain buat install/coba -- best-effort, jangan gagalkan build
//    kalau NAS-nya kebetulan gak ke-mount di mesin ini.
if (existsSync(NAS_DIR)) {
  for (const name of artifactNames) {
    cpSync(path.join(deployRelease, name), path.join(NAS_DIR, name));
  }
  console.log(`Juga disalin ke NAS: ${NAS_DIR}`);
} else {
  console.warn(`NAS folder tidak ke-mount (${NAS_DIR}) -- lewati, installer tetap ada di ${releaseOut}`);
}

// 8. Clean up the deploy directory -- it's already gitignored, but leaving
//    a stale full-source-tree copy around risks confusing other tooling
//    (it happened once: vitest's default test glob picked up duplicate
//    test files from inside it before `vitest.config.ts` explicitly
//    excluded this path too -- keep both defenses, this one avoids the
//    lingering copy in the first place).
rmSync(deployDir, { recursive: true, force: true });

console.log(`\nInstaller ready: ${releaseOut}`);

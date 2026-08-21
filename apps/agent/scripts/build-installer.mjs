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
import { AwsClient } from "aws4fetch";
import { config as loadDotenv } from "dotenv";

const platformFlag = process.argv[2];
if (platformFlag !== "--win" && platformFlag !== "--mac") {
  console.error("Usage: node scripts/build-installer.mjs --win|--mac [--upload|--upload-only]");
  process.exit(1);
}
const platformTag = platformFlag.slice(2); // "win" | "mac"

// --upload: build seperti biasa lalu upload hasilnya ke R2 sebagai "latest" (nimpa yang
// customer download). --upload-only: skip build sepenuhnya, upload artifact yang SUDAH ada
// di release/ untuk commit HEAD saat ini -- guna: retry upload gagal tanpa nge-build ulang
// installer ~100-120MB. Default (tanpa flag ini) TIDAK pernah upload -- build eksperimen/
// testing biasa harus eksplisit minta upload, supaya gak nimpa "latest" gak sengaja.
const shouldUpload = process.argv.includes("--upload");
const uploadOnly = process.argv.includes("--upload-only");

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(agentRoot, "../..");
const deployDir = path.join(agentRoot, `.build-${platformTag}-deploy`);
// Kalau dimount, hasil build selalu ikut dikumpulkan ke sini juga (selain apps/agent/release/
// seperti biasa) biar gampang ambil installer-nya buat coba di laptop lain -- lihat langkah 7.
const NAS_DIR = "/Volumes/Data/Documents/slizebiz binary";
const releaseOut = path.join(agentRoot, "release");

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: agentRoot, ...opts });
}

// Commit hash git buat penamaan installer (electron-builder.yml's artifactName) & footer
// dalam-app (via electron.vite.config.ts) -- selama fase staging versi package.json tak
// pernah naik tiap rebuild (butuh konfirmasi eksplisit user), jadi ini satu-satunya cara
// bedain "build yang saya test barusan" dari build sebelumnya.
const commitHash = execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim();

// R2 target per platform -- key/content-type harus persis sama dengan yang dibaca
// apps/saas/app/api/agent/binary/[platform]/route.ts (BINARIES map di sana).
const R2_TARGET = {
  win: { key: "agent/latest/win.exe", contentType: "application/x-msdownload", glob: (hash) => `Slizebiz Agent-Setup-0.0.1-${hash}.exe` },
  mac: { key: "agent/latest/mac.dmg", contentType: "application/x-apple-diskimage", glob: (hash) => `Slizebiz Agent-0.0.1-${hash}.dmg` },
}[platformTag];

async function uploadToR2() {
  // Best-effort load kredensial dari apps/saas/.env.deploy (satu bucket R2 dipakai bareng
  // apps/saas). File ini gitignored -- di git worktree manapun selain checkout utama dia TAK
  // IKUT ke-copy, jadi selalu resolve lewat git-common-dir (selalu nunjuk checkout utama,
  // dari worktree manapun script ini dijalankan), bukan repoRoot (yang bisa jadi worktree).
  // Kalau file gak ada di sana juga, atau var sudah di-export manual di shell, ini no-op.
  const gitCommonDir = execSync("git rev-parse --git-common-dir", { cwd: agentRoot }).toString().trim();
  const mainRepoRoot = path.resolve(gitCommonDir, "..");
  loadDotenv({ path: path.join(mainRepoRoot, "apps/saas/.env.deploy") });

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    console.error("R2 env vars tidak lengkap (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET) -- cek apps/saas/.env.deploy atau export manual.");
    process.exit(1);
  }

  const artifactPath = path.join(releaseOut, R2_TARGET.glob(commitHash));
  if (!existsSync(artifactPath)) {
    console.error(`Artifact tidak ditemukan: ${artifactPath}\n(kalau pakai --upload-only, pastikan sudah ada build untuk commit ${commitHash} di release/ -- build ulang tanpa --upload-only dulu kalau belum ada)`);
    process.exit(1);
  }

  const body = readFileSync(artifactPath);
  const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${R2_TARGET.key}`;

  console.log(`\nUploading ${artifactPath} (${(body.length / 1024 / 1024).toFixed(1)} MB) -> ${R2_TARGET.key} ...`);
  const res = await client.fetch(url, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": R2_TARGET.contentType,
      "x-amz-meta-version": JSON.parse(readFileSync(path.join(agentRoot, "package.json"), "utf8")).version,
      "x-amz-meta-commit": commitHash,
    },
  });
  if (!res.ok) {
    console.error(`Upload gagal: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`Upload OK: ${R2_TARGET.key} (commit ${commitHash})`);
}

if (uploadOnly) {
  await uploadToR2();
  process.exit(0);
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
//    found at --projectDir. COMMIT_HASH env var feeds electron-builder.yml's
//    artifactName template (${env.COMMIT_HASH}).
run(`npx electron-builder ${platformFlag} --projectDir "${deployDir}"`, {
  env: { ...process.env, COMMIT_HASH: commitHash },
});

// 6. Copy the finished installer(s) back to apps/agent/release/, the
//    conventional/expected output location (matches `pack`/`dist` scripts).
//    Skip directories (the *-unpacked build output -- "win-unpacked",
//    "mac"/"mac-arm64"/"mac-universal" depending on target, name varies) and
//    the metadata file; keep every other FILE (installer, blockmap,
//    latest*.yml, etc.) regardless of platform-specific naming.
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

console.log(`\nInstaller ready: ${releaseOut} (commit ${commitHash})`);

// 9. Upload ke R2 sebagai "latest" HANYA kalau diminta eksplisit lewat --upload -- default
//    build TIDAK pernah nimpa apa yang customer download (lihat komentar shouldUpload di atas).
if (shouldUpload) {
  await uploadToR2();
}

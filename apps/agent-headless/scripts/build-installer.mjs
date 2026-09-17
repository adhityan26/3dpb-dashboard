#!/usr/bin/env node
// Package the headless daemon into the arm64 release tarball install.sh expects, and
// (opsional) upload ke R2 sebagai object publik yang di-serve lewat releases.slizebiz.com.
// Beda dari apps/agent/scripts/build-installer.mjs: tak ada electron-builder/asar di sini --
// esbuild's bundle (scripts/build.mjs) sudah menghasilkan satu file JS yang jalan berdiri
// sendiri, jadi packaging-nya cuma tar dari dist/ + install/.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AwsClient } from "aws4fetch";
import { config as loadDotenv } from "dotenv";

// --upload: build seperti biasa lalu upload hasilnya ke R2 sebagai "latest" (nimpa yang
// install.sh download). --upload-only: skip build, upload tarball yang SUDAH ada di release/
// untuk commit HEAD saat ini. Default (tanpa flag) TIDAK pernah upload -- sama seperti pola
// apps/agent, supaya build eksperimen tak nimpa "latest" tanpa sengaja.
const shouldUpload = process.argv.includes("--upload");
const uploadOnly = process.argv.includes("--upload-only");

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "../..");
const releaseOut = path.join(appRoot, "release");
const TARBALL_NAME = "agent-headless-linux-arm64.tar.gz";

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: appRoot, ...opts });
}

// Commit hash dipakai sebagai metadata R2 (x-amz-meta-commit), sama seperti apps/agent --
// bukan bagian dari nama file (install.sh selalu minta "latest", tak ada versi di URL).
const commitHash = execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim();

const R2_KEY = "agent-headless/latest/linux-arm64.tar.gz";
const R2_CONTENT_TYPE = "application/gzip";

async function uploadToR2() {
  // Kredensial sama dengan apps/agent -- satu bucket R2 dipakai bareng, lihat komentar di
  // apps/agent/scripts/build-installer.mjs untuk alasan resolve lewat git-common-dir.
  const gitCommonDir = execSync("git rev-parse --git-common-dir", { cwd: appRoot }).toString().trim();
  const mainRepoRoot = path.resolve(gitCommonDir, "..");
  loadDotenv({ path: path.join(mainRepoRoot, "apps/saas/.env.deploy") });

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    console.error("R2 env vars tidak lengkap (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET) -- cek apps/saas/.env.deploy atau export manual.");
    process.exit(1);
  }

  const artifactPath = path.join(releaseOut, TARBALL_NAME);
  if (!existsSync(artifactPath)) {
    console.error(`Artifact tidak ditemukan: ${artifactPath}\n(kalau pakai --upload-only, build dulu tanpa flag itu)`);
    process.exit(1);
  }

  const body = readFileSync(artifactPath);
  const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${R2_KEY}`;

  console.log(`\nUploading ${artifactPath} (${(body.length / 1024 / 1024).toFixed(1)} MB) -> ${R2_KEY} ...`);
  const res = await client.fetch(url, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": R2_CONTENT_TYPE,
      "x-amz-meta-commit": commitHash,
    },
  });
  if (!res.ok) {
    console.error(`Upload gagal: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`Upload OK: ${R2_KEY} (commit ${commitHash})`);
  console.log(
    "\nCATATAN: object ini di-upload ke bucket privat yang sama dengan installer win/mac.\n" +
    "install.sh men-download lewat URL publik (releases.slizebiz.com atau *.r2.dev) -- \n" +
    "bucket/custom-domain publik untuk key ini BELUM di-provision (butuh setup lewat dashboard\n" +
    "Cloudflare: aktifkan public access / bind custom domain ke bucket, lalu arahkan\n" +
    "releases.slizebiz.com ke situ). Sampai itu selesai, object ini ada di R2 tapi tidak\n" +
    "bisa diakses oleh curl di install.sh.",
  );
}

if (uploadOnly) {
  await uploadToR2();
  process.exit(0);
}

// 1. Build bundle-nya (esbuild single-file, sudah termasuk build-info.json).
run("node scripts/build.mjs");

// 2. Susun staging dir persis seperti yang install.sh harapkan setelah `tar -xz`:
//    dist/index.mjs (+ build-info.json) dan install/slizebiz-agent.service.
const stagingDir = path.join(appRoot, ".release-staging");
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
cpSync(path.join(appRoot, "dist"), path.join(stagingDir, "dist"), { recursive: true });
mkdirSync(path.join(stagingDir, "install"), { recursive: true });
cpSync(
  path.join(appRoot, "install/slizebiz-agent.service"),
  path.join(stagingDir, "install/slizebiz-agent.service"),
);

// 3. Tar dari DALAM staging dir supaya path di dalam arsip relatif (dist/..., install/...),
//    bukan absolut -- sesuai asumsi install.sh (`tar -xz -C "$VERSION_DIR"`).
mkdirSync(releaseOut, { recursive: true });
const tarballPath = path.join(releaseOut, TARBALL_NAME);
run(`tar -czf "${tarballPath}" dist install`, { cwd: stagingDir });

// 4. Bersihkan staging dir -- sudah gitignored juga, tapi jangan biarkan tergeletak.
rmSync(stagingDir, { recursive: true, force: true });

console.log(`\nRelease tarball siap: ${tarballPath} (commit ${commitHash})`);

// 5. Upload ke R2 HANYA kalau diminta eksplisit -- lihat catatan shouldUpload di atas.
if (shouldUpload) {
  await uploadToR2();
}

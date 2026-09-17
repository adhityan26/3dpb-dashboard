import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, mkdtempSync, mkdirSync, symlinkSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const distEntry = join(pkgRoot, "dist", "index.mjs");

// Smoke test NYATA, bukan mock -- jalanin esbuild bundler beneran lalu eksekusi dist/index.mjs
// beneran pakai Node. Ini poin utama Task 13: buktiin bundle-nya bisa jalan standalone tanpa
// node_modules (semua dependency ke-bundle, termasuk agent-core/printer-monitor-core yang
// diekspor sebagai .ts mentah). Kalau ini di-mock, task-nya kehilangan makna.
describe("build.mjs bundle-and-run smoke test", () => {
  it(
    "bundle dist/index.mjs lalu jalanin --print-token, hasilnya 64 hex char & exit 0",
    () => {
      execFileSync("node", [join(__dirname, "build.mjs")], { cwd: pkgRoot, stdio: "pipe" });
      expect(existsSync(distEntry)).toBe(true);
      expect(existsSync(join(pkgRoot, "dist", "build-info.json"))).toBe(true);

      const tmpDataDir = mkdtempSync(join(tmpdir(), "agent-headless-smoketest-"));
      try {
        const stdout = execFileSync("node", [distEntry, "--print-token"], {
          env: { ...process.env, AGENT_DATA_DIR: tmpDataDir },
        })
          .toString()
          .trim();
        expect(stdout).toMatch(/^[0-9a-f]{64}$/);

        // Idempoten -- panggilan kedua di data dir yang sama harus balikin token sama persis.
        const stdoutAgain = execFileSync("node", [distEntry, "--print-token"], {
          env: { ...process.env, AGENT_DATA_DIR: tmpDataDir },
        })
          .toString()
          .trim();
        expect(stdoutAgain).toBe(stdout);
      } finally {
        rmSync(tmpDataDir, { recursive: true, force: true });
      }
    },
    60_000,
  );

  // Regresi bug nyata yang ditemukan lewat packaging manual (bukan lewat 15 task/review
  // sebelumnya, semua invoke dist/index.mjs LANGSUNG dari folder build): install.sh membuat
  // symlink /opt/slizebiz-agent/current -> releases/<timestamp>/, lalu ExecStart/--print-token
  // SELALU lewat symlink itu, persis pola di sini. Sebelum fix, import.meta.url (di-resolve
  // Node ke real path) tidak pernah cocok dengan process.argv[1] literal (lewat symlink),
  // jadi main() diam-diam tidak pernah terpanggil -- exit 0 tanpa token, tanpa daemon jalan,
  // tanpa error apapun di journalctl.
  it(
    "invoke dist/index.mjs LEWAT SYMLINK (pola install.sh: current -> releases/<ts>) tetap jalan",
    () => {
      execFileSync("node", [join(__dirname, "build.mjs")], { cwd: pkgRoot, stdio: "pipe" });

      const stagingRoot = mkdtempSync(join(tmpdir(), "agent-headless-symlinktest-"));
      const tmpDataDir = mkdtempSync(join(tmpdir(), "agent-headless-symlinktest-data-"));
      try {
        const releaseDir = join(stagingRoot, "releases", "20260101000000");
        mkdirSync(releaseDir, { recursive: true });
        cpSync(join(pkgRoot, "dist"), join(releaseDir, "dist"), { recursive: true });
        const currentLink = join(stagingRoot, "current");
        symlinkSync(releaseDir, currentLink);

        const stdout = execFileSync("node", [join(currentLink, "dist", "index.mjs"), "--print-token"], {
          env: { ...process.env, AGENT_DATA_DIR: tmpDataDir },
        })
          .toString()
          .trim();
        expect(stdout).toMatch(/^[0-9a-f]{64}$/);
      } finally {
        rmSync(stagingRoot, { recursive: true, force: true });
        rmSync(tmpDataDir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

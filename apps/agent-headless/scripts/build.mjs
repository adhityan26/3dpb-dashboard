import { build } from "esbuild";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = join(__dirname, "..", "dist");

if (existsSync(outdir)) rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [join(__dirname, "..", "src", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: join(outdir, "index.mjs"),
  // agent-core diekspor sebagai .ts mentah (packages/agent-core/package.json "exports":
  // "./src/index.ts") -- esbuild resolve dan transpile-nya langsung sebagai bagian bundle,
  // tidak perlu package terpisah di-publish/build dulu.
  external: [], // semua dependency (aedes, mqtt, basic-ftp, dst) pure JS, dibundel semua
  // Beberapa dependency CJS (readable-stream/bl via mqtt-packet) punya `require(...)` dinamis
  // untuk builtin Node (mis. "stream") yang lolos dari analisis statis esbuild -- kalau output
  // ESM murni, dynamic require itu jadi stub yang throw saat run ("Dynamic require of stream is
  // not supported", ketauan dari real smoke test run dist/index.mjs, bukan tebakan). Fix standar
  // esbuild: suntik shim `require` asli via createRequire supaya call itu tetap resolve saat runtime.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

console.log(`Bundled to ${join(outdir, "index.mjs")}`);

execSync(`node ${join(__dirname, "build-info.mjs")}`, { stdio: "inherit" });

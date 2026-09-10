import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

let commitHash = "nogit";
try {
  commitHash = execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
} catch {
  // git tidak tersedia saat build -- pertahankan fallback "nogit", cocok dengan bentuk fallback getNodeBuildInfo() sendiri
}

writeFileSync(
  join(__dirname, "..", "dist", "build-info.json"),
  JSON.stringify({ version: pkg.version, commitHash }, null, 2),
);
console.log(`build-info.json written: version=${pkg.version} commitHash=${commitHash}`);

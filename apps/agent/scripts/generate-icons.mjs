#!/usr/bin/env node
// One-off (dev-time) script: render src/renderer/public/logo.svg into the static icon
// assets this app needs. Run manually with `pnpm generate-icons` whenever logo.svg
// changes; output is committed like any other static asset -- `sharp` never ships
// inside the packaged app (it's a devDependency only, run here, not imported by any
// main/renderer source file), so this adds zero packaging risk to the actual build.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoPath = path.join(agentRoot, "src/renderer/public/logo.svg");

// build/icon.png: read automatically by electron-builder (convention: build/icon.png) to
// derive the app icon for BOTH mac (.icns) and win (.ico) -- 1024x1024 is electron-builder's
// recommended minimum source size.
const buildDir = path.join(agentRoot, "build");
mkdirSync(buildDir, { recursive: true });
await sharp(logoPath).resize(1024, 1024).png().toFile(path.join(buildDir, "icon.png"));

// resources/tray-icon.png: loaded at RUNTIME by src/main/tray.ts via app.getAppPath() --
// see that file's header comment for why it's resources/ and not the renderer's public/.
// 32px is standard for a colored (non-template) tray icon.
const resourcesDir = path.join(agentRoot, "resources");
mkdirSync(resourcesDir, { recursive: true });
await sharp(logoPath).resize(32, 32).png().toFile(path.join(resourcesDir, "tray-icon.png"));

console.log(`Ikon dibuat:\n  ${path.join(buildDir, "icon.png")}\n  ${path.join(resourcesDir, "tray-icon.png")}`);

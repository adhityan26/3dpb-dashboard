import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface CachedDevice {
  shortCode: string;
  label: string;
  printerType: string;
}

function cacheFilePath(): string {
  return path.join(app.getPath("userData"), "device-cache.json");
}

/** Non-rahasia (label/tipe doang) — plain JSON, TANPA enkripsi. Dipakai rekonstruksi Engine pas SaaS unreachable. */
export async function loadDeviceCache(): Promise<CachedDevice[]> {
  const filePath = cacheFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as CachedDevice[];
  } catch {
    return [];
  }
}

export async function saveDeviceCache(devices: CachedDevice[]): Promise<void> {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cacheFilePath(), JSON.stringify(devices));
}

import fs from "node:fs";
import path from "node:path";
import type { PathProvider } from "./interfaces";

export interface CachedDevice {
  shortCode: string;
  label: string;
  printerType: string;
  model?: string | null;
}

function cacheFilePath(pathProvider: PathProvider): string {
  return path.join(pathProvider.userDataDir(), "device-cache.json");
}

/** Non-rahasia (label/tipe doang) — plain JSON, TANPA enkripsi. Dipakai rekonstruksi Engine pas SaaS unreachable. */
export async function loadDeviceCache(pathProvider: PathProvider): Promise<CachedDevice[]> {
  const filePath = cacheFilePath(pathProvider);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as CachedDevice[];
  } catch {
    return [];
  }
}

export async function saveDeviceCache(pathProvider: PathProvider, devices: CachedDevice[]): Promise<void> {
  const dir = pathProvider.userDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cacheFilePath(pathProvider), JSON.stringify(devices));
}

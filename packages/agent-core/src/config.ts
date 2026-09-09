// packages/agent-core/src/config.ts
import fs from "node:fs";
import path from "node:path";
import type { PathProvider } from "./interfaces";

export interface AgentConfig {
  saasBaseUrl: string;
}

const DEFAULT_SAAS_BASE_URL = "https://app.slizebiz.com";

function configFilePath(pathProvider: PathProvider): string {
  return path.join(pathProvider.userDataDir(), "config.json");
}

/**
 * Precedence: env var runtime (kalau di-set SAAT INI, bukan cuma saat file pertama ditulis)
 * > config.json (kalau sudah ada) > default. Config yang SUDAH ADA tidak pernah ditimpa file-nya
 * oleh env var -- env var cuma jadi SEED nilai awal saat file belum ada sama sekali. Field
 * saasBaseUrl string kosong ("") eksplisit di config TETAP dianggap kosong (bukan diam-diam
 * fallback default) -- mempertahankan perilaku "gagal keras kalau config rusak" dari kode lama.
 */
export async function loadOrCreateConfig(pathProvider: PathProvider, envSeed: string | undefined): Promise<AgentConfig> {
  const filePath = configFilePath(pathProvider);
  let stored: AgentConfig;

  if (fs.existsSync(filePath)) {
    try {
      stored = JSON.parse(fs.readFileSync(filePath, "utf8")) as AgentConfig;
    } catch {
      // Corrupt/hand-edited config.json: fall back to an in-memory value derived
      // from envSeed/default so bootstrap() can still register IPC handlers.
      // We deliberately do NOT overwrite the file on disk -- the operator's
      // broken file must stay in place so they notice and fix it themselves.
      stored = { saasBaseUrl: envSeed || DEFAULT_SAAS_BASE_URL };
    }
  } else {
    const dir = pathProvider.userDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    stored = { saasBaseUrl: envSeed || DEFAULT_SAAS_BASE_URL };
    fs.writeFileSync(filePath, JSON.stringify(stored, null, 2));
  }

  // Env var runtime tetap menang DI ATAS nilai file untuk resolusi PANGGILAN INI (dev/staging
  // override tanpa perlu edit config.json manual), tapi tidak pernah menulis balik ke file.
  return { saasBaseUrl: envSeed || stored.saasBaseUrl };
}

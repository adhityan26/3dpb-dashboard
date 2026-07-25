import { openLocalDb } from "./db";
import {
  DEFAULT_LOCAL_SETTINGS,
  type LocalSettings,
} from "@/lib/kalkulator/local-settings";

const STORE = "settings";

async function db() {
  return openLocalDb();
}

/** Muat setting user; default bila tak ada / IndexedDB gagal. */
export async function loadSettings(userId: string): Promise<LocalSettings> {
  try {
    const database = await db();
    const rec = (await database.get(STORE, userId)) as
      | { userId: string; settings: LocalSettings }
      | undefined;
    database.close();
    if (!rec?.settings) return DEFAULT_LOCAL_SETTINGS;
    return { ...DEFAULT_LOCAL_SETTINGS, ...rec.settings };
  } catch {
    return DEFAULT_LOCAL_SETTINGS;
  }
}

export async function saveSettings(
  userId: string,
  settings: LocalSettings
): Promise<void> {
  const database = await db();
  try {
    await database.put(STORE, { userId, settings });
  } finally {
    database.close();
  }
}

export async function resetSettings(userId: string): Promise<void> {
  try {
    const database = await db();
    try {
      await database.delete(STORE, userId);
    } finally {
      database.close();
    }
  } catch {
    /* noop */
  }
}

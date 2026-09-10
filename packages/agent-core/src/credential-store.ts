import { randomInt, randomBytes } from "node:crypto";
import type { CredentialStore, Logger } from "./interfaces";

export interface DeviceSecret {
  ip: string;
  serial: string;
  accessCode: string;
}

export interface CredentialBlob {
  agentToken: string | null;
  devices: Record<string, DeviceSecret>;
  // String (bukan number) supaya leading zero ("0042") tak hilang. Opsional -- blob lama
  // (pra-fitur ini) tak punya field ini sama sekali, bukan error.
  brokerPin?: string;
  // 32 byte random, hex-encoded -- token Bearer buat HTTP API daemon (apps/agent-headless).
  // SENGAJA terpisah dari brokerPin (PIN 4 digit buat MQTT/CYD) -- brokerPin punya keyspace
  // kecil dan rate-limiter-nya bypass loopback, tidak memadai buat auth HTTP. Opsional --
  // blob lama (pra-fitur ini, atau target non-headless) tak punya field ini sama sekali.
  apiToken?: string;
}

const EMPTY_BLOB: CredentialBlob = { agentToken: null, devices: {} };

/** Tak pernah throw — status "empty" MAUPUN "degraded" (file absen/gagal decrypt/enkripsi tak
 * tersedia) semuanya jadi blob kosong (minta pairing ulang). Pemanggil yang butuh bedakan
 * "empty" dari "degraded" (mis. ensureBrokerPin, health-check startup) pakai store.load() langsung. */
export async function loadCredentials(store: CredentialStore<CredentialBlob>): Promise<CredentialBlob> {
  const result = await store.load();
  return result.status === "ok" ? result.blob : EMPTY_BLOB;
}

export async function saveCredentials(store: CredentialStore<CredentialBlob>, blob: CredentialBlob): Promise<void> {
  await store.save(blob);
}

function generatePin(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

function generateApiToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Bootstrap PIN broker -- dipanggil SEKALI tiap startup (host bootstrap), TANPA user di loop,
 * jadi harus hati-hati soal timpa-data: kasus paling umum di dunia nyata -- user upgrade dari
 * versi sebelum fitur PIN ada -- punya file yang decrypt-nya SUKSES tapi belum ada brokerPin,
 * dan itu aman diaugment (data asli sudah di tangan). Kasus "empty" (genuinely first-run, file
 * belum ada sama sekali) SAMA AMANNYA -- tak ada data lama yang bisa hilang. Yang TIDAK boleh
 * ditimpa cuma "degraded" (decrypt GENUINELY gagal / enkripsi tak tersedia) -- di situ
 * agentToken & DeviceSecret lama berisiko hilang permanen kalau kita generate+save PIN begitu saja.
 */
export async function ensureBrokerPin(store: CredentialStore<CredentialBlob>, logger: Logger): Promise<string> {
  const result = await store.load();
  if (result.status === "ok" && result.blob.brokerPin) return result.blob.brokerPin;

  const pin = generatePin();
  if (result.status === "degraded") {
    // Jangan pernah log nilai PIN -- cuma catat bahwa bootstrap jatuh ke mode session-only.
    logger.error(
      "[credential-store] tak bisa simpan PIN baru dengan aman (file ada tapi gagal didekripsi, atau enkripsi tak tersedia) -- pakai PIN session-only untuk run ini",
    );
    return pin;
  }
  // "ok" (augment blob asli) MAUPUN "empty" (augment blob kosong -- genuinely first-run) dua-duanya
  // aman disave di sini, karena tak ada data lama yang berisiko tertimpa buta.
  const blob = result.status === "ok" ? result.blob : EMPTY_BLOB;
  await store.save({ ...blob, brokerPin: pin });
  return pin;
}

/** Pure function, no I/O -- hapus brokerPin dari blob (dipakai future regenerate action / support guidance), BUKAN hapus seluruh file credentials. */
export function clearBrokerPin(blob: CredentialBlob): CredentialBlob {
  return { ...blob, brokerPin: undefined };
}

/**
 * Bootstrap apiToken -- pola identik ensureBrokerPin (lihat komentar di sana untuk alasan
 * lengkap soal kenapa "degraded" tidak boleh ditimpa). SATU-SATUNYA beda: token 32 byte hex,
 * dipakai sebagai Bearer HTTP di apps/agent-headless, BUKAN brokerPin (4 digit, buat MQTT/CYD).
 */
export async function ensureApiToken(store: CredentialStore<CredentialBlob>, logger: Logger): Promise<string> {
  const result = await store.load();
  if (result.status === "ok" && result.blob.apiToken) return result.blob.apiToken;

  const token = generateApiToken();
  if (result.status === "degraded") {
    logger.error(
      "[credential-store] tak bisa simpan API token baru dengan aman (file ada tapi gagal didekripsi, atau enkripsi tak tersedia) -- pakai token session-only untuk run ini",
    );
    return token;
  }
  const blob = result.status === "ok" ? result.blob : EMPTY_BLOB;
  await store.save({ ...blob, apiToken: token });
  return token;
}

/** Pure function, no I/O -- hapus apiToken dari blob (dipakai rotate-token action), BUKAN hapus seluruh file credentials. */
export function clearApiToken(blob: CredentialBlob): CredentialBlob {
  return { ...blob, apiToken: undefined };
}

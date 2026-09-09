import { randomInt } from "node:crypto";
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

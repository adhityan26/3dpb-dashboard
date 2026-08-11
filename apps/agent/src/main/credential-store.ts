import { app, safeStorage } from "electron";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

function credentialFilePath(): string {
  return path.join(app.getPath("userData"), "credentials.enc");
}

/** Tak pernah throw — file absen/gagal decrypt/enkripsi tak tersedia semuanya jadi blob kosong (minta pairing ulang). */
export async function loadCredentials(): Promise<CredentialBlob> {
  const filePath = credentialFilePath();
  if (!safeStorage.isEncryptionAvailable()) return EMPTY_BLOB;
  if (!fs.existsSync(filePath)) return EMPTY_BLOB;
  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted) as CredentialBlob;
  } catch {
    return EMPTY_BLOB;
  }
}

export async function saveCredentials(blob: CredentialBlob): Promise<void> {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(blob));
  fs.writeFileSync(credentialFilePath(), encrypted);
}

function generatePin(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

type LoadOutcome = { ok: true; blob: CredentialBlob } | { ok: false };

/**
 * Sepupu loadCredentials() KHUSUS untuk ensureBrokerPin() -- beda dari loadCredentials(),
 * fungsi ini MEMBEDAKAN "file belum ada" (aman augment) dari "file ada tapi gagal
 * didekripsi" (data-loss risk, JANGAN pernah timpa). loadCredentials() sengaja melebur
 * keduanya jadi EMPTY_BLOB untuk pemanggil lama (pairing flow) yang memang tak butuh
 * bedanya -- TAPI ensureBrokerPin() butuh bedanya, karena kasus paling umum di dunia nyata
 * (user upgrade dari versi sebelum fitur PIN ada) punya file yang decrypt-nya SUKSES, cuma
 * belum ada field brokerPin -- itu 100% aman diaugment (data asli sudah di tangan), BUKAN
 * kasus corrupt yang harus di-skip.
 */
function tryLoadCredentials(): LoadOutcome {
  const filePath = credentialFilePath();
  if (!safeStorage.isEncryptionAvailable()) return { ok: false };
  if (!fs.existsSync(filePath)) return { ok: true, blob: EMPTY_BLOB }; // genuinely first run -- aman
  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = safeStorage.decryptString(encrypted);
    return { ok: true, blob: JSON.parse(decrypted) as CredentialBlob };
  } catch {
    return { ok: false }; // decrypt GENUINELY gagal -- data agentToken/devices berisiko, jangan timpa
  }
}

/**
 * Bootstrap PIN broker -- dipanggil SEKALI tiap startup (bootstrap() di index.ts), TANPA
 * user di loop, jadi harus lebih hati-hati dari loadCredentials() biasa: loadCredentials()
 * sengaja tak bisa bedakan "file belum ada" vs "file ada tapi gagal didekripsi" (keduanya
 * balik EMPTY_BLOB) -- aman untuk pemanggil lama (pairing, user-triggered) karena blob
 * kosong cuma berarti "minta user pairing ulang". ensureBrokerPin() pakai tryLoadCredentials()
 * di atas supaya BISA bedakan keduanya: kasus paling umum di dunia nyata -- user upgrade dari
 * versi sebelum fitur PIN ada -- punya file yang decrypt-nya SUKSES tapi belum ada brokerPin,
 * dan itu aman diaugment (data asli sudah di tangan). Yang TIDAK boleh ditimpa cuma kasus
 * decrypt GENUINELY gagal (file corrupt / key beda) -- di situ agentToken & DeviceSecret lama
 * berisiko hilang permanen kalau kita generate+save PIN begitu saja.
 */
export async function ensureBrokerPin(): Promise<string> {
  const outcome = tryLoadCredentials();
  if (outcome.ok && outcome.blob.brokerPin) return outcome.blob.brokerPin;

  const pin = generatePin();
  if (!outcome.ok) {
    // Jangan pernah log nilai PIN -- cuma catat bahwa bootstrap jatuh ke mode session-only.
    console.error(
      "[credential-store] tak bisa simpan PIN baru dengan aman (file ada tapi gagal didekripsi, atau enkripsi tak tersedia) -- pakai PIN session-only untuk run ini",
    );
    return pin;
  }
  // outcome.ok -- baik genuinely-first-run (blob kosong) MAUPUN file lama yang decrypt-nya
  // sukses tapi belum punya brokerPin (kasus upgrade) sama-sama aman diaugment di sini,
  // karena kita PUNYA data aslinya (outcome.blob) -- bukan menimpa buta.
  await saveCredentials({ ...outcome.blob, brokerPin: pin });
  return pin;
}

/** Pure function, no I/O -- hapus brokerPin dari blob (dipakai future regenerate action / support guidance), BUKAN hapus seluruh file credentials.enc. */
export function clearBrokerPin(blob: CredentialBlob): CredentialBlob {
  return { ...blob, brokerPin: undefined };
}

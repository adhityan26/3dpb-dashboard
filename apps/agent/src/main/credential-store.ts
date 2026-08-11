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

/**
 * Bootstrap PIN broker -- dipanggil SEKALI tiap startup (bootstrap() di index.ts), TANPA
 * user di loop, jadi harus lebih hati-hati dari loadCredentials() biasa: loadCredentials()
 * sengaja tak bisa bedakan "file belum ada" vs "file ada tapi gagal didekripsi" (keduanya
 * balik EMPTY_BLOB) -- aman untuk pemanggil lama (pairing, user-triggered) karena blob
 * kosong cuma berarti "minta user pairing ulang". TAPI kalau fungsi ini naif langsung
 * `if (!blob.brokerPin) { generate+save }`, satu file yang corrupt (bukan genuinely
 * kosong) bakal DITIMPA jadi blob isi PIN doang -- agentToken & SEMUA DeviceSecret hilang
 * permanen. Makanya cek fs.existsSync() SENDIRI di sini (sebelum loadCredentials meleburkan
 * bedanya) dan HANYA persist kalau file BENAR-BENAR belum ada DAN safeStorage tersedia
 * (saveCredentials() -> encryptString() throw kalau tidak).
 */
export async function ensureBrokerPin(): Promise<string> {
  const fileExists = fs.existsSync(credentialFilePath());
  // Dicek SEBELUM loadCredentials() -- loadCredentials() juga memanggil
  // isEncryptionAvailable() secara internal, tapi nilai KEDUANYA harus konsisten dalam satu
  // pemanggilan ensureBrokerPin(). Kalau dicek ulang belakangan (di canPersist), pemanggil
  // yang mock isEncryptionAvailable() cuma sekali (mockReturnValueOnce) akan salah kena --
  // konsumsi mock-once itu keburu diserap panggilan internal loadCredentials(), bukan
  // panggilan eksplisit di sini.
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const blob = await loadCredentials();
  if (blob.brokerPin) return blob.brokerPin;

  const pin = generatePin();
  const canPersist = fileExists === false && encryptionAvailable;
  if (!canPersist) {
    // Jangan pernah log nilai PIN -- cuma catat bahwa bootstrap jatuh ke mode session-only.
    console.error(
      "[credential-store] tak bisa simpan PIN baru dengan aman (file ada tapi tak terbaca, atau enkripsi tak tersedia) -- pakai PIN session-only untuk run ini",
    );
    return pin;
  }
  await saveCredentials({ ...blob, brokerPin: pin });
  return pin;
}

/** Pure function, no I/O -- hapus brokerPin dari blob (dipakai future regenerate action / support guidance), BUKAN hapus seluruh file credentials.enc. */
export function clearBrokerPin(blob: CredentialBlob): CredentialBlob {
  return { ...blob, brokerPin: undefined };
}

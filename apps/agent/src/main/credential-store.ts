import { app, safeStorage } from "electron";
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

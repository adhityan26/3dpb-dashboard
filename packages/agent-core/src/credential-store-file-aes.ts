import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CredentialStore, CredentialLoadResult } from "./interfaces";
import type { CredentialBlob } from "./credential-store";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

/**
 * CredentialStore for all Linux targets (headless daemon AND Electron Linux desktop) --
 * the AES-256 key is stored as a separate 0600-permission file in the same directory as
 * the encrypted data. Threat model: box stolen/physically accessed = the user has already
 * had other secrets on the same machine compromised -- the same assumption most self-hosted
 * apps make when storing secrets on the filesystem with tight permissions, rather than an
 * OS keyring.
 */
export class FileAesCredentialStore implements CredentialStore<CredentialBlob> {
  constructor(private readonly dataDir: string) {}

  private keyFilePath(): string {
    return path.join(this.dataDir, "credentials.key");
  }

  private dataFilePath(): string {
    return path.join(this.dataDir, "credentials.enc");
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  private loadOrCreateKey(): Buffer {
    if (fs.existsSync(this.keyFilePath())) {
      return fs.readFileSync(this.keyFilePath());
    }
    const key = randomBytes(KEY_LENGTH);
    this.ensureDir();
    fs.writeFileSync(this.keyFilePath(), key, { mode: 0o600 });
    return key;
  }

  async load(): Promise<CredentialLoadResult<CredentialBlob>> {
    const dataExists = fs.existsSync(this.dataFilePath());
    const keyExists = fs.existsSync(this.keyFilePath());

    if (!dataExists && !keyExists) return { status: "empty" };
    // Data exists but the key is missing -- this is a DEGRADED case, not empty, even though
    // technically "there is nothing readable right now" -- there is old data on disk that
    // would be permanently lost if we treated this as a first-run and generated a fresh
    // PIN/blob to overwrite it.
    if (dataExists && !keyExists) return { status: "degraded", reason: "key_missing" };
    if (!dataExists && keyExists) return { status: "empty" }; // key exists without data = never saved yet, safe

    try {
      const key = fs.readFileSync(this.keyFilePath());
      const raw = fs.readFileSync(this.dataFilePath());
      const iv = raw.subarray(0, IV_LENGTH);
      const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
      const ciphertext = raw.subarray(IV_LENGTH + 16);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return { status: "ok", blob: JSON.parse(decrypted.toString("utf8")) as CredentialBlob };
    } catch {
      return { status: "degraded", reason: "decrypt_failed" };
    }
  }

  async save(blob: CredentialBlob): Promise<void> {
    this.ensureDir();
    const key = this.loadOrCreateKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plaintext = Buffer.from(JSON.stringify(blob), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    fs.writeFileSync(this.dataFilePath(), Buffer.concat([iv, authTag, ciphertext]), { mode: 0o600 });
  }

  isEncryptionAvailable(): boolean {
    return true;
  }
}

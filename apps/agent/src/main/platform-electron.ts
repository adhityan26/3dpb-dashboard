import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { CredentialStore, CredentialLoadResult } from "@3pb/agent-core";
import type { CredentialBlob } from "@3pb/agent-core";

export class SafeStorageCredentialStore implements CredentialStore<CredentialBlob> {
  private credentialFilePath(): string {
    return path.join(app.getPath("userData"), "credentials.enc");
  }

  async load(): Promise<CredentialLoadResult<CredentialBlob>> {
    if (!safeStorage.isEncryptionAvailable()) return { status: "degraded", reason: "encryption_unavailable" };
    const filePath = this.credentialFilePath();
    if (!fs.existsSync(filePath)) return { status: "empty" };
    try {
      const encrypted = fs.readFileSync(filePath);
      const decrypted = safeStorage.decryptString(encrypted);
      return { status: "ok", blob: JSON.parse(decrypted) as CredentialBlob };
    } catch {
      return { status: "degraded", reason: "decrypt_failed" };
    }
  }

  async save(blob: CredentialBlob): Promise<void> {
    const dir = app.getPath("userData");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(blob));
    fs.writeFileSync(this.credentialFilePath(), encrypted);
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }
}

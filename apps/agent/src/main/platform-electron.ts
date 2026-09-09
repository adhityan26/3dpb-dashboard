import { app, safeStorage } from "electron";
import log from "electron-log/main";
import fs from "node:fs";
import path from "node:path";
import type { CredentialStore, CredentialLoadResult } from "@3pb/agent-core";
import type { CredentialBlob } from "@3pb/agent-core";
import type { PathProvider, Logger, LogFileProvider, BuildInfo } from "@3pb/agent-core";

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

export class ElectronPathProvider implements PathProvider {
  userDataDir(): string {
    return app.getPath("userData");
  }
}

export class ElectronLogAdapter implements Logger {
  info(...args: unknown[]): void {
    log.info(...args);
  }
  warn(...args: unknown[]): void {
    log.warn(...args);
  }
  error(...args: unknown[]): void {
    log.error(...args);
  }
}

export class ElectronLogFileProvider implements LogFileProvider {
  getLogFilePath(): string | null {
    return log.transports.file.getFile().path;
  }
}

// version/commitHash tetap datang dari Vite `define` (__AGENT_VERSION__/__AGENT_COMMIT_HASH__
// di electron.vite.config.ts) -- BuildInfo dibangun sekali di index.ts dan dioper eksplisit,
// bukan dibaca langsung dari declare const di dalam saas-client.ts lagi (itu perilaku LAMA).
declare const __AGENT_VERSION__: string | undefined;
declare const __AGENT_COMMIT_HASH__: string | undefined;

export function getElectronBuildInfo(): BuildInfo {
  return {
    version: typeof __AGENT_VERSION__ === "string" ? __AGENT_VERSION__ : "0.0.0",
    commitHash: typeof __AGENT_COMMIT_HASH__ === "string" ? __AGENT_COMMIT_HASH__ : "nogit",
  };
}

import type { CredentialStore, CredentialLoadResult } from "./interfaces";
import type { CredentialBlob } from "./credential-store";

/**
 * Fake CredentialStore in-memory buat test AgentService/AgentRuntime -- lebih bermakna
 * daripada mock loadCredentials/saveCredentials satu-satu (assertion bisa baca-balik state
 * yang beneran tersimpan, bukan cuma cek mock dipanggil dengan argumen tertentu).
 */
export class InMemoryCredentialStore implements CredentialStore<CredentialBlob> {
  private blob: CredentialBlob | null;

  constructor(seed: CredentialBlob | null = null) {
    this.blob = seed;
  }

  async load(): Promise<CredentialLoadResult<CredentialBlob>> {
    if (!this.blob) return { status: "empty" };
    return { status: "ok", blob: this.blob };
  }

  async save(blob: CredentialBlob): Promise<void> {
    this.blob = blob;
  }

  isEncryptionAvailable(): boolean {
    return true;
  }
}

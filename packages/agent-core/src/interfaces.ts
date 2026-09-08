// "ok" = file ada, decrypt sukses. "empty" = genuinely first-run (file belum ada sama
// sekali) -- AMAN diperlakukan sama seperti "ok" dengan blob kosong (lihat ensureBrokerPin
// di credential-store.ts). "degraded" = enkripsi tak tersedia ATAU file ada tapi gagal
// decrypt -- JANGAN PERNAH ditimpa (data-loss risk), harus fallback ke mode session-only.
export type CredentialLoadResult<TBlob> =
  | { status: "ok"; blob: TBlob }
  | { status: "empty" }
  | { status: "degraded"; reason: string };

export interface CredentialStore<TBlob> {
  load(): Promise<CredentialLoadResult<TBlob>>;
  save(blob: TBlob): Promise<void>;
  isEncryptionAvailable(): boolean;
}

export interface PathProvider {
  userDataDir(): string;
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface LogFileProvider {
  // null = tidak ada file log (mis. daemon systemd yang log ke journal, bukan file) --
  // dipakai sub-project 2 nanti, Electron host selalu balikin path nyata.
  getLogFilePath(): string | null;
}

export interface BuildInfo {
  version: string;
  commitHash: string;
}

import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { AgentService } from "@3pb/agent-core";

// Pola temp-file yang sama seperti AgentService.parseThreemfForDevice/getFileThumbnail di core --
// SENGAJA tidak mengubah signature AgentService.uploadFile/downloadFile (localPath tetap
// filesystem lokal proses, cocok untuk Electron); daemon menambah SATU lapisan relay di levelnya
// sendiri, bukan mengubah kontrak core. Klien HTTP TIDAK PERNAH melihat localPath -- hanya
// berinteraksi lewat multipart upload / stream download.
export async function relayUpload(
  service: AgentService,
  shortCode: string,
  remotePath: string,
  sourceStream: Readable,
): Promise<void> {
  const tempPath = join(tmpdir(), `agent-headless-upload-${Date.now()}-${randomUUID()}`);
  try {
    await pipeline(sourceStream, createWriteStream(tempPath));
    await service.uploadFile(shortCode, tempPath, remotePath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

export async function relayDownload(
  service: AgentService,
  shortCode: string,
  remotePath: string,
): Promise<{ tempPath: string; cleanup: () => Promise<void> }> {
  const tempPath = join(tmpdir(), `agent-headless-download-${Date.now()}-${randomUUID()}`);
  await service.downloadFile(shortCode, remotePath, tempPath);
  return {
    tempPath,
    cleanup: () => rm(tempPath, { force: true }),
  };
}

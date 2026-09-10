import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import { existsSync } from "node:fs";
import { relayUpload, relayDownload } from "./file-transfer";
import type { AgentService } from "@3pb/agent-core";

function makeFakeService(overrides: Partial<AgentService> = {}): AgentService {
  return {
    uploadFile: vi.fn(async () => {}),
    downloadFile: vi.fn(async (_shortCode: string, _remotePath: string, localPath: string) => {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(localPath, "fake file content");
    }),
    ...overrides,
  } as unknown as AgentService;
}

describe("relayUpload", () => {
  it("tulis stream ke temp file, panggil service.uploadFile dengan path temp itu, hapus temp file setelahnya", async () => {
    const service = makeFakeService();
    const stream = Readable.from([Buffer.from("hello")]);
    await relayUpload(service, "ABC", "/remote/file.gcode", stream);
    expect(service.uploadFile).toHaveBeenCalledWith("ABC", expect.stringContaining("agent-headless-upload-"), "/remote/file.gcode");
    const calledTempPath = vi.mocked(service.uploadFile).mock.calls[0][1];
    expect(existsSync(calledTempPath)).toBe(false); // sudah dihapus
  });

  it("service.uploadFile throw -> temp file tetap dihapus (finally), error diteruskan", async () => {
    const service = makeFakeService({ uploadFile: vi.fn(async () => { throw new Error("device_not_found"); }) });
    const stream = Readable.from([Buffer.from("x")]);
    await expect(relayUpload(service, "ABC", "/remote/x", stream)).rejects.toThrow("device_not_found");
  });
});

describe("relayDownload", () => {
  it("panggil service.downloadFile ke temp file, balikin path + fungsi cleanup", async () => {
    const service = makeFakeService();
    const { tempPath, cleanup } = await relayDownload(service, "ABC", "/remote/file.gcode");
    expect(existsSync(tempPath)).toBe(true);
    await cleanup();
    expect(existsSync(tempPath)).toBe(false);
  });
});

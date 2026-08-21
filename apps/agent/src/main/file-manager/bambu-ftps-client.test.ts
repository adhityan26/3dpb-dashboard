import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAccess = vi.fn();
const mockList = vi.fn();
const mockUploadFrom = vi.fn();
const mockDownloadTo = vi.fn();
const mockRemove = vi.fn();
const mockRename = vi.fn();
const mockClose = vi.fn();

vi.mock("basic-ftp", () => ({
  Client: vi.fn().mockImplementation(() => ({
    access: mockAccess,
    list: mockList,
    uploadFrom: mockUploadFrom,
    downloadTo: mockDownloadTo,
    remove: mockRemove,
    rename: mockRename,
    close: mockClose,
  })),
}));

import { BambuFtpsClient } from "./bambu-ftps-client";

describe("BambuFtpsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connect pakai implicit TLS port 990 dan user bblp", async () => {
    mockList.mockResolvedValue([]);
    const client = new BambuFtpsClient("192.168.1.50", "12345678");

    await client.list("/");

    expect(mockAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "192.168.1.50",
        port: 990,
        user: "bblp",
        password: "12345678",
        secure: "implicit",
      }),
    );
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("balikin daftar file dari list FTP, map ke PrinterFileEntry", async () => {
    mockList.mockResolvedValue([
      { name: "test.gcode", size: 340000, isDirectory: false, modifiedAt: new Date("2026-08-01T00:00:00Z") },
      { name: "cache", size: 0, isDirectory: true, modifiedAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    const client = new BambuFtpsClient("192.168.1.50", "12345678");

    const entries = await client.list("/");

    expect(entries).toEqual([
      { name: "test.gcode", path: "/test.gcode", size: 340000, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
      { name: "cache", path: "/cache", size: 0, isDirectory: true, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("upload panggil uploadFrom lalu tutup koneksi", async () => {
    const client = new BambuFtpsClient("192.168.1.50", "12345678");
    await client.upload("/tmp/local.gcode", "/remote.gcode");
    expect(mockUploadFrom).toHaveBeenCalledWith("/tmp/local.gcode", "/remote.gcode");
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("tetap tutup koneksi walau operasi gagal", async () => {
    mockList.mockRejectedValue(new Error("connection timeout"));
    const client = new BambuFtpsClient("192.168.1.50", "12345678");

    await expect(client.list("/")).rejects.toThrow("connection timeout");
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("download panggil downloadTo dengan args yang benar, tutup koneksi", async () => {
    const client = new BambuFtpsClient("192.168.1.50", "12345678");
    await client.download("/remote.gcode", "/tmp/local.gcode");
    expect(mockDownloadTo).toHaveBeenCalledWith("/tmp/local.gcode", "/remote.gcode");
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("delete panggil remove dengan remotePath, tutup koneksi", async () => {
    const client = new BambuFtpsClient("192.168.1.50", "12345678");
    await client.delete("/old-file.gcode");
    expect(mockRemove).toHaveBeenCalledWith("/old-file.gcode");
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("rename panggil rename dengan oldPath dan newPath, tutup koneksi", async () => {
    const client = new BambuFtpsClient("192.168.1.50", "12345678");
    await client.rename("/old.gcode", "/new.gcode");
    expect(mockRename).toHaveBeenCalledWith("/old.gcode", "/new.gcode");
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("list dengan root path / tidak double-slash, path format benar", async () => {
    mockList.mockResolvedValue([
      { name: "file.gcode", size: 100, isDirectory: false, modifiedAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    const client = new BambuFtpsClient("192.168.1.50", "12345678");

    const entries = await client.list("/");

    expect(entries[0].path).toBe("/file.gcode");
    expect(entries[0].path).not.toMatch(/\/\//);
  });
});

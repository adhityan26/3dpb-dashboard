import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FileManagerPanel } from "./FileManagerPanel";

const mockListFiles = vi.fn();
const mockDeleteFile = vi.fn();
const mockGetFileThumbnail = vi.fn();
const mockDownloadFile = vi.fn();
const mockPickDownloadFolder = vi.fn();
const mockRenameFile = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetFileThumbnail.mockResolvedValue(null);
  mockPickDownloadFolder.mockResolvedValue("/tmp/downloads");
  (globalThis as unknown as { window: { agentApi: unknown } }).window ??= {} as never;
  Object.assign(window, {
    agentApi: {
      listFiles: mockListFiles,
      deleteFile: mockDeleteFile,
      getFileThumbnail: mockGetFileThumbnail,
      downloadFile: mockDownloadFile,
      uploadFile: vi.fn(),
      pickDownloadFolder: mockPickDownloadFolder,
      renameFile: mockRenameFile,
    },
  });
});

// Helper: buka menu aksi ("⋮") untuk satu baris file.
async function openRowMenu(fileName: string) {
  fireEvent.click(await screen.findByRole("button", { name: `aksi ${fileName}` }));
  return screen.findByRole("menu", { name: `menu ${fileName}` });
}

describe("FileManagerPanel", () => {
  it("render daftar file sebagai baris tabel setelah listFiles resolve", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 2100000, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);

    expect(await screen.findByText("a.gcode.3mf")).toBeTruthy();
    expect(screen.getByText("2.0 MB")).toBeTruthy();
  });

  it("mode select: centang 2 file lalu hapus bulk memanggil deleteFile 2 kali", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
      { name: "b.gcode", path: "/b.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    mockDeleteFile.mockResolvedValue(undefined);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.click(screen.getByLabelText("a.gcode.3mf"));
    fireEvent.click(screen.getByLabelText("b.gcode"));
    fireEvent.click(screen.getByRole("button", { name: /hapus \(2\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /ya, hapus/i }));

    await waitFor(() => {
      expect(mockDeleteFile).toHaveBeenCalledWith("ABC123", "/a.gcode.3mf");
      expect(mockDeleteFile).toHaveBeenCalledWith("ABC123", "/b.gcode");
    });
  });

  it("thumbnail LAZY: tidak di-fetch otomatis saat list dimuat", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    // Direktori besar (puluhan file @beberapa-MB) tak boleh memicu download massal
    // otomatis -- thumbnail cuma di-fetch kalau user klik placeholder-nya.
    expect(mockGetFileThumbnail).not.toHaveBeenCalled();
    expect(await screen.findByLabelText("load thumbnail a.gcode.3mf")).toBeTruthy();
  });

  it("klik placeholder thumbnail -> fetch lalu tampil gambar; klik gambar buka lightbox zoom, klik lightbox menutupnya", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    mockGetFileThumbnail.mockResolvedValueOnce("data:image/png;base64,QUJD");

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    const placeholder = await screen.findByLabelText("load thumbnail a.gcode.3mf");
    fireEvent.click(placeholder);

    await waitFor(() => expect(mockGetFileThumbnail).toHaveBeenCalledWith("ABC123", "/a.gcode.3mf"));

    const thumb = await screen.findByLabelText("zoom a.gcode.3mf");
    fireEvent.click(thumb);

    const lightbox = await screen.findByRole("dialog", { name: /thumbnail preview/i });
    expect(lightbox).toBeTruthy();

    fireEvent.click(lightbox);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /thumbnail preview/i })).toBeNull();
    });
  });

  it("thumbnail placeholder klik juga berlaku untuk file .gcode polos (bukan cuma .gcode.3mf)", async () => {
    mockListFiles.mockResolvedValue([
      { name: "b.gcode", path: "/b.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText("load thumbnail b.gcode"));

    await waitFor(() => expect(mockGetFileThumbnail).toHaveBeenCalledWith("ABC123", "/b.gcode"));
  });

  it("file non-printable (bukan .gcode/.gcode.3mf) tidak punya placeholder thumbnail yang bisa diklik", async () => {
    mockListFiles.mockResolvedValue([
      { name: "readme.txt", path: "/readme.txt", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("readme.txt");

    expect(screen.queryByLabelText("load thumbnail readme.txt")).toBeNull();
  });

  it("mode select: bulk download memanggil pickDownloadFolder lalu downloadFile per file terpilih", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
      { name: "b.gcode", path: "/b.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.click(screen.getByLabelText("a.gcode.3mf"));
    fireEvent.click(screen.getByLabelText("b.gcode"));
    fireEvent.click(screen.getByRole("button", { name: /download \(2\)/i }));

    await waitFor(() => {
      expect(mockPickDownloadFolder).toHaveBeenCalled();
      expect(mockDownloadFile).toHaveBeenCalledWith("ABC123", "/a.gcode.3mf", "/tmp/downloads/a.gcode.3mf");
      expect(mockDownloadFile).toHaveBeenCalledWith("ABC123", "/b.gcode", "/tmp/downloads/b.gcode");
    });
  });

  it("bulk download: user batal dialog folder -> downloadFile TIDAK dipanggil", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    mockPickDownloadFolder.mockResolvedValueOnce(null);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.click(screen.getByLabelText("a.gcode.3mf"));
    fireEvent.click(screen.getByRole("button", { name: /download \(1\)/i }));

    await waitFor(() => expect(mockPickDownloadFolder).toHaveBeenCalled());
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it("bulk delete: batal konfirmasi TIDAK memanggil deleteFile", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.click(screen.getByLabelText("a.gcode.3mf"));
    fireEvent.click(screen.getByRole("button", { name: /hapus \(1\)/i }));
    const dialog = await screen.findByRole("dialog", { name: /konfirmasi hapus/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^batal$/i }));

    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it("klik ⋮ buka menu aksi, klik Print di menu memanggil onPrintRequested dengan remotePath", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    const onPrintRequested = vi.fn();

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={onPrintRequested} />);
    await screen.findByText("a.gcode.3mf");

    const menu = await openRowMenu("a.gcode.3mf");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^print$/i }));

    expect(onPrintRequested).toHaveBeenCalledWith("/a.gcode.3mf");
  });

  it("menu aksi per-baris: Download memanggil pickDownloadFolder lalu downloadFile untuk file itu saja", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    const menu = await openRowMenu("a.gcode.3mf");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^download$/i }));

    await waitFor(() => {
      expect(mockDownloadFile).toHaveBeenCalledWith("ABC123", "/a.gcode.3mf", "/tmp/downloads/a.gcode.3mf");
    });
  });

  it("menu aksi per-baris: Hapus buka dialog konfirmasi untuk 1 file, konfirmasi memanggil deleteFile", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    const menu = await openRowMenu("a.gcode.3mf");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /hapus/i }));

    const dialog = await screen.findByRole("dialog", { name: /konfirmasi hapus/i });
    expect(within(dialog).getByText(/hapus 1 file/i)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /ya, hapus/i }));

    await waitFor(() => expect(mockDeleteFile).toHaveBeenCalledWith("ABC123", "/a.gcode.3mf"));
  });

  it("menu aksi per-baris: Rename buka dialog dengan nama lama, submit memanggil renameFile", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    mockRenameFile.mockResolvedValue(undefined);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    const menu = await openRowMenu("a.gcode.3mf");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /rename/i }));

    const dialog = await screen.findByRole("dialog", { name: /rename file/i });
    const input = within(dialog).getByLabelText("nama baru") as HTMLInputElement;
    expect(input.value).toBe("a.gcode.3mf");

    fireEvent.change(input, { target: { value: "b.gcode.3mf" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /simpan/i }));

    await waitFor(() => expect(mockRenameFile).toHaveBeenCalledWith("ABC123", "/a.gcode.3mf", "/b.gcode.3mf"));
  });

  it("rename: nama kosong tidak memanggil renameFile, tampil pesan error", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    const menu = await openRowMenu("a.gcode.3mf");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /rename/i }));
    const dialog = await screen.findByRole("dialog", { name: /rename file/i });
    fireEvent.change(within(dialog).getByLabelText("nama baru"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: /simpan/i }));

    expect(within(dialog).getByText(/nama tidak boleh kosong/i)).toBeTruthy();
    expect(mockRenameFile).not.toHaveBeenCalled();
  });

  it("rename: batal menutup dialog tanpa memanggil renameFile", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    const menu = await openRowMenu("a.gcode.3mf");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /rename/i }));
    const dialog = await screen.findByRole("dialog", { name: /rename file/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^batal$/i }));

    expect(screen.queryByRole("dialog", { name: /rename file/i })).toBeNull();
    expect(mockRenameFile).not.toHaveBeenCalled();
  });

  it("listFiles gagal -> tampil pesan error, klik Coba Lagi memanggil listFiles lagi", async () => {
    mockListFiles.mockRejectedValueOnce(new Error("offline"));

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);

    expect(await screen.findByText(/gagal memuat daftar file/i)).toBeTruthy();
    expect(mockListFiles).toHaveBeenCalledTimes(1);

    mockListFiles.mockResolvedValueOnce([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));

    await waitFor(() => expect(mockListFiles).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("a.gcode.3mf")).toBeTruthy();
  });

  it("bulk delete: satu file gagal dihapus -> lanjut ke file lain, state reset, pesan error tampil", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
      { name: "b.gcode", path: "/b.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    mockDeleteFile.mockImplementation((_short: string, path: string) =>
      path === "/a.gcode.3mf" ? Promise.reject(new Error("fail")) : Promise.resolve(undefined),
    );

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.click(screen.getByLabelText("a.gcode.3mf"));
    fireEvent.click(screen.getByLabelText("b.gcode"));
    fireEvent.click(screen.getByRole("button", { name: /hapus \(2\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /ya, hapus/i }));

    await waitFor(() => {
      expect(mockDeleteFile).toHaveBeenCalledWith("ABC123", "/a.gcode.3mf");
      expect(mockDeleteFile).toHaveBeenCalledWith("ABC123", "/b.gcode");
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /konfirmasi hapus/i })).toBeNull();
    });
    expect(await screen.findByText(/1 dari 2 file berhasil dihapus, 1 gagal/i)).toBeTruthy();
  });

  it("bulk download: satu file gagal download -> lanjut ke file lain, pesan error tampil", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
      { name: "b.gcode", path: "/b.gcode", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    mockDownloadFile.mockImplementation((_short: string, path: string) =>
      path === "/a.gcode.3mf" ? Promise.reject(new Error("fail")) : Promise.resolve(undefined),
    );

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.click(screen.getByLabelText("a.gcode.3mf"));
    fireEvent.click(screen.getByLabelText("b.gcode"));
    fireEvent.click(screen.getByRole("button", { name: /download \(2\)/i }));

    await waitFor(() => {
      expect(mockDownloadFile).toHaveBeenCalledWith("ABC123", "/a.gcode.3mf", "/tmp/downloads/a.gcode.3mf");
      expect(mockDownloadFile).toHaveBeenCalledWith("ABC123", "/b.gcode", "/tmp/downloads/b.gcode");
    });

    expect(await screen.findByText(/1 dari 2 file berhasil didownload, 1 gagal/i)).toBeTruthy();
  });
});

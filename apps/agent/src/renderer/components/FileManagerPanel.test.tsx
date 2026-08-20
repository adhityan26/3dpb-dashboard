import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FileManagerPanel } from "./FileManagerPanel";

const mockListFiles = vi.fn();
const mockDeleteFile = vi.fn();
const mockGetFileThumbnail = vi.fn();
const mockDownloadFile = vi.fn();
const mockPickDownloadFolder = vi.fn();

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
    },
  });
});

describe("FileManagerPanel", () => {
  it("render daftar file sebagai card setelah listFiles resolve", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 2100000, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);

    expect(await screen.findByText("a.gcode.3mf")).toBeTruthy();
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

  it("thumbnail muncul: klik gambar buka lightbox zoom, klik lightbox menutupnya", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    mockGetFileThumbnail.mockResolvedValueOnce("data:image/png;base64,QUJD");

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={vi.fn()} />);
    await screen.findByText("a.gcode.3mf");

    const thumb = await screen.findByLabelText("zoom a.gcode.3mf");
    fireEvent.click(thumb);

    const lightbox = await screen.findByRole("dialog", { name: /thumbnail preview/i });
    expect(lightbox).toBeTruthy();

    fireEvent.click(lightbox);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /thumbnail preview/i })).toBeNull();
    });
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

  it("klik Print pada file memanggil onPrintRequested dengan remotePath", async () => {
    mockListFiles.mockResolvedValue([
      { name: "a.gcode.3mf", path: "/a.gcode.3mf", size: 1, isDirectory: false, modifiedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    const onPrintRequested = vi.fn();

    render(<FileManagerPanel shortCode="ABC123" onPrintRequested={onPrintRequested} />);
    await screen.findByText("a.gcode.3mf");

    fireEvent.click(screen.getByRole("button", { name: /^print$/i }));

    expect(onPrintRequested).toHaveBeenCalledWith("/a.gcode.3mf");
  });
});

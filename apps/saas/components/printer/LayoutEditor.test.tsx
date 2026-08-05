// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LayoutEditor } from "./LayoutEditor";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

describe("LayoutEditor", () => {
  it("muat layout dari GET /api/cyd-layout, render 1 page default", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schemaVersion: 1, pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }] }),
    });
    render(<LayoutEditor devices={[{ id: "d1", shortCode: "abc1234567", label: "Printer A", printerType: "bambu" }]} />);
    await waitFor(() => expect(screen.getByText(/printer a/i)).toBeTruthy());
  });

  it("tombol simpan panggil PUT /api/cyd-layout dengan config saat ini", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ schemaVersion: 1, pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<LayoutEditor devices={[]} />);
    await waitFor(() => screen.getByRole("button", { name: /simpan/i }));
    screen.getByRole("button", { name: /simpan/i }).click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cyd-layout", expect.objectContaining({ method: "PUT" })));
  });

  // Cakupan perilaku (bukan internal drag-drop, yang tak bisa disimulasikan berarti di jsdom):
  // sel tersimpan ter-render, klik sel membuka panel, ganti/tambah halaman, dan halaman baru
  // ikut terkirim di body PUT.
  it("render sel tersimpan, seleksi sel, ganti & tambah halaman, lalu kirim semua di PUT", async () => {
    const saved = {
      schemaVersion: 1,
      pages: [
        {
          id: "page-1",
          grid: { cols: 2, rows: 2 },
          fields: [["name"], ["state"]],
          durationSec: 5,
          cells: [
            { printer: "abc1234567", col: 0, row: 0 },
            { type: "label", text: "Rak A", col: 1, row: 1 },
          ],
        },
        { id: "hal-2", grid: { cols: 1, rows: 1 }, fields: [], durationSec: 8, cells: [] },
      ],
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => saved });
    render(<LayoutEditor devices={[{ shortCode: "abc1234567", label: "Printer A" }]} />);

    // Sel printer tampil pakai label device (bukan shortCode mentah), sel label pakai teksnya.
    await waitFor(() => expect(screen.getAllByText(/printer a/i).length).toBeGreaterThan(1));
    expect(screen.getByText("Rak A")).toBeTruthy();

    // Klik sel di canvas -> panel pengaturan sel terbuka.
    fireEvent.click(screen.getAllByText(/printer a/i)[1]);
    await waitFor(() => expect(screen.getByText(/field preset sel/i)).toBeTruthy());

    // Ganti ke halaman kedua (grid-nya beda) lalu tambah halaman baru.
    fireEvent.click(screen.getByText("hal-2"));
    await waitFor(() => expect(screen.getByText(/grid 1×1/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /\+ halaman/i }));
    await waitFor(() => expect(screen.getByText("hal-3")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cyd-layout", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as { body: string }).body);
    expect(body.pages.map((p: { id: string }) => p.id)).toEqual(["page-1", "hal-2", "hal-3"]);
  });

  it("teks header: ter-render dari GET, bisa diedit, ikut terkirim di PUT", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          headerText: "Semangat pagi!",
          pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<LayoutEditor devices={[]} />);

    const input = (await screen.findByLabelText(/teks header/i)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Semangat pagi!"));

    fireEvent.change(input, { target: { value: "Kata baru" } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cyd-layout", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as { body: string }).body);
    expect(body.headerText).toBe("Kata baru");
  });

  it("teks header lebih dari 120 byte -> simpan ditolak di client, PUT tak terpanggil", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schemaVersion: 1, pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }] }),
    });
    render(<LayoutEditor devices={[]} />);

    const input = (await screen.findByLabelText(/teks header/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a".repeat(121) } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));
    await waitFor(() => expect(screen.getByText(/lebih dari 120 byte/i)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1); // cuma GET awal, PUT tak pernah terpanggil
  });
});

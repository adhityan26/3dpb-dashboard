// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeviceList } from "./DeviceList";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

/** GET /api/devices balas { devices, limit } (bukan array telanjang). */
function mockList(devices: Array<{ id: string; label: string; printerType: string }>, limit = 3) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ devices, limit }) });
}

const DEVICE_A = { id: "d1", label: "Printer A", printerType: "bambu" };

describe("DeviceList", () => {
  it("tampilkan daftar device dari GET /api/devices", async () => {
    mockList([DEVICE_A]);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
  });

  it("tampilkan 'X/Y slot terpakai' dari limit yang dikirim GET", async () => {
    mockList([DEVICE_A], 2);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText("1/2 slot terpakai")).toBeTruthy());
  });

  it("pesan upsell kalau POST balas 409 slot_limit_exceeded", async () => {
    mockList([DEVICE_A], 1);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "slot_limit_exceeded", limit: 1 }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText("Printer A"));
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    await waitFor(() => expect(screen.getByText(/batas.*tercapai/i)).toBeTruthy());
  });

  it("locked view (upsell) kalau paidCore false, tak panggil fetch sama sekali", () => {
    render(<DeviceList paidCore={false} />);
    expect(screen.getByText(/pro/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // moonraker sebelumnya tak bisa dijangkau sama sekali dari produk (printerType di-hardcode "bambu").
  it("kirim printerType sesuai pilihan dropdown saat tambah (bukan hardcode bambu)", async () => {
    mockList([], 3);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "d2", label: "Printer 1", printerType: "moonraker" }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByRole("button", { name: /tambah/i }));

    fireEvent.change(screen.getByLabelText("Tipe printer"), { target: { value: "moonraker" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/devices");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ label: "Printer 1", printerType: "moonraker" });
    await waitFor(() => expect(screen.getByText("Printer 1")).toBeTruthy());
  });

  it("rename: PATCH /api/devices/{id} dengan label baru + update list lokal", async () => {
    mockList([DEVICE_A]);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...DEVICE_A, label: "Printer Baru" }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText("Printer A"));

    fireEvent.click(screen.getByRole("button", { name: /ubah nama printer a/i }));
    const input = screen.getByLabelText("Nama printer Printer A") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Printer Baru" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/devices/d1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ label: "Printer Baru" });
    await waitFor(() => expect(screen.getByText("Printer Baru")).toBeTruthy());
  });

  it("rename: tak kirim request kalau label tak berubah", async () => {
    mockList([DEVICE_A]);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText("Printer A"));

    fireEvent.click(screen.getByRole("button", { name: /ubah nama printer a/i }));
    fireEvent.keyDown(screen.getByLabelText("Nama printer Printer A"), { key: "Enter" });

    expect(fetchMock).toHaveBeenCalledTimes(1); // cuma GET awal
  });

  it("hapus: konfirmasi dulu — batal kalau confirm() false", async () => {
    mockList([DEVICE_A]);
    window.confirm = vi.fn(() => false);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText("Printer A"));

    fireEvent.click(screen.getByRole("button", { name: /hapus printer a/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); // cuma GET awal, tak ada DELETE
    expect(screen.getByText("Printer A")).toBeTruthy();
  });

  it("hapus: DELETE /api/devices/{id} + buang dari list lokal kalau confirm() true", async () => {
    mockList([DEVICE_A]);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
    window.confirm = vi.fn(() => true);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText("Printer A"));

    fireEvent.click(screen.getByRole("button", { name: /hapus printer a/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/devices/d1");
    expect(init.method).toBe("DELETE");
    await waitFor(() => expect(screen.queryByText("Printer A")).toBeNull());
  });

  it("hapus: tampilkan error & pertahankan device kalau DELETE gagal", async () => {
    mockList([DEVICE_A]);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "server_error" }) });
    window.confirm = vi.fn(() => true);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText("Printer A"));

    fireEvent.click(screen.getByRole("button", { name: /hapus printer a/i }));

    await waitFor(() => expect(screen.getByText(/gagal menghapus/i)).toBeTruthy());
    expect(screen.getByText("Printer A")).toBeTruthy();
  });
});

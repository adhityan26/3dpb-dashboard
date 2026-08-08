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
function mockList(devices: Array<{ id: string; label: string; printerType: string; model: string | null }>, limit = 3) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ devices, limit }) });
}

const DEVICE_A = { id: "d1", label: "Printer A", printerType: "bambu", model: "P1S" };

/** Buka dialog "Tambah Printer" -- tombol "+ Tambah" di toolbar sekarang trigger popup,
 * bukan langsung submit (form tipe+model ada DI DALAM dialog). */
function openAddDialog() {
  fireEvent.click(screen.getByRole("button", { name: /^\+ tambah$/i }));
}

describe("DeviceList", () => {
  it("tampilkan daftar device dari GET /api/devices", async () => {
    mockList([DEVICE_A]);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
  });

  it("tampilkan MEREK printer (mis. 'Bambu Lab', 'Snapmaker'), BUKAN nama connector/engine mentah", async () => {
    mockList([DEVICE_A, { id: "d2", label: "Ganymede", printerType: "moonraker", model: "U1" }]);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    expect(screen.getByText("Bambu Lab")).toBeTruthy();
    expect(screen.getByText("Snapmaker")).toBeTruthy();
    expect(screen.queryByText("bambu")).toBeNull();
    expect(screen.queryByText("moonraker")).toBeNull();
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
    openAddDialog();
    fireEvent.click(screen.getByRole("button", { name: /tambah printer/i }));
    await waitFor(() => expect(screen.getByText(/batas.*tercapai/i)).toBeTruthy());
    // Gagal -> dialog TETAP terbuka menampilkan error, bukan ke-dismiss diam-diam.
    expect(screen.getByRole("dialog")).toBeTruthy();
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
    await waitFor(() => screen.getByRole("button", { name: /^\+ tambah$/i }));
    openAddDialog();

    fireEvent.change(screen.getByLabelText("Tipe printer"), { target: { value: "moonraker" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah printer/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/devices");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ label: "Printer 1", printerType: "moonraker", model: "" });
    await waitFor(() => expect(screen.getByText("Printer 1")).toBeTruthy());
  });

  it("kirim model yang diisi user saat tambah", async () => {
    mockList([], 3);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "d2", label: "Printer 1", printerType: "bambu", model: "A1Mini" }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByRole("button", { name: /^\+ tambah$/i }));
    openAddDialog();

    fireEvent.change(screen.getByLabelText("Model printer"), { target: { value: "A1Mini" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah printer/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(init.body)).toEqual({ label: "Printer 1", printerType: "bambu", model: "A1Mini" });
  });

  it("model form-tambah > 11 karakter -> tampilkan hint batas firmware", async () => {
    mockList([], 3);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByRole("button", { name: /^\+ tambah$/i }));
    openAddDialog();

    fireEvent.change(screen.getByLabelText("Model printer"), { target: { value: "TerlaluPanjangUntukFirmware" } });
    expect(screen.getByText(/maks 11 karakter/i)).toBeTruthy();
    // Model kelewat panjang -> tombol submit di dalam dialog ikut ke-disable.
    expect((screen.getByRole("button", { name: /tambah printer/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("model form-tambah <= 11 karakter -> tak tampilkan hint", async () => {
    mockList([], 3);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByRole("button", { name: /^\+ tambah$/i }));
    openAddDialog();

    fireEvent.change(screen.getByLabelText("Model printer"), { target: { value: "P1S" } });
    expect(screen.queryByText(/maks 11 karakter/i)).toBeNull();
  });

  it("tambah sukses -> dialog tertutup, dan input model direset (tak nyangkut buat device berikutnya kalau dialog dibuka lagi)", async () => {
    mockList([], 3);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "d2", label: "Printer 1", printerType: "bambu", model: "A1Mini" }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByRole("button", { name: /^\+ tambah$/i }));
    openAddDialog();

    const input = screen.getByLabelText("Model printer") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "A1Mini" } });
    fireEvent.click(screen.getByRole("button", { name: /tambah printer/i }));

    await waitFor(() => expect(screen.getByText("Printer 1")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();

    openAddDialog();
    expect((screen.getByLabelText("Model printer") as HTMLInputElement).value).toBe("");
  });

  it("dialog tambah: klik Batal -> tertutup, tak kirim request, input model direset", async () => {
    mockList([], 3);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByRole("button", { name: /^\+ tambah$/i }));
    openAddDialog();

    fireEvent.change(screen.getByLabelText("Model printer"), { target: { value: "A1Mini" } });
    fireEvent.click(screen.getByRole("button", { name: /^batal$/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // cuma GET awal, tak ada POST
    openAddDialog();
    expect((screen.getByLabelText("Model printer") as HTMLInputElement).value).toBe("");
  });

  it("edit inline model > 11 karakter -> tampilkan hint batas firmware", async () => {
    mockList([{ ...DEVICE_A, model: null }]);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText(/model belum diisi/i));

    fireEvent.click(screen.getByRole("button", { name: /isi model printer a/i }));
    fireEvent.change(screen.getByLabelText("Model printer Printer A"), { target: { value: "TerlaluPanjangUntukFirmware" } });
    expect(screen.getByText(/maks 11 karakter/i)).toBeTruthy();
  });

  it("tampilkan model kalau terisi", async () => {
    mockList([DEVICE_A]);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText("P1S")).toBeTruthy());
  });

  it("model null -> tampilkan badge 'Model belum diisi'", async () => {
    mockList([{ ...DEVICE_A, model: null }]);
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText(/model belum diisi/i)).toBeTruthy());
  });

  it("edit inline model: klik badge -> isi -> Enter -> PATCH { model }", async () => {
    mockList([{ ...DEVICE_A, model: null }]);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...DEVICE_A, model: "X1C" }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText(/model belum diisi/i));

    fireEvent.click(screen.getByRole("button", { name: /isi model printer a/i }));
    const input = screen.getByLabelText("Model printer Printer A") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "X1C" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/devices/d1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ model: "X1C" });
    await waitFor(() => expect(screen.getByText("X1C")).toBeTruthy());
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

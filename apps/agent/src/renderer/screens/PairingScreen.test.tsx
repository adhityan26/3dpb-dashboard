// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PairingScreen } from "./PairingScreen";

const devices = [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" }];

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    scanLan: vi.fn().mockResolvedValue({
      bambu: { ok: true, printers: [{ ip: "192.168.1.5", serial: "SER1", model: "C12", name: "Neptune" }] },
      moonraker: [],
    }),
    pairDevice: vi.fn().mockResolvedValue(undefined),
    updateDeviceModel: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe("PairingScreen", () => {
  it("tampilkan device terdaftar (kiri) dan hasil scan (kanan) setelah klik Scan", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    expect(screen.getByText(/192\.168\.1\.5/)).toBeTruthy();
  });

  it("pasangkan device+hasil-scan -> minta access code -> panggil pairDevice dengan IP+serial dari scan", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => screen.getByText(/192\.168\.1\.5/));

    fireEvent.click(screen.getByRole("button", { name: /pasangkan/i }));
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect((window as any).agentApi.pairDevice).toHaveBeenCalledWith("abc1234567", { ip: "192.168.1.5", serial: "SER1", accessCode: "1234" }));
  });

  it("opsi 'Isi manual' -> tak butuh hasil scan, langsung minta IP+serial+access code", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));
    await waitFor(() => expect((window as any).agentApi.pairDevice).toHaveBeenCalledWith("abc1234567", { ip: "10.0.0.9", serial: "MANUAL1", accessCode: "9999" }));
  });

  it("scanLan sukses tapi bambu port_in_use -> tampilkan pesan, tidak crash", async () => {
    (window as any).agentApi.scanLan.mockResolvedValue({ bambu: { ok: false, reason: "port_in_use" }, moonraker: [] });
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => expect(screen.getByText(/bambustudio/i)).toBeTruthy());
  });

  it("saat scan berjalan, tombol scan menunjukkan status memindai", async () => {
    let resolveScan: (v: any) => void = () => {};
    (window as any).agentApi.scanLan.mockReturnValue(
      new Promise((resolve) => {
        resolveScan = resolve;
      }),
    );
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /memindai/i })).toBeTruthy());
    resolveScan({ bambu: { ok: true, printers: [] }, moonraker: [] });
    await waitFor(() => expect(screen.getByRole("button", { name: /^scan lan$/i })).toBeTruthy());
  });

  it("scanLan mengembalikan hasil Moonraker -> tampilkan kolom Moonraker, bisa dipasangkan", async () => {
    (window as any).agentApi.scanLan.mockResolvedValue({
      bambu: { ok: true, printers: [] },
      moonraker: [{ ip: "192.168.1.20", name: "KlipperBox" }],
    });
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => expect(screen.getByText(/192\.168\.1\.20/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /pasangkan/i }));
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    // Moonraker connector (packages/printer-monitor-core) cuma pakai `ip` — serial dikirim
    // kosong karena Moonraker tak punya konsep serial seperti Bambu.
    await waitFor(() =>
      expect((window as any).agentApi.pairDevice).toHaveBeenCalledWith("abc1234567", {
        ip: "192.168.1.20",
        serial: "",
        accessCode: "0000",
      }),
    );
  });

  it("2 device terdaftar: onAllPaired HANYA terpanggil setelah SEMUA device dipasangkan, bukan setelah yang pertama", async () => {
    const twoDevices = [
      { id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
      { id: "d2", shortCode: "def1234567", userId: "u1", label: "Printer B", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
    ];
    const onAllPaired = vi.fn();
    render(<PairingScreen devices={twoDevices} onAllPaired={onAllPaired} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => screen.getByText(/192\.168\.1\.5/));

    // pasangkan device pertama lewat hasil scan
    fireEvent.click(screen.getByRole("button", { name: /pasangkan ke printer a/i }));
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "1111" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() =>
      expect((window as any).agentApi.pairDevice).toHaveBeenCalledWith("abc1234567", {
        ip: "192.168.1.5",
        serial: "SER1",
        accessCode: "1111",
      }),
    );
    expect(onAllPaired).not.toHaveBeenCalled();
    // device kedua masih belum dipasangkan -> form manual-nya masih tampil, device pertama
    // sudah tampil "Terpasang" dan form pairing-nya sudah tidak ditampilkan lagi
    expect(screen.getByRole("button", { name: /isi manual/i })).toBeTruthy();
    expect(screen.getByText(/terpasang/i)).toBeTruthy();

    // pasangkan device kedua lewat isi manual
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "2222" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect(onAllPaired).toHaveBeenCalled());
  });

  it("tombol 'Lanjut ke Dashboard' SELALU tampil dan panggil onAllPaired langsung -- termasuk akun 0-device (dead end lama)", async () => {
    const onAllPaired = vi.fn();
    render(<PairingScreen devices={[]} onAllPaired={onAllPaired} />);
    fireEvent.click(screen.getByRole("button", { name: /lanjut ke dashboard/i }));
    expect(onAllPaired).toHaveBeenCalled();
  });

  it("tombol 'Lanjut ke Dashboard' tetap tampil & bisa diklik walau ada device yang belum dipasangkan (skip manual)", async () => {
    const onAllPaired = vi.fn();
    render(<PairingScreen devices={devices} onAllPaired={onAllPaired} />);
    expect(screen.getByRole("button", { name: /lanjut ke dashboard/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /lanjut ke dashboard/i }));
    expect(onAllPaired).toHaveBeenCalled();
  });

  it("initialPairedShortCodes dari launch sebelumnya -> device itu langsung tampil 'Terpasang', tak perlu isi ulang access code", async () => {
    const onAllPaired = vi.fn();
    render(<PairingScreen devices={devices} onAllPaired={onAllPaired} initialPairedShortCodes={["abc1234567"]} />);
    expect(screen.getByText(/terpasang/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /isi manual/i })).toBeNull();
  });

  it("2 device, 1 sudah paired dari launch sebelumnya (initialPairedShortCodes) -> pasangkan sisanya -> onAllPaired terpanggil", async () => {
    const twoDevices = [
      { id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
      { id: "d2", shortCode: "def1234567", userId: "u1", label: "Printer B", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
    ];
    const onAllPaired = vi.fn();
    render(<PairingScreen devices={twoDevices} onAllPaired={onAllPaired} initialPairedShortCodes={["abc1234567"]} />);

    // Printer A sudah "Terpasang" dari awal, cuma Printer B yang perlu diisi.
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "2222" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect(onAllPaired).toHaveBeenCalled());
  });

  it("pairDevice gagal (IPC reject) -> tampilkan error, device TIDAK ditandai Terpasang, onAllPaired TIDAK terpanggil", async () => {
    (window as any).agentApi.pairDevice.mockRejectedValue(new Error("disk penuh"));
    const onAllPaired = vi.fn();
    render(<PairingScreen devices={devices} onAllPaired={onAllPaired} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onAllPaired).not.toHaveBeenCalled();
    expect(screen.queryByText(/terpasang/i)).toBeNull();
  });

  it("field Model ter-prefill dari saran SSDP (C12 -> P1S) saat pairing dari hasil scan", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => screen.getByText(/192\.168\.1\.5/));

    fireEvent.click(screen.getByRole("button", { name: /pasangkan/i }));

    expect((screen.getByLabelText(/^model/i) as HTMLInputElement).value).toBe("P1S");
  });

  it("field Model kosong untuk pairing manual (tak ada hasil scan buat disarankan)", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));

    expect((screen.getByLabelText(/^model/i) as HTMLInputElement).value).toBe("");
  });

  it("simpan pairing dengan model terisi -> panggil updateDeviceModel(shortCode, model) sesudah pairDevice", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/^model/i), { target: { value: "P1P" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect((window as any).agentApi.updateDeviceModel).toHaveBeenCalledWith("abc1234567", "P1P"));
    await waitFor(() => expect(screen.getByText(/terpasang/i)).toBeTruthy());
  });

  it("model kosong -> TIDAK panggil updateDeviceModel", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect(screen.getByText(/terpasang/i)).toBeTruthy());
    expect((window as any).agentApi.updateDeviceModel).not.toHaveBeenCalled();
  });

  it("updateDeviceModel gagal -> peringatan non-blocking, pairing TETAP dianggap selesai", async () => {
    (window as any).agentApi.updateDeviceModel.mockResolvedValue({ ok: false });
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/^model/i), { target: { value: "P1P" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect(screen.getByText(/model belum tersimpan ke akun/i)).toBeTruthy());
    expect(screen.getByText(/terpasang/i)).toBeTruthy();
  });
});

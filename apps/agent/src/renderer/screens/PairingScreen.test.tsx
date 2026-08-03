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
    forgetDevice: vi.fn().mockResolvedValue(undefined),
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

  it("device slot ber-type moonraker -> 'Isi manual' cuma minta IP, TANPA field Serial/Access Code (keduanya tak dipakai MoonrakerConnector)", async () => {
    const moonrakerDevice = [{ id: "d2", shortCode: "def1234567", userId: "u1", label: "Printer Klipper", printerType: "moonraker", model: null, createdAt: "x", updatedAt: "y" }];
    render(<PairingScreen devices={moonrakerDevice} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));

    expect(screen.getByLabelText(/^ip/i)).toBeTruthy();
    expect(screen.queryByLabelText(/serial/i)).toBeNull();
    expect(screen.queryByLabelText(/access code/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.50" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));
    await waitFor(() =>
      expect((window as any).agentApi.pairDevice).toHaveBeenCalledWith("def1234567", { ip: "10.0.0.50", serial: "", accessCode: "" }),
    );
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

    // pasangkan device pertama lewat hasil scan -- pilih "Printer A" di dropdown, baru klik
    // tombol "Pasangkan" generik (bukan lagi satu tombol per device)
    fireEvent.change(screen.getByLabelText(/pilih device/i), { target: { value: "abc1234567" } });
    fireEvent.click(screen.getByRole("button", { name: /^pasangkan$/i }));
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

  it("Model > 11 karakter -> tampilkan hint batas firmware", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^model/i), { target: { value: "TerlaluPanjangUntukFirmware" } });
    expect(screen.getByText(/maks 11 karakter/i)).toBeTruthy();
  });

  it("Model <= 11 karakter -> tak tampilkan hint", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^model/i), { target: { value: "P1P" } });
    expect(screen.queryByText(/maks 11 karakter/i)).toBeNull();
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

  it("updateDeviceModel gagal dengan kind:invalid_model -> pesan sebut batas karakter, BUKAN 'coba lagi lewat web'", async () => {
    (window as any).agentApi.updateDeviceModel.mockResolvedValue({ ok: false, kind: "invalid_model" });
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/^model/i), { target: { value: "TerlaluPanjangUntukFirmware" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect(screen.getByText(/model terlalu panjang/i)).toBeTruthy());
    expect(screen.queryByText(/model belum tersimpan ke akun — bisa diisi lewat web/i)).toBeNull();
    expect(screen.getByText(/terpasang/i)).toBeTruthy();
  });

  it("pasangkan device kedua -> peringatan model dari device pertama tidak nyangkut (Fix 3)", async () => {
    (window as any).agentApi.updateDeviceModel.mockResolvedValue({ ok: false });
    const twoDevices = [
      { id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
      { id: "d2", shortCode: "def1234567", userId: "u1", label: "Printer B", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
    ];
    render(<PairingScreen devices={twoDevices} onAllPaired={vi.fn()} />);

    // Ada 2 tombol "Isi manual" (satu per device belum-dipasangkan) -- device A duluan (index 0).
    fireEvent.click(screen.getAllByRole("button", { name: /isi manual/i })[0]);
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/^model/i), { target: { value: "P1P" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "1111" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));
    await waitFor(() => expect(screen.getByText(/model belum tersimpan ke akun/i)).toBeTruthy());

    // Mulai isi device kedua (sekarang tinggal satu tombol "Isi manual" -- Printer B) --
    // warning device pertama HARUS hilang begitu form baru dibuka.
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    expect(screen.queryByText(/model belum tersimpan ke akun/i)).toBeNull();
  });

  it("hasil scan Bambu yang namanya cocok dengan label device -> device itu jadi pilihan default dropdown + opsinya diberi penanda rekomendasi", async () => {
    const deviceMatchingName = [
      { id: "d1", shortCode: "abc1234567", userId: "u1", label: "Neptune", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
      { id: "d2", shortCode: "def1234567", userId: "u1", label: "Printer Lain", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
    ];
    // scanLan mock (beforeEach) balas printer bernama "Neptune" -- cocok persis dengan label d1.
    render(<PairingScreen devices={deviceMatchingName} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => screen.getByText(/192\.168\.1\.5/));

    const select = screen.getByLabelText(/pilih device/i) as HTMLSelectElement;
    expect(select.value).toBe("abc1234567");
    expect(screen.getByRole("option", { name: /neptune.*disarankan/i })).toBeTruthy();
    expect(screen.getByRole("option", { name: /^printer lain$/i })).toBeTruthy();
  });

  it("hasil scan Bambu yang namanya TAK cocok dengan device manapun -> tak ada opsi dropdown yang diberi penanda rekomendasi", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => screen.getByText(/192\.168\.1\.5/));

    // scanLan mock balas printer bernama "Neptune", devices fixture cuma punya "Printer A" -- tak cocok.
    expect(screen.getByRole("option", { name: /^printer a$/i })).toBeTruthy();
    expect(screen.queryByText(/disarankan/i)).toBeNull();
  });

  it("ganti pilihan dropdown ke device LAIN dari default rekomendasi -> Pasangkan target device yang dipilih user, bukan defaultnya", async () => {
    const deviceMatchingName = [
      { id: "d1", shortCode: "abc1234567", userId: "u1", label: "Neptune", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
      { id: "d2", shortCode: "def1234567", userId: "u1", label: "Printer Lain", printerType: "bambu", model: null, createdAt: "x", updatedAt: "y" },
    ];
    render(<PairingScreen devices={deviceMatchingName} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /scan lan/i }));
    await waitFor(() => screen.getByText(/192\.168\.1\.5/));

    // Default dropdown = "Neptune" (rekomendasi nama-cocok) -- user sengaja ganti ke "Printer
    // Lain".
    fireEvent.change(screen.getByLabelText(/pilih device/i), { target: { value: "def1234567" } });
    fireEvent.click(screen.getByRole("button", { name: /^pasangkan$/i }));
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() =>
      expect((window as any).agentApi.pairDevice).toHaveBeenCalledWith("def1234567", {
        ip: "192.168.1.5",
        serial: "SER1",
        accessCode: "1234",
      }),
    );
  });

  it("form pairing auto-scroll ke tampilan begitu muncul -- window Agent 900x670 gampang bikin form ke-render di luar viewport tanpa ini (user pernah kira tombol pasangkan mati)", async () => {
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
  });

  it("device sudah Terpasang -> tombol Edit muncul, klik buka form kosong (bukan prefill), Simpan overwrite pairDevice dengan nilai baru", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} initialPairedShortCodes={["abc1234567"]} />);

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect((screen.getByLabelText(/^ip/i) as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.55" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "FIXEDSERIAL" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() =>
      expect((window as any).agentApi.pairDevice).toHaveBeenCalledWith("abc1234567", {
        ip: "10.0.0.55",
        serial: "FIXEDSERIAL",
        accessCode: "5678",
      }),
    );
  });

  it("device sudah Terpasang, semua device lain juga sudah paired -> selesai Edit langsung panggil onAllPaired lagi (balik ke Dashboard + auto-sync)", async () => {
    const onAllPaired = vi.fn();
    render(<PairingScreen devices={devices} onAllPaired={onAllPaired} initialPairedShortCodes={["abc1234567"]} />);

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.55" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "FIXEDSERIAL" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    await waitFor(() => expect(onAllPaired).toHaveBeenCalled());
  });

  it("device sudah Terpasang -> tombol Lupakan panggil forgetDevice, device balik status belum-dipasangkan (tombol Isi manual muncul lagi)", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} initialPairedShortCodes={["abc1234567"]} />);
    expect(screen.getByText(/terpasang/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /lupakan/i }));

    await waitFor(() => expect((window as any).agentApi.forgetDevice).toHaveBeenCalledWith("abc1234567"));
    expect(screen.queryByText(/terpasang/i)).toBeNull();
    expect(screen.getByRole("button", { name: /isi manual/i })).toBeTruthy();
  });

  it("klik Edit lalu Lupakan device yang sama (belum sempat Simpan) -> form pairing ikut tertutup", async () => {
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} initialPairedShortCodes={["abc1234567"]} />);

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByLabelText(/access code/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /lupakan/i }));

    await waitFor(() => expect((window as any).agentApi.forgetDevice).toHaveBeenCalled());
    expect(screen.queryByLabelText(/access code/i)).toBeNull();
  });

  it("forgetDevice gagal (IPC reject) -> tampilkan error, device TETAP Terpasang", async () => {
    (window as any).agentApi.forgetDevice.mockRejectedValue(new Error("disk penuh"));
    render(<PairingScreen devices={devices} onAllPaired={vi.fn()} initialPairedShortCodes={["abc1234567"]} />);

    fireEvent.click(screen.getByRole("button", { name: /lupakan/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/terpasang/i)).toBeTruthy();
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

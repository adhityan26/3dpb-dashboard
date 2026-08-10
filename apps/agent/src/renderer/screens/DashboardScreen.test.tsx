// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { DashboardScreen } from "./DashboardScreen";

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    getSnapshot: vi.fn().mockResolvedValue({ payload: [{ id: "abc1234567", name: "Printer A", type: "bambu", connector: "bambu", state: "running", progress: 45, remaining_min: 30, filename: "box.gcode", error_msg: "", last_seen: "2026-07-29T10:00:00Z", nozzle_temp: 219, bed_temp: 60 }] }),
    getBrokerInfo: vi.fn().mockResolvedValue({ ip: "192.168.1.100", port: 1883 }),
    sync: vi.fn().mockResolvedValue({ ok: true, deviceCount: 1 }),
  };
});

describe("DashboardScreen", () => {
  it("tampilkan status printer dari snapshot", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    expect(screen.getByText(/45/)).toBeTruthy();
  });

  it("tampilkan nama file yang sedang dicetak (filename dari payload)", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText("box.gcode")).toBeTruthy());
  });

  it("filename kosong (tak ada job) -> tak ada baris nama file yang nyangkut", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", state: "idle", progress: 0, remaining_min: 0, filename: "", error_msg: "", error_message: "", last_seen: null, nozzle_temp: 25, bed_temp: 25 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    expect(screen.queryByText("box.gcode")).toBeNull();
  });

  it("state error -> tampilkan pesan error human-readable (error_message)", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", state: "error", progress: 0, remaining_min: 0, filename: "box.gcode", error_msg: "hms=... ", error_message: "Nozzle macet -- filament tak terdeteksi", last_seen: null, nozzle_temp: 25, bed_temp: 25 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/nozzle macet/i);
  });

  it("error_message kosong -> tak ada pesan error yang tampil (backend yg jamin field ini kosong kalau memang tak error)", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", state: "running", progress: 50, remaining_min: 10, filename: "box.gcode", error_msg: "", error_message: "", last_seen: null, nozzle_temp: 219, bed_temp: 60 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Kasus nyata (relay dari sesi firmware CYD, printer "Uranus" P1S, 2026-08-09): Bambu kadang
  // lapor state=pause walau genuinely error (print_error non-zero) -- backend (state-store.ts)
  // sekarang tetap isi error_message di kasus ini, jadi Dashboard HARUS tetap tampilkan
  // pesannya walau state literalnya bukan "error".
  it("state PAUSE tapi error_message terisi (Bambu genuinely error, bukan pause manual) -> pesan error TETAP tampil", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", state: "pause", progress: 30, remaining_min: 10, filename: "box.gcode", error_msg: "print_error=117473297", error_message: "Print error (kode 117473297)", last_seen: null, nozzle_temp: 219, bed_temp: 60 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/117473297/);
  });

  it("model dikenal (mis. P1S) -> render thumbnail printer asli, bukan icon generik", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", state: "idle", progress: 0, remaining_min: 0, filename: "", error_msg: "", error_message: "", last_seen: null, nozzle_temp: 25, bed_temp: 25 }],
    });
    const { container } = render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    const img = container.querySelector("img[alt='']");
    expect(img?.getAttribute("src")).toBe("./printers/bambu-p1s.jpg");
  });

  it("model tak dikenal/kosong -> fallback icon generik, BUKAN <img>", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "", state: "idle", progress: 0, remaining_min: 0, filename: "", error_msg: "", error_message: "", last_seen: null, nozzle_temp: 25, bed_temp: 25 }],
    });
    const { container } = render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    expect(container.querySelector("img[alt='']")).toBeNull();
    expect(screen.getByText("🖨️")).toBeTruthy();
  });

  it("tampilkan suhu nozzle dan bed per printer", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/nozzle 219°c/i)).toBeTruthy());
    expect(screen.getByText(/bed 60°c/i)).toBeTruthy();
  });

  it("tampilkan IP broker saat ini (buat diketik ke captive portal CYD)", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/192\.168\.1\.100/)).toBeTruthy());
  });

  it("tombol Pengaturan panggil onManageDevices -- satu-satunya jalan balik ke PairingScreen buat edit/lupakan device", async () => {
    const onManageDevices = vi.fn();
    render(<DashboardScreen onManageDevices={onManageDevices} />);
    fireEvent.click(screen.getByRole("button", { name: /pengaturan/i }));
    expect(onManageDevices).toHaveBeenCalled();
  });

  it("tombol Sync panggil window.agentApi.sync()", async () => {
    render(<DashboardScreen />);
    await waitFor(() => screen.getByRole("button", { name: /sync/i }));
    fireEvent.click(screen.getByRole("button", { name: /sync/i }));
    await waitFor(() => expect((window as any).agentApi.sync).toHaveBeenCalled());
  });

  it("Sync sukses: tombol tampilkan status 'Sync...' saat berjalan, lalu 'Tersinkron' setelah selesai (BUKAN fire-and-forget diam-diam)", async () => {
    let resolveSync: (v: any) => void = () => {};
    (window as any).agentApi.sync.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve;
      }),
    );
    render(<DashboardScreen />);
    fireEvent.click(screen.getByRole("button", { name: /^sync$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /sync\.\.\./i })).toBeTruthy());
    expect((screen.getByRole("button", { name: /sync\.\.\./i }) as HTMLButtonElement).disabled).toBe(true);

    resolveSync({ ok: true, deviceCount: 2 });

    await waitFor(() => expect(screen.getByText(/tersinkron/i)).toBeTruthy());
    expect(screen.getByText(/tersinkron/i).textContent).toMatch(/2/);
    expect(screen.getByRole("button", { name: /^sync$/i })).toBeTruthy();
  });

  it("Sync gagal (mis. token invalid) -> tampilkan pesan error yang bisa dibedakan dari kondisi sukses", async () => {
    (window as any).agentApi.sync.mockResolvedValue({ ok: false, kind: "invalid_token" });
    render(<DashboardScreen />);
    fireEvent.click(screen.getByRole("button", { name: /^sync$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/token tidak valid/i);
  });

  it("Sync gagal karena broker gak pernah jalan (broker_unavailable) -> tampilkan pesan yang jelas, BUKAN 'Tersinkron (N device)' yang menyesatkan (Minor #1)", async () => {
    (window as any).agentApi.sync.mockResolvedValue({ ok: false, kind: "broker_unavailable" });
    render(<DashboardScreen />);
    fireEvent.click(screen.getByRole("button", { name: /^sync$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/broker/i);
    expect(screen.queryByText(/tersinkron/i)).toBeNull();
  });

  it("Sync reject (IPC error) -> tidak crash, tampilkan pesan error generik", async () => {
    (window as any).agentApi.sync.mockRejectedValue(new Error("ipc boom"));
    render(<DashboardScreen />);
    fireEvent.click(screen.getByRole("button", { name: /^sync$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });

  it("getBrokerInfo balikin port:null (broker gagal start) -> tampilkan pesan fallback, bukan 'null' mentah", async () => {
    (window as any).agentApi.getBrokerInfo.mockResolvedValue({ ip: "192.168.1.100", port: null });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/broker belum jalan/i)).toBeTruthy());
    expect(screen.queryByText(/192\.168\.1\.100/)).toBeNull();
  });

  it("getSnapshot()/getBrokerInfo() reject -> tidak crash (UI tetap render, tak ada unhandled rejection)", async () => {
    (window as any).agentApi.getSnapshot.mockRejectedValue(new Error("snapshot boom"));
    (window as any).agentApi.getBrokerInfo.mockRejectedValue(new Error("broker boom"));
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^sync$/i })).toBeTruthy());
  });

  it("kartu printer render PrinterControls -- deviceId/state/connector dari payload dioper ke bawah", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", connector: "bambu", state: "running", progress: 45, remaining_min: 30, filename: "box.gcode", error_msg: "", error_message: "", last_seen: null, nozzle_temp: 219, bed_temp: 60 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^stop$/i })).toBeTruthy());
    expect(screen.getByRole("button", { name: /pause/i })).toBeTruthy();
    expect(screen.getByLabelText(/kecepatan print/i).tagName).toBe("SELECT");
  });

  it("state pause TAPI error_message ada -> badge status warna error, bukan info netral (kasus AMS habis/Uranus)", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", connector: "bambu", state: "pause", progress: 30, remaining_min: 10, filename: "box.gcode", error_msg: "x", error_message: "AMS filament ran out.", last_seen: null, nozzle_temp: 219, bed_temp: 60 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/pause — 30%/i)).toBeTruthy());
    expect(screen.getByText(/pause — 30%/i).className).toContain("g-error");
  });

  it("state pause TANPA error_message -> badge status tetap warna info netral (pause manual biasa, bukan regresi)", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", connector: "bambu", state: "pause", progress: 30, remaining_min: 10, filename: "box.gcode", error_msg: "", error_message: "", last_seen: null, nozzle_temp: 219, bed_temp: 60 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/pause — 30%/i)).toBeTruthy());
    expect(screen.getByText(/pause — 30%/i).className).toContain("g-info");
  });
});

describe("DashboardScreen polling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("getBrokerInfo() ikut di-poll tiap 5 detik bareng getSnapshot() -- bukan cuma sekali saat mount (IP broker bisa berubah lewat DHCP)", async () => {
    await act(async () => {
      render(<DashboardScreen />);
    });
    expect((window as any).agentApi.getBrokerInfo).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect((window as any).agentApi.getBrokerInfo).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect((window as any).agentApi.getBrokerInfo).toHaveBeenCalledTimes(3);
  });
});

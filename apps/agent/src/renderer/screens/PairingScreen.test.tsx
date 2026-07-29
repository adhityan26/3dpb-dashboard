// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PairingScreen } from "./PairingScreen";

const devices = [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", createdAt: "x", updatedAt: "y" }];

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    scanLan: vi.fn().mockResolvedValue({
      bambu: { ok: true, printers: [{ ip: "192.168.1.5", serial: "SER1", model: "C12", name: "Neptune" }] },
      moonraker: [],
    }),
    pairDevice: vi.fn().mockResolvedValue(undefined),
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
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

const devices = [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", createdAt: "x", updatedAt: "y" }];

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    activate: vi.fn().mockResolvedValue({ ok: true, data: devices }),
    scanLan: vi.fn().mockResolvedValue({ bambu: { ok: true, printers: [] }, moonraker: [] }),
    pairDevice: vi.fn().mockResolvedValue(undefined),
    sync: vi.fn().mockResolvedValue({ ok: true, deviceCount: 1 }),
    getSnapshot: vi.fn().mockResolvedValue({ payload: [] }),
    getBrokerInfo: vi.fn().mockResolvedValue({ ip: "192.168.1.100", port: 1883 }),
    // Default: belum pernah aktivasi -- mulai dari layar Aktivasi seperti sebelum Finding 2.
    getActivationState: vi.fn().mockResolvedValue({ hasToken: false, devices: [], pairedShortCodes: [] }),
  };
});

describe("App", () => {
  it("belum pernah aktivasi: alur penuh aktivasi -> pairing (pakai device dari hasil activate, BUKAN [] hardcoded) -> dashboard", async () => {
    render(<App />);

    // Layar 1: Aktivasi (setelah loading singkat dari agent:get-activation-state)
    await waitFor(() => expect(screen.getByLabelText(/token/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: "slz_abc" } });
    fireEvent.click(screen.getByRole("button", { name: /aktifkan/i }));

    // Layar 2: Pairing -- device dari hasil agent:activate (bukan [] hardcoded App.tsx lama)
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /isi manual/i }));
    fireEvent.change(screen.getByLabelText(/^ip/i), { target: { value: "10.0.0.9" } });
    fireEvent.change(screen.getByLabelText(/serial/i), { target: { value: "MANUAL1" } });
    fireEvent.change(screen.getByLabelText(/access code/i), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan pairing/i }));

    // Layar 3: Dashboard
    await waitFor(() => expect(screen.getByRole("button", { name: /sync/i })).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/192\.168\.1\.100/)).toBeTruthy());
  });

  it("relaunch: token ada & SEMUA device sudah dipasangkan sebelumnya -> LANGSUNG dashboard, tak perlu re-aktivasi/re-pairing (Finding 2)", async () => {
    (window as any).agentApi.getActivationState.mockResolvedValue({
      hasToken: true,
      devices,
      pairedShortCodes: ["abc1234567"],
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /sync/i })).toBeTruthy());
    expect(screen.queryByLabelText(/token/i)).toBeNull();
  });

  it("relaunch: token ada & 0 device terdaftar -> LANGSUNG dashboard (vacuously semua device sudah dipasangkan)", async () => {
    (window as any).agentApi.getActivationState.mockResolvedValue({
      hasToken: true,
      devices: [],
      pairedShortCodes: [],
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /sync/i })).toBeTruthy());
  });

  it("relaunch: token ada tapi belum SEMUA device dipasangkan -> layar Pairing, device yang sudah dipasangkan tampil 'Terpasang' (tak perlu isi ulang)", async () => {
    const twoDevices = [
      { id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", createdAt: "x", updatedAt: "y" },
      { id: "d2", shortCode: "def1234567", userId: "u1", label: "Printer B", printerType: "bambu", createdAt: "x", updatedAt: "y" },
    ];
    (window as any).agentApi.getActivationState.mockResolvedValue({
      hasToken: true,
      devices: twoDevices,
      pairedShortCodes: ["abc1234567"],
    });
    render(<App />);

    await waitFor(() => expect(screen.getByText(/terpasang/i)).toBeTruthy());
    // Printer B (belum dipasangkan) masih punya tombol "Isi manual", Printer A tidak.
    expect(screen.getByRole("button", { name: /isi manual/i })).toBeTruthy();
  });

  it("agent:get-activation-state gagal (IPC reject) -> fallback ke layar Aktivasi, tidak macet di loading", async () => {
    (window as any).agentApi.getActivationState.mockRejectedValue(new Error("ipc boom"));
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText(/token/i)).toBeTruthy());
  });
});

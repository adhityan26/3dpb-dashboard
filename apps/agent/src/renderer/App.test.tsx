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
    sync: vi.fn().mockResolvedValue({ ok: true, data: devices }),
    getSnapshot: vi.fn().mockResolvedValue({ payload: [] }),
    getBrokerInfo: vi.fn().mockResolvedValue({ ip: "192.168.1.100", port: 1883 }),
  };
});

describe("App", () => {
  it("alur penuh: aktivasi -> pairing (pakai device dari hasil activate, BUKAN [] hardcoded) -> dashboard", async () => {
    render(<App />);

    // Layar 1: Aktivasi
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
});

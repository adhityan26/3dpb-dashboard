// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DashboardScreen } from "./DashboardScreen";

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    getSnapshot: vi.fn().mockResolvedValue({ payload: [{ id: "abc1234567", name: "Printer A", type: "bambu", state: "running", progress: 45, remaining_min: 30, filename: "box.gcode", error_msg: "", last_seen: "2026-07-29T10:00:00Z" }] }),
    getBrokerInfo: vi.fn().mockResolvedValue({ ip: "192.168.1.100", port: 1883 }),
    sync: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  };
});

describe("DashboardScreen", () => {
  it("tampilkan status printer dari snapshot", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
    expect(screen.getByText(/45/)).toBeTruthy();
  });

  it("tampilkan IP broker saat ini (buat diketik ke captive portal CYD)", async () => {
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/192\.168\.1\.100/)).toBeTruthy());
  });

  it("tombol Sync panggil window.agentApi.sync()", async () => {
    render(<DashboardScreen />);
    await waitFor(() => screen.getByRole("button", { name: /sync/i }));
    fireEvent.click(screen.getByRole("button", { name: /sync/i }));
    await waitFor(() => expect((window as any).agentApi.sync).toHaveBeenCalled());
  });
});

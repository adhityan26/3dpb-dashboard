// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { DashboardScreen } from "./DashboardScreen";

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    getSnapshot: vi.fn().mockResolvedValue({ payload: [{ id: "abc1234567", name: "Printer A", type: "bambu", state: "running", progress: 45, remaining_min: 30, filename: "box.gcode", error_msg: "", last_seen: "2026-07-29T10:00:00Z" }] }),
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

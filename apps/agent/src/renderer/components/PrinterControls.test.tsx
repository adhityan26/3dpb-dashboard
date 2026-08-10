// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrinterControls } from "./PrinterControls";

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    sendPrinterCommand: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe("PrinterControls", () => {
  it("state running + connector bambu -> tampilkan Pause, dropdown speed 4 level, Stop", () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    expect(screen.getByRole("button", { name: /pause/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeTruthy();
    expect(screen.getByLabelText(/kecepatan print/i).tagName).toBe("SELECT");
    expect(screen.queryByRole("button", { name: /resume/i })).toBeNull();
  });

  it("state running + connector moonraker -> tampilkan slider persen, bukan dropdown", () => {
    render(<PrinterControls deviceId="ganymede" state="running" connector="moonraker" />);
    const slider = screen.getByLabelText(/kecepatan print/i);
    expect(slider.tagName).toBe("INPUT");
    expect(slider.getAttribute("type")).toBe("range");
    expect(slider.getAttribute("min")).toBe("20");
    expect(slider.getAttribute("max")).toBe("200");
    expect(slider.getAttribute("step")).toBe("10");
  });

  it("state paused -> Resume + Stop, TANPA kontrol speed (Pause hilang)", () => {
    render(<PrinterControls deviceId="mars" state="pause" connector="bambu" />);
    expect(screen.getByRole("button", { name: /resume/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull();
    expect(screen.queryByLabelText(/kecepatan print/i)).toBeNull();
  });

  it("state error -> Resume + Stop juga (bukan Stop-only)", () => {
    render(<PrinterControls deviceId="mars" state="error" connector="bambu" />);
    expect(screen.getByRole("button", { name: /resume/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeTruthy();
  });

  it("state idle/finish/offline -> tak render apa pun", () => {
    const { container: c1 } = render(<PrinterControls deviceId="mars" state="idle" connector="bambu" />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<PrinterControls deviceId="mars" state="finish" connector="bambu" />);
    expect(c2.firstChild).toBeNull();
    const { container: c3 } = render(<PrinterControls deviceId="mars" state="OFFLINE" connector="bambu" />);
    expect(c3.firstChild).toBeNull();
  });

  it("klik Pause -> panggil sendPrinterCommand dgn {kind:'pause'}", async () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect((window as any).agentApi.sendPrinterCommand).toHaveBeenCalledWith("mars", { kind: "pause" }));
  });

  it("ganti pilihan speed Bambu -> kirim setSpeedLevel dengan level yang dipilih", async () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.change(screen.getByLabelText(/kecepatan print/i), { target: { value: "3" } });
    await waitFor(() =>
      expect((window as any).agentApi.sendPrinterCommand).toHaveBeenCalledWith("mars", { kind: "setSpeedLevel", level: 3 }),
    );
  });

  it("geser slider Moonraker lalu lepas (mouseUp) -> kirim setSpeedPercent, BUKAN tiap tick onChange", async () => {
    render(<PrinterControls deviceId="ganymede" state="running" connector="moonraker" />);
    const slider = screen.getByLabelText(/kecepatan print/i);
    fireEvent.change(slider, { target: { value: "150" } });
    expect((window as any).agentApi.sendPrinterCommand).not.toHaveBeenCalled();
    fireEvent.mouseUp(slider, { target: { value: "150" } });
    await waitFor(() =>
      expect((window as any).agentApi.sendPrinterCommand).toHaveBeenCalledWith("ganymede", { kind: "setSpeedPercent", percent: 150 }),
    );
  });

  it("klik Stop -> muncul dialog konfirmasi, BELUM kirim command", () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    expect(screen.getByText(/proses akan dihentikan/i)).toBeTruthy();
    expect((window as any).agentApi.sendPrinterCommand).not.toHaveBeenCalled();
  });

  it("dialog Stop -> klik Tidak menutup dialog, TAK kirim command", () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^tidak$/i }));
    expect(screen.queryByText(/proses akan dihentikan/i)).toBeNull();
    expect((window as any).agentApi.sendPrinterCommand).not.toHaveBeenCalled();
  });

  it("dialog Stop -> klik 'Ya, batalkan' kirim {kind:'stop'} dan menutup dialog", async () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    fireEvent.click(screen.getByRole("button", { name: /ya, batalkan/i }));
    await waitFor(() => expect((window as any).agentApi.sendPrinterCommand).toHaveBeenCalledWith("mars", { kind: "stop" }));
    expect(screen.queryByText(/proses akan dihentikan/i)).toBeNull();
  });

  it("command gagal (ok:false) -> tampilkan pesan error inline", async () => {
    (window as any).agentApi.sendPrinterCommand.mockResolvedValue({ ok: false, message: "printer_offline" });
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/offline/i);
  });

  it("sendPrinterCommand reject (IPC error) -> tak crash, tampilkan pesan error generik", async () => {
    (window as any).agentApi.sendPrinterCommand.mockRejectedValue(new Error("ipc boom"));
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });

  it("saat sending, semua tombol disabled (cegah double-klik)", async () => {
    let resolveSend: (v: unknown) => void = () => {};
    (window as any).agentApi.sendPrinterCommand.mockReturnValue(new Promise((r) => { resolveSend = r; }));
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect((screen.getByRole("button", { name: /pause/i }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: /^stop$/i }) as HTMLButtonElement).disabled).toBe(true);
    resolveSend({ ok: true });
  });
});

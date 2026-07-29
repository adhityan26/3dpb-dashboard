// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActivationScreen } from "./ActivationScreen";

beforeEach(() => {
  (globalThis as any).window.agentApi = { activate: vi.fn() };
});

describe("ActivationScreen", () => {
  it("submit token sukses -> panggil onActivated dengan SaasDevice[] dari hasil activate", async () => {
    const devices = [{ id: "d1", shortCode: "abc1234567", userId: "u1", label: "Printer A", printerType: "bambu", createdAt: "x", updatedAt: "y" }];
    (window as any).agentApi.activate.mockResolvedValue({ ok: true, data: devices });
    const onActivated = vi.fn();
    render(<ActivationScreen onActivated={onActivated} />);
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: "slz_abc" } });
    fireEvent.click(screen.getByRole("button", { name: /aktifkan/i }));
    await waitFor(() => expect(onActivated).toHaveBeenCalledWith(devices));
  });

  it("401 -> pesan 'token gak valid', BUKAN pesan generik", async () => {
    (window as any).agentApi.activate.mockResolvedValue({ ok: false, kind: "invalid_token" });
    render(<ActivationScreen onActivated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: "slz_bad" } });
    fireEvent.click(screen.getByRole("button", { name: /aktifkan/i }));
    await waitFor(() => expect(screen.getByText(/token.*tidak valid/i)).toBeTruthy());
  });

  it("403 -> pesan langganan berakhir, BEDA dari pesan 401", async () => {
    (window as any).agentApi.activate.mockResolvedValue({ ok: false, kind: "entitlement_expired" });
    render(<ActivationScreen onActivated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: "slz_x" } });
    fireEvent.click(screen.getByRole("button", { name: /aktifkan/i }));
    await waitFor(() => expect(screen.getByText(/akses pro.*berakhir/i)).toBeTruthy());
  });
});

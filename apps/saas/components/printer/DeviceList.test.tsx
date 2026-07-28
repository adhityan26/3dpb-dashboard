// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeviceList } from "./DeviceList";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

describe("DeviceList", () => {
  it("tampilkan daftar device dari GET /api/devices", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ id: "d1", label: "Printer A", printerType: "bambu" }] });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => expect(screen.getByText("Printer A")).toBeTruthy());
  });

  it("tombol tambah disabled + pesan upsell kalau POST balas 409 slot_limit_exceeded", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "d1", label: "Printer A", printerType: "bambu" }] })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "slot_limit_exceeded", limit: 1 }) });
    render(<DeviceList paidCore={true} />);
    await waitFor(() => screen.getByText("Printer A"));
    fireEvent.click(screen.getByRole("button", { name: /tambah/i }));
    await waitFor(() => expect(screen.getByText(/batas.*tercapai/i)).toBeTruthy());
  });

  it("locked view (upsell) kalau paidCore false, tak panggil fetch sama sekali", () => {
    render(<DeviceList paidCore={false} />);
    expect(screen.getByText(/pro/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

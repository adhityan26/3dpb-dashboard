// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentTokenSection } from "./AgentTokenSection";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

describe("AgentTokenSection", () => {
  it("generate token → tampilkan token mentah SEKALI + peringatan", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial list
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "t1", token: "slz_abcdef123456" }) })
      .mockResolvedValue({ ok: true, json: async () => [] }); // fallback: refresh() setelah generate juga fetch
    render(<AgentTokenSection />);
    await waitFor(() => screen.getByRole("button", { name: /generate/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(screen.getByText("slz_abcdef123456")).toBeTruthy());
    expect(screen.getByText(/cuma tampil sekali/i)).toBeTruthy();
  });

  it("revoke token → panggil DELETE dengan id yang benar", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "t1", createdAt: new Date().toISOString(), revokedAt: null, lastUsedAt: null }] })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValue({ ok: true, json: async () => [] }); // fallback: refresh() setelah revoke juga fetch
    render(<AgentTokenSection />);
    await waitFor(() => screen.getByRole("button", { name: /revoke/i }));
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agent-tokens/t1", { method: "DELETE" }));
  });
});

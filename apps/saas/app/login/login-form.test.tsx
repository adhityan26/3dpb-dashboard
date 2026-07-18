// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signInMock = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signInMock(...a) }));
import LoginPage from "@/app/login/page";

beforeEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("LoginPage auto-detect", () => {
  it("input email → panggil signIn resend + tampil 'cek inbox'", async () => {
    signInMock.mockResolvedValue({ ok: true });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText(/Email atau nomor/i), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByText("Lanjut"));
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith("resend", { email: "a@b.com", redirect: false }));
    expect(screen.getByText(/Cek inbox/i)).toBeTruthy();
  });

  it("input nomor → POST wa/start + tampil input kode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText(/Email atau nomor/i), { target: { value: "08123456789" } });
    fireEvent.click(screen.getByText("Lanjut"));
    await waitFor(() => expect(screen.getByPlaceholderText("123456")).toBeTruthy());
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe("/api/auth/wa/start");
  });

  it("input ngawur → hint", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText(/Email atau nomor/i), { target: { value: "halo123" } });
    fireEvent.click(screen.getByText("Lanjut"));
    await waitFor(() => expect(screen.getByText(/Masukkan email/i)).toBeTruthy());
  });
});

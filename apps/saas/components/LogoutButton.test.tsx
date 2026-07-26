// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LogoutButton } from "./LogoutButton";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
import { signOut } from "next-auth/react";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

describe("LogoutButton", () => {
  beforeEach(() => {
    (signOut as any).mockClear();
  });

  it("klik → semua Cache Storage dihapus lalu signOut dipanggil", async () => {
    const del = vi.fn().mockResolvedValue(true);
    (globalThis as any).caches = { keys: vi.fn().mockResolvedValue(["a", "b"]), delete: del };
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /Keluar/ }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
    expect(del).toHaveBeenCalledWith("a");
    expect(del).toHaveBeenCalledWith("b");
  });

  it("Cache API tak tersedia → tetap signOut, tak crash", async () => {
    delete (globalThis as any).caches;
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /Keluar/ }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("caches.keys() ditolak (reject) → tetap signOut, best-effort", async () => {
    (globalThis as any).caches = { keys: vi.fn().mockRejectedValue(new Error("boom")) };
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /Keluar/ }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });
});

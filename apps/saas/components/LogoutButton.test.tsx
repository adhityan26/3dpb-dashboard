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

  it("klik → cache RUNTIME dihapus (bukan precache) lalu signOut dipanggil", async () => {
    const del = vi.fn().mockResolvedValue(true);
    (globalThis as any).caches = {
      keys: vi.fn().mockResolvedValue(["pages-navigate", "static-data-assets", "serwist-precache-v2-http://x/"]),
      delete: del,
    };
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /Keluar/ }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
    expect(del).toHaveBeenCalledWith("pages-navigate");
    expect(del).toHaveBeenCalledWith("static-data-assets");
    expect(del).not.toHaveBeenCalledWith("serwist-precache-v2-http://x/");
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

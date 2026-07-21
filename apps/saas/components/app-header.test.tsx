// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
import { AppHeader } from "./AppHeader";

describe("AppHeader nav", () => {
  it("owner → link Admin muncul", () => {
    render(<AppHeader owner={true} current="kalkulator" />);
    const admin = screen.getByText(/Admin/) as HTMLAnchorElement;
    expect(admin.closest("a")?.getAttribute("href")).toBe("/admin");
  });

  it("non-owner → link Admin TIDAK muncul", () => {
    render(<AppHeader owner={false} current="kalkulator" />);
    expect(screen.queryByText(/Admin/)).toBeNull();
  });

  // "Kalkulator" sengaja muncul 2×: link cepat di nav + entri di menu Modul.
  const adaJalanBalikKeKalkulator = () =>
    screen.getAllByText(/Kalkulator/).some((el) => el.closest("a")?.getAttribute("href") === "/");

  it("dari admin ada jalan balik ke Kalkulator & Setting", () => {
    render(<AppHeader owner={true} current="admin" />);
    expect(adaJalanBalikKeKalkulator()).toBe(true);
    expect(screen.getByText(/Setting/).closest("a")?.getAttribute("href")).toBe("/settings");
    // halaman aktif tak dilink ke dirinya sendiri
    expect(screen.queryByText(/^\s*Admin\s*$/)).toBeNull();
  });

  it("dari setting ada jalan balik ke Kalkulator", () => {
    render(<AppHeader owner={false} current="setting" />);
    expect(adaJalanBalikKeKalkulator()).toBe(true);
  });

  it("anon (authenticated=false) → tak ada nav", () => {
    render(<AppHeader authenticated={false} />);
    expect(screen.queryByText(/Kalkulator/)).toBeNull();
    expect(screen.queryByText(/Keluar/)).toBeNull();
  });
});

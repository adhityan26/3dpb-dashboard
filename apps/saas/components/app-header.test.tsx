// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", theme: "dark", setTheme: vi.fn() }) }));
import { AppHeader } from "./AppHeader";

const hrefOf = (label: string) => screen.getByText(label).closest("a")?.getAttribute("href");

describe("AppHeader nav island", () => {
  it("owner → tab Admin muncul", () => {
    render(<AppHeader owner={true} current="kalkulator" />);
    expect(hrefOf("Admin")).toBe("/admin");
  });

  it("non-owner → tab Admin TIDAK muncul", () => {
    render(<AppHeader owner={false} current="kalkulator" />);
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("dari admin ada jalan balik ke Kalkulator & Setting; tab aktif ditandai", () => {
    render(<AppHeader owner={true} current="admin" />);
    expect(hrefOf("Kalkulator")).toBe("/");
    expect(hrefOf("Setting")).toBe("/settings");
    // tab halaman aktif tetap tampil (pola tab island) tapi ditandai aria-current
    expect(screen.getByText("Admin").closest("a")?.getAttribute("aria-current")).toBe("page");
  });

  it("dari setting ada jalan balik ke Kalkulator", () => {
    render(<AppHeader owner={false} current="setting" />);
    expect(hrefOf("Kalkulator")).toBe("/");
  });

  it("modul belum jadi tampil tapi TIDAK dilinkkan (badge soon)", () => {
    render(<AppHeader owner={false} current="kalkulator" />);
    for (const label of ["Invoice", "PO", "Filamen", "Printer"]) {
      expect(screen.getByText(label).closest("a")).toBeNull();
    }
    expect(screen.getAllByText("soon").length).toBe(4);
  });

  it("avatar muncul dari userLabel; tanpa userLabel tak ada avatar", () => {
    const { unmount } = render(<AppHeader current="kalkulator" userLabel="adhitya@mail.com" />);
    expect(screen.getByTitle("adhitya@mail.com")).toBeTruthy();
    unmount();
    render(<AppHeader current="kalkulator" />);
    expect(screen.queryByTitle(/@/)).toBeNull();
  });

  it("anon (authenticated=false) → tak ada tab & kontrol", () => {
    render(<AppHeader authenticated={false} />);
    expect(screen.queryByText("Kalkulator")).toBeNull();
    expect(screen.queryByLabelText("Keluar")).toBeNull();
  });
});

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

  it("dari admin ada jalan balik ke Kalkulator & Setting", () => {
    render(<AppHeader owner={true} current="admin" />);
    expect(screen.getByText(/Kalkulator/).closest("a")?.getAttribute("href")).toBe("/");
    expect(screen.getByText(/Setting/).closest("a")?.getAttribute("href")).toBe("/settings");
    // halaman aktif tak dilink ke dirinya sendiri
    expect(screen.queryByText(/^\s*Admin\s*$/)).toBeNull();
  });

  it("dari setting ada jalan balik ke Kalkulator", () => {
    render(<AppHeader owner={false} current="setting" />);
    expect(screen.getByText(/Kalkulator/).closest("a")?.getAttribute("href")).toBe("/");
  });

  it("anon (authenticated=false) → tak ada nav", () => {
    render(<AppHeader authenticated={false} />);
    expect(screen.queryByText(/Kalkulator/)).toBeNull();
    expect(screen.queryByText(/Keluar/)).toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", theme: "dark", setTheme: vi.fn() }) }));
import { PageShell } from "./PageShell";

const mainOf = (c: HTMLElement) => c.querySelector("main")!;

describe("PageShell", () => {
  it("container konten sama lebar di semua halaman (nav tak geser)", () => {
    const a = render(<PageShell title="Setting" current="setting"><p>isi</p></PageShell>);
    const setting = mainOf(a.container).className;
    a.unmount();
    const b = render(<PageShell title="Admin" current="admin" owner><p>isi</p></PageShell>);
    const admin = mainOf(b.container).className;
    b.unmount();
    const c = render(<PageShell title="Pro" current="beli" narrow><p>isi</p></PageShell>);
    expect(setting).toBe(admin);
    expect(mainOf(c.container).className).toBe(admin); // `narrow` mempersempit KONTEN, bukan container
  });

  it("judul selalu terender sebagai H1 (tak ada halaman menggantung)", () => {
    render(<PageShell title="Kalkulator harga jual"><p>isi</p></PageShell>);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Kalkulator harga jual");
  });

  it("description & actions tampil bila diisi, tak ada bila kosong", () => {
    const { unmount } = render(
      <PageShell title="Judul" description="Penjelasan singkat." actions={<button>Aksi</button>}>
        <p>isi</p>
      </PageShell>,
    );
    expect(screen.getByText("Penjelasan singkat.")).toBeTruthy();
    expect(screen.getByText("Aksi")).toBeTruthy();
    unmount();
    render(<PageShell title="Judul"><p>isi</p></PageShell>);
    expect(screen.queryByText("Penjelasan singkat.")).toBeNull();
  });

  it("narrow mempersempit pembungkus konten saja", () => {
    const { container } = render(<PageShell title="Pro" narrow><p>isi</p></PageShell>);
    expect(screen.getByText("isi").closest("div")?.className).toContain("max-w-md");
    expect(mainOf(container).className).toContain("max-w-6xl");
  });

  it("meneruskan owner ke nav (tab Admin)", () => {
    render(<PageShell title="Kalkulator" owner current="kalkulator"><p>isi</p></PageShell>);
    expect(screen.getByText("Admin").closest("a")?.getAttribute("href")).toBe("/admin");
  });

  it("merender konten halaman", () => {
    render(<PageShell title="Judul"><p>isi halaman</p></PageShell>);
    expect(screen.getByText("isi halaman")).toBeTruthy();
  });
});

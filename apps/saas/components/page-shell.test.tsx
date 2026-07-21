// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
import { PageShell } from "./PageShell";

const mainOf = (c: HTMLElement) => c.querySelector("main")!;

describe("PageShell", () => {
  it("container sama lebar di semua halaman (header tak geser)", () => {
    const a = render(<PageShell subtitle="Setting" current="setting"><p>isi</p></PageShell>);
    const lebarSetting = mainOf(a.container).className;
    a.unmount();
    const b = render(<PageShell subtitle="Admin" current="admin" owner><p>isi</p></PageShell>);
    const lebarAdmin = mainOf(b.container).className;
    b.unmount();
    const c = render(<PageShell subtitle="Pro" current="beli" narrow><p>isi</p></PageShell>);
    const lebarBeli = mainOf(c.container).className;
    expect(lebarSetting).toBe(lebarAdmin);
    expect(lebarAdmin).toBe(lebarBeli); // `narrow` mempersempit KONTEN, bukan container
  });

  it("merender header + konten", () => {
    render(<PageShell subtitle="Setting" current="setting"><p>isi halaman</p></PageShell>);
    expect(screen.getByText("Slizebiz")).toBeTruthy();
    expect(screen.getByText("isi halaman")).toBeTruthy();
  });

  it("narrow mempersempit pembungkus konten saja", () => {
    const { container } = render(<PageShell narrow><p>isi</p></PageShell>);
    const wrapper = screen.getByText("isi").parentElement!;
    expect(wrapper.className).toContain("max-w-md");
    expect(mainOf(container).className).toContain("max-w-3xl");
  });

  it("meneruskan owner ke header (link Admin)", () => {
    render(<PageShell owner current="kalkulator"><p>isi</p></PageShell>);
    expect(screen.getByText(/Admin/).closest("a")?.getAttribute("href")).toBe("/admin");
  });
});

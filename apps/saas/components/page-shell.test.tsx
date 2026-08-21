// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", theme: "dark", setTheme: vi.fn() }) }));
// MobileBottomNav (dipasang PageShell sekarang) pakai usePathname buat highlight tab aktif.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { PageShell } from "./PageShell";
import { signOut } from "next-auth/react";

beforeEach(() => {
  (signOut as any).mockClear();
});

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

  it("meneruskan owner ke nav (tab Admin) -- muncul di nav desktop DAN MobileBottomNav", () => {
    render(<PageShell title="Kalkulator" owner current="kalkulator"><p>isi</p></PageShell>);
    const links = screen.getAllByText("Admin").map((el) => el.closest("a")?.getAttribute("href"));
    expect(links).toEqual(["/admin", "/admin"]);
  });

  it("MobileBottomNav: tab non-owner (Kalkulator/Printer/Setting) tampil, Admin TIDAK, kalau owner=false", () => {
    // Judul beda dari label tab manapun -- biar getAllByText hitung nav doang, bukan ikut h1.
    render(<PageShell title="Halaman Uji" current="kalkulator"><p>isi</p></PageShell>);
    // Desktop + mobile masing-masing 1x utk tab yang jadi (bukan "soon").
    expect(screen.getAllByText("Kalkulator").length).toBe(2);
    expect(screen.getAllByText("Printer").length).toBe(2);
    expect(screen.getAllByText("Setting").length).toBe(2);
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("MobileBottomNav sheet 'More' -> klik tombol Logout -> jalur logout SAMA dengan LogoutButton (signOut callbackUrl /login)", async () => {
    render(<PageShell title="Halaman Uji" current="kalkulator"><p>isi</p></PageShell>);
    fireEvent.click(screen.getByText("More"));
    fireEvent.click(screen.getByLabelText("Logout"));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("merender konten halaman", () => {
    render(<PageShell title="Judul"><p>isi halaman</p></PageShell>);
    expect(screen.getByText("isi halaman")).toBeTruthy();
  });
});

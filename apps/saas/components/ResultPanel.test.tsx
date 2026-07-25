// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResultPanel } from "./ResultPanel";
import { fullView } from "@/lib/kalkulator/compute";
import { rupiah } from "@/lib/kalkulator/format";

const view = fullView({ gramasi: 50, durasiJam: 3, tipe: "FDM" });

describe("ResultPanel", () => {
  const base = { view, channel: "offline", tier: "B" as const, onChannel: vi.fn(), onTier: vi.fn(), onCopy: vi.fn(), onReset: vi.fn() };
  it("headline = strategi[channel][tier].harga", () => {
    render(<ResultPanel {...base} />);
    expect(screen.getAllByText(rupiah(view.strategi.offline.B.harga)).length).toBeGreaterThan(0);
  });
  it("klik strategi Premium memanggil onTier('C')", () => {
    const onTier = vi.fn();
    render(<ResultPanel {...base} onTier={onTier} />);
    fireEvent.click(screen.getByRole("button", { name: /Premium/ }));
    expect(onTier).toHaveBeenCalledWith("C");
  });
  it("klik channel Shopee memanggil onChannel('shopee')", () => {
    const onChannel = vi.fn();
    render(<ResultPanel {...base} onChannel={onChannel} />);
    fireEvent.click(screen.getByRole("button", { name: /Shopee/ }));
    expect(onChannel).toHaveBeenCalledWith("shopee");
  });
  it("Salin & Reset memanggil handler; Simpan tak dirender tanpa onSave", () => {
    const onCopy = vi.fn(), onReset = vi.fn();
    render(<ResultPanel {...base} onCopy={onCopy} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /Salin harga jual/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(onCopy).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Simpan|Update/ })).toBeNull();
  });
  it("caveat marketplace muncul saat channel shopee", () => {
    render(<ResultPanel {...base} channel="shopee" />);
    expect(screen.getByText(/belum.*(voucher|ongkir|iklan)/i)).toBeTruthy();
  });
  it("tidak menampilkan rumus modal/(1−margin)", () => {
    const { container } = render(<ResultPanel {...base} />);
    expect(container.textContent).not.toMatch(/1\s*[−-]\s*margin/i);
  });
});

describe("ResultPanel: Simpan/Update (1b-4)", () => {
  const base = { view, channel: "offline", tier: "B" as const, onChannel: vi.fn(), onTier: vi.fn(), onCopy: vi.fn(), onReset: vi.fn() };
  it("onSave diberikan → tombol 'Simpan' muncul dan memanggilnya saat diklik", () => {
    const onSave = vi.fn();
    render(<ResultPanel {...base} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /^Simpan/ }));
    expect(onSave).toHaveBeenCalled();
  });
  it("isEditing=true → label tombol 'Update'", () => {
    render(<ResultPanel {...base} onSave={vi.fn()} isEditing />);
    expect(screen.getByRole("button", { name: /^Update/ })).toBeTruthy();
  });
});

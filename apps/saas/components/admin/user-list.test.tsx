// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserList, type UserRow } from "./UserList";

const row = (o: Partial<UserRow> = {}): UserRow => ({ who: "a@b.c", status: "Pro", joined: "2026-07-01", ...o });

describe("UserList kolom Pembayaran", () => {
  it("user sudah bayar → tampil nominal, tanggal, link bukti & detail", () => {
    render(<UserList rows={[row({ payment: { id: "p1", amount: 149000, when: "2026-07-20", hasProof: true } })]} />);
    expect(screen.getByText(/Rp149\.000 · 2026-07-20/)).toBeTruthy();
    expect(screen.getByText("bukti").getAttribute("href")).toBe("/api/beli/p1/proof");
    expect(screen.getByText(/detail/).getAttribute("href")).toBe("#pembayaran");
  });

  it("bukti sudah kedaluwarsa/tak ada → link bukti tak muncul, detail tetap", () => {
    render(<UserList rows={[row({ payment: { id: "p2", amount: 149000, when: "2026-05-01", hasProof: false } })]} />);
    expect(screen.queryByText("bukti")).toBeNull();
    expect(screen.getByText(/detail/).getAttribute("href")).toBe("#pembayaran");
  });

  it("user belum bayar → '—'", () => {
    render(<UserList rows={[row({ status: "Free" })]} />);
    // Kolom Agent (baru) JUGA "—" kalau agent kosong -- 2 match yang sama-sama valid.
    expect(screen.getAllByText("—").length).toBe(2);
    expect(screen.queryByText(/detail/)).toBeNull();
  });
});

describe("UserList kolom Agent", () => {
  it("agent pernah konek -> tampil versi + kapan terakhir dilihat (buat diagnosa komplain 'kena bug X, ternyata versi lama')", () => {
    render(<UserList rows={[row({ agent: { version: "0.3.1", lastSeen: "2026-08-08" } })]} />);
    expect(screen.getByText(/v0\.3\.1/)).toBeTruthy();
    expect(screen.getByText(/2026-08-08/)).toBeTruthy();
  });

  it("agent belum pernah konek (tak ada AgentToken/belum pernah lastUsedAt) -> '—'", () => {
    render(<UserList rows={[row({})]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

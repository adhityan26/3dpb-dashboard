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
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText(/detail/)).toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaidList } from "./PaidList";

it("shows the Nonaktifkan button for a BELI row", () => {
  render(<PaidList rows={[
    { id: "p1", userId: "u1", amount: 150000, who: "u1", when: "2026-08-21", productType: "BELI", quantity: null },
  ]} />);
  expect(screen.getByRole("button", { name: /nonaktifkan/i })).toBeTruthy();
});

it("hides the Nonaktifkan button for a SLOT_PURCHASE row (deactivate is BELI-only)", () => {
  render(<PaidList rows={[
    { id: "p2", userId: "u2", amount: 30000, who: "u2", when: "2026-08-21", productType: "SLOT_PURCHASE", quantity: 3 },
  ]} />);
  expect(screen.queryByRole("button", { name: /nonaktifkan/i })).toBeNull();
  expect(screen.getByText("Slot ×3")).toBeTruthy();
});

it("shows the raw productType for an unrecognized product, not 'Pro (lifetime)'", () => {
  render(<PaidList rows={[
    { id: "p3", userId: "u3", amount: 99000, who: "u3", when: "2026-08-21", productType: "UNKNOWN_PRODUCT", quantity: null },
  ]} />);
  expect(screen.getByText("UNKNOWN_PRODUCT")).toBeTruthy();
  expect(screen.queryByText("Pro (lifetime)")).toBeNull();
});

it("shows the CYD ×qty label and hides Nonaktifkan for a CYD_PURCHASE row", () => {
  render(<PaidList rows={[
    { id: "p4", userId: "u4", amount: 200000, who: "u4", when: "2026-08-21", productType: "CYD_PURCHASE", quantity: 2 },
  ]} />);
  expect(screen.getByText("CYD ×2")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /nonaktifkan/i })).toBeNull();
});

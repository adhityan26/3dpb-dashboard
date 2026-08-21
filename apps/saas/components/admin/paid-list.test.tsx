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

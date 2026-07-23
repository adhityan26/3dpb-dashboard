// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileSummaryBar } from "./MobileSummaryBar";

describe("MobileSummaryBar", () => {
  it("tampil modal & harga jual, tombol buka rincian", () => {
    const onOpen = vi.fn();
    render(<MobileSummaryBar modal={95520} harga={187500} onOpen={onOpen} />);
    expect(screen.getByText(/Rp95\.520/)).toBeTruthy();
    expect(screen.getByText(/Rp187\.500/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /rincian/i }));
    expect(onOpen).toHaveBeenCalled();
  });
});

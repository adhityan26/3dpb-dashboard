// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PageTabs } from "./PageTabs";

const twoPages = [
  { id: "hal-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] },
  { id: "hal-2", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] },
];

describe("PageTabs", () => {
  it("klik tab memanggil onSelect dengan index yang benar", () => {
    const onSelect = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={onSelect}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
      />
    );
    fireEvent.click(screen.getByText("hal-2"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

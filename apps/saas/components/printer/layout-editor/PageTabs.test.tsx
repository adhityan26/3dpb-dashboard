// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageTabs } from "./PageTabs";

const twoPages = [
  { id: "hal-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] },
  { id: "hal-2", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] },
];

describe("PageTabs", () => {
  it("klik tab memanggil onSelect dengan index yang benar", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
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
    // userEvent.click() memancarkan pointer events yang lebih realistis (pointerdown → pointermove
    // dengan offset kecil → click → pointerup), yang trigger PointerSensor dnd-kit. Ini berbeda
    // dari fireEvent.click() yang hanya emit MouseEvent bare tanpa pointerdown/pointermove sequence.
    // Tanpa activationConstraint: distance:4, sensor interpret offset kecil sebagai drag dan
    // swallow onClick; dengan constraint:4, offset 2px diabaikan, onClick tetap reach handler.
    await user.click(screen.getByText("hal-2"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

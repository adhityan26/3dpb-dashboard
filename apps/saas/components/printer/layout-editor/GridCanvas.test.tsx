// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { GridCanvas } from "./GridCanvas";
import type { LayoutPageOut } from "@3pb/cyd-layout-schema";

const RINGKAS = [["name"], ["state"]];
const DETAIL = [["name"], ["state"], ["progress"], ["timeLeft"]];

function renderCanvas(page: LayoutPageOut, deviceLabels: Record<string, string> = { abc1234567: "Printer A" }) {
  return render(
    <DndContext>
      <GridCanvas
        page={page}
        deviceLabels={deviceLabels}
        selectedCellIndex={null}
        onSelectCell={() => {}}
        onAddCell={() => {}}
        onUpdateCell={() => {}}
        onUpdatePage={() => {}}
      />
    </DndContext>
  );
}

function basePage(overrides: Partial<LayoutPageOut>): LayoutPageOut {
  return {
    id: "hal-1",
    grid: { cols: 2, rows: 2 },
    fields: [],
    durationSec: 5,
    cells: [],
    ...overrides,
  } as LayoutPageOut;
}

describe("GridCanvas preview field", () => {
  it("override per-sel (cell.fields) dipakai, BUKAN default halaman", () => {
    renderCanvas(
      basePage({
        fields: DETAIL as any,
        cells: [{ printer: "abc1234567", col: 0, row: 0, fields: RINGKAS as any } as any],
      })
    );
    // Ringkas override cuma 2 baris: name + state -- field Detail (progress/timeLeft) TIDAK muncul.
    expect(screen.getByText("Printer A")).toBeTruthy();
    expect(screen.getByText("Mencetak")).toBeTruthy();
    expect(screen.queryByText("45%")).toBeNull();
    expect(screen.queryByText("1j 20m")).toBeNull();
  });

  it("tanpa override sel, ikut default halaman (Detail = 4 baris nilai contoh)", () => {
    renderCanvas(
      basePage({
        fields: DETAIL as any,
        cells: [{ printer: "abc1234567", col: 0, row: 0 } as any],
      })
    );
    expect(screen.getByText("Printer A")).toBeTruthy();
    expect(screen.getByText("Mencetak")).toBeTruthy();
    expect(screen.getByText("45%")).toBeTruthy();
    expect(screen.getByText("1j 20m")).toBeTruthy();
  });

  it("page.fields kosong (Bawaan firmware) -> fallback Ringkas (name + state saja)", () => {
    renderCanvas(
      basePage({
        fields: [],
        cells: [{ printer: "abc1234567", col: 0, row: 0 } as any],
      })
    );
    expect(screen.getByText("Printer A")).toBeTruthy();
    expect(screen.getByText("Mencetak")).toBeTruthy();
    expect(screen.queryByText("45%")).toBeNull();
  });

  it("shortCode tak dikenal (bukan di deviceLabels) -> peringatan lama, BUKAN preview field contoh", () => {
    renderCanvas(
      basePage({
        fields: DETAIL as any,
        cells: [{ printer: "zzz9999999", col: 0, row: 0 } as any],
      }),
      { abc1234567: "Printer A" }
    );
    expect(screen.getByText("zzz9999999")).toBeTruthy();
    expect(screen.getByText("— printer tak dikenal —")).toBeTruthy();
    expect(screen.queryByText("Mencetak")).toBeNull();
  });
});

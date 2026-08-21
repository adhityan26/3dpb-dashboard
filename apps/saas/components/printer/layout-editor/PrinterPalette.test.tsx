// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { PrinterPalette, DeviceCardPreview } from "./PrinterPalette";

function renderPalette(devices: Parameters<typeof PrinterPalette>[0]["devices"]) {
  return render(
    <DndContext>
      <PrinterPalette devices={devices} usedShortCodesOnActivePage={[]} />
    </DndContext>
  );
}

// Thumbnail dekoratif pakai alt="" (label device sudah menyampaikan info yang sama ke screen
// reader) -- itu bikin browser kasih role "presentation", bukan "img", jadi query lewat tag
// <img> langsung, bukan getByRole("img").

describe("PrinterPalette thumbnail printer", () => {
  it("model bambu dikenal -> render <img> thumbnail, bukan emoji", () => {
    const { container } = renderPalette([{ shortCode: "abc1234567", label: "Printer A", printerType: "bambu", model: "P1S" }]);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/printers/bambu-p1s.jpg");
  });

  it("model tak dikenal / kosong -> fallback emoji printer, bukan <img>", () => {
    const { container } = renderPalette([{ shortCode: "zzz9999999", label: "Printer Misteri", printerType: "moonraker", model: "Voron" }]);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("🖨️")).toBeTruthy();
  });

  it("DeviceCardPreview (drag overlay) ikut pakai thumbnail yang sama", () => {
    const { container } = render(<DeviceCardPreview device={{ shortCode: "abc1234567", label: "Printer A", printerType: "moonraker", model: "U1" }} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/printers/snapmaker-u1.jpg");
  });
});

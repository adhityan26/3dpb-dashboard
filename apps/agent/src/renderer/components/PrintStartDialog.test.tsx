import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintStartDialog } from "./PrintStartDialog";

const mockParseThreemf = vi.fn();
const mockSendPrinterCommand = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(window, {
    agentApi: { parseThreemf: mockParseThreemf, sendPrinterCommand: mockSendPrinterCommand },
  });
});

describe("PrintStartDialog", () => {
  it("langkah 1: pilih plate, langkah 2: konfirmasi, baru kirim command", async () => {
    mockParseThreemf.mockResolvedValue([
      { index: 1, filaments: [{ id: 1, color: "#FEFEFE", type: "PLA", amsSlot: 1 }] },
      { index: 2, filaments: [{ id: 1, color: "#FF0000", type: "PETG", amsSlot: 2 }] },
    ]);
    mockSendPrinterCommand.mockResolvedValue({ ok: true });

    render(<PrintStartDialog shortCode="ABC123" deviceLabel="Bambu X1C" remotePath="/model.gcode.3mf" onClose={vi.fn()} />);

    await screen.findByText(/plate 1/i);
    fireEvent.click(screen.getByText(/plate 2/i));

    // command belum terkirim di langkah 1
    expect(mockSendPrinterCommand).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /lanjut/i }));
    await screen.findByText(/yakin/i);

    fireEvent.click(screen.getByRole("button", { name: /ya, mulai print/i }));

    await waitFor(() => {
      expect(mockSendPrinterCommand).toHaveBeenCalledWith("ABC123", {
        kind: "startPrint",
        filename: "/model.gcode.3mf",
        plateIndex: 2,
      });
    });
  });

  it("file .gcode polos: skip plate picker, langsung ke konfirmasi", async () => {
    mockSendPrinterCommand.mockResolvedValue({ ok: true });

    render(<PrintStartDialog shortCode="ABC123" deviceLabel="Bambu X1C" remotePath="/test_calibration.gcode" onClose={vi.fn()} />);

    await screen.findByText(/yakin/i);
    expect(mockParseThreemf).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /ya, mulai print/i }));

    await waitFor(() => {
      expect(mockSendPrinterCommand).toHaveBeenCalledWith("ABC123", {
        kind: "startPrint",
        filename: "/test_calibration.gcode",
        plateIndex: 1,
      });
    });
  });
});

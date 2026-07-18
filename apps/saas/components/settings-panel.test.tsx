// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const saveMock = vi.fn(); const resetMock = vi.fn();
vi.mock("@/lib/store/local-settings", async () => {
  const actual = await vi.importActual<any>("@/lib/kalkulator/local-settings");
  return { loadSettings: vi.fn(async () => actual.DEFAULT_LOCAL_SETTINGS), saveSettings: (...a: unknown[]) => saveMock(...a), resetSettings: (...a: unknown[]) => resetMock(...a) };
});
import { SettingsPanel } from "@/components/SettingsPanel";

beforeEach(() => { saveMock.mockReset(); resetMock.mockReset(); });

describe("SettingsPanel", () => {
  it("Free (editable=false) → input disabled + CTA Beli, tak ada tombol Simpan", () => {
    render(<SettingsPanel editable={false} userId="u1" />);
    expect((screen.getByLabelText(/FDM harga modal/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Buka semua ini di Beli/i)).toBeTruthy();
    expect(screen.queryByText("Simpan")).toBeNull();
  });
  it("Beli (editable=true) → Simpan panggil saveSettings", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith("u1", expect.any(Object)));
  });
  it("Beli → Reset panggil resetSettings", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    fireEvent.click(screen.getByText("Reset ke default"));
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith("u1"));
  });
});

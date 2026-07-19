// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Calculator } from "@/components/Calculator";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

vi.mock("@/lib/store/local-settings", () => ({ loadSettings: vi.fn(async () => ({})) }));
import { loadSettings } from "@/lib/store/local-settings";

describe("Calculator", () => {
  it("anonim → blok banding ter-blur (locked-blur hadir) + CTA login", () => {
    const { container } = render(<Calculator authenticated={false} />);
    expect(container.querySelector(".locked-blur")).not.toBeNull();
    expect(screen.getByText(/Login gratis untuk buka/i)).toBeTruthy();
  });
  it("login → tak ada blur", () => {
    const { container } = render(<Calculator authenticated={true} />);
    expect(container.querySelector(".locked-blur")).toBeNull();
  });
  it("menampilkan label margin Standard untuk rekomendasi", () => {
    render(<Calculator authenticated={true} />);
    expect(screen.getByText(/margin Standard/i)).toBeTruthy();
  });
});

describe("Calculator gating settings", () => {
  it("paidCore=false → tidak load settings custom", () => {
    (loadSettings as any).mockClear();
    render(<Calculator authenticated={true} paidCore={false} userId="u1" />);
    expect(loadSettings).not.toHaveBeenCalled();
  });
  it("paidCore=true + userId → load settings", () => {
    (loadSettings as any).mockClear();
    render(<Calculator authenticated={true} paidCore={true} userId="u1" />);
    expect(loadSettings).toHaveBeenCalledWith("u1");
  });
});

describe("Calculator add-on gating", () => {
  it("paidCore=false → blok add-on terkunci", () => {
    render(<Calculator authenticated={true} paidCore={false} userId="u1" />);
    expect(screen.getByText(/🔒 Komponen/)).toBeTruthy();
    expect(screen.queryByText(/Gantungan kew-kew/)).toBeNull();
  });
  it("paidCore=true → chip preset komponen muncul", async () => {
    (loadSettings as any).mockClear();
    (loadSettings as any).mockResolvedValue(DEFAULT_LOCAL_SETTINGS);
    render(<Calculator authenticated={true} paidCore={true} userId="u1" />);
    await waitFor(() => expect(screen.getByText(/Gantungan kew-kew/)).toBeTruthy());
  });
});

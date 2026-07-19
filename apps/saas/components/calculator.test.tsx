// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Calculator } from "@/components/Calculator";

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

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Calculator } from "@/components/Calculator";

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

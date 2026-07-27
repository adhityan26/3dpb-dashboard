// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OfflinePage from "./page";

describe("OfflinePage", () => {
  it("render pesan offline + tombol coba lagi", () => {
    render(<OfflinePage />);
    expect(screen.getByText(/sedang offline/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /coba lagi/i })).toBeTruthy();
  });
});

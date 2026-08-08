// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DownloadAgentSection } from "./DownloadAgentSection";

describe("DownloadAgentSection", () => {
  it("tombol Windows & macOS mengarah ke route download binary masing-masing", () => {
    render(<DownloadAgentSection />);
    expect(screen.getByText("Windows").getAttribute("href")).toBe("/api/agent/binary/win");
    expect(screen.getByText("macOS").getAttribute("href")).toBe("/api/agent/binary/mac");
  });
});

// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DownloadAgentSection } from "./DownloadAgentSection";

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

afterEach(() => {
  setUserAgent(WIN_UA);
});

describe("DownloadAgentSection deteksi OS", () => {
  it("UA Mac -> tombol utama 'Download untuk macOS', toggle nawarin Windows", async () => {
    setUserAgent(MAC_UA);
    render(<DownloadAgentSection />);
    await waitFor(() => expect(screen.getByText(/download untuk macos/i)).toBeTruthy());
    expect(screen.getByText(/download untuk macos/i).closest("a")?.getAttribute("href")).toBe("/api/agent/binary/mac");
    expect(screen.getByText(/pakai windows\?/i)).toBeTruthy();
  });

  it("UA Windows -> tombol utama 'Download untuk Windows', toggle nawarin macOS", async () => {
    setUserAgent(WIN_UA);
    render(<DownloadAgentSection />);
    await waitFor(() => expect(screen.getByText(/download untuk windows/i)).toBeTruthy());
    expect(screen.getByText(/download untuk windows/i).closest("a")?.getAttribute("href")).toBe("/api/agent/binary/win");
    expect(screen.getByText(/pakai macos\?/i)).toBeTruthy();
  });

  it("OS lain (collapsible) tersembunyi default; klik toggle -> muncul link-nya; klik lagi -> sembunyi lagi", async () => {
    setUserAgent(WIN_UA);
    render(<DownloadAgentSection />);
    await waitFor(() => expect(screen.getByText(/pakai macos\?/i)).toBeTruthy());
    expect(screen.queryByText("macOS")).toBeNull();

    fireEvent.click(screen.getByText(/pakai macos\?/i));
    await waitFor(() => expect(screen.getByText("macOS").closest("a")?.getAttribute("href")).toBe("/api/agent/binary/mac"));

    fireEvent.click(screen.getByText(/sembunyikan/i));
    expect(screen.queryByText("macOS")).toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { UpdateBanner } from "./UpdateBanner";

const addEventListener = vi.fn();
const register = vi.fn();
const messageSkipWaiting = vi.fn();

vi.mock("@serwist/window", () => ({
  Serwist: vi.fn().mockImplementation(() => ({
    addEventListener,
    register,
    messageSkipWaiting,
  })),
}));

beforeEach(() => {
  addEventListener.mockClear();
  register.mockClear();
  messageSkipWaiting.mockClear();
  Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
});

describe("UpdateBanner", () => {
  it("tanpa dukungan service worker → tak crash, tak register, banner tak tampil", async () => {
    // @ts-expect-error -- sengaja hapus dukungan utk test guard-clause
    delete navigator.serviceWorker;
    render(<UpdateBanner />);
    await new Promise((r) => setTimeout(r, 0));
    expect(register).not.toHaveBeenCalled();
    expect(screen.queryByText(/Update tersedia/)).toBeNull();
  });

  it("ada dukungan, belum ada update → register dipanggil, banner belum tampil", async () => {
    render(<UpdateBanner />);
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(screen.queryByText(/Update tersedia/)).toBeNull();
  });

  it("event 'waiting' ter-trigger → banner tampil, klik Refresh → messageSkipWaiting dipanggil", async () => {
    render(<UpdateBanner />);
    await waitFor(() => expect(addEventListener).toHaveBeenCalledWith("waiting", expect.any(Function)));
    const waitingHandler = addEventListener.mock.calls.find(([event]) => event === "waiting")![1];
    waitingHandler();
    await waitFor(() => expect(screen.getByText(/Update tersedia/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(messageSkipWaiting).toHaveBeenCalled();
  });
});

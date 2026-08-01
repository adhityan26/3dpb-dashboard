import { describe, it, expect, vi } from "vitest";
import { attachHideOnClose } from "./window-lifecycle";

function fakeWindow() {
  const handlers: Record<string, (event: { preventDefault: () => void }) => void> = {};
  return {
    on: vi.fn((event: string, cb: (event: { preventDefault: () => void }) => void) => {
      handlers[event] = cb;
    }),
    hide: vi.fn(),
    emitClose: () => {
      const event = { preventDefault: vi.fn() };
      handlers["close"](event);
      return event;
    },
  };
}

describe("attachHideOnClose", () => {
  it("shouldQuit() masih false -> preventDefault() + hide(), window TIDAK benar-benar close", () => {
    const win = fakeWindow();
    attachHideOnClose(win as any, () => false);

    const event = win.emitClose();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();
  });

  it("shouldQuit() true (user pilih Keluar di tray / Cmd+Q) -> TIDAK preventDefault, window benar-benar close", () => {
    const win = fakeWindow();
    attachHideOnClose(win as any, () => true);

    const event = win.emitClose();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });
});

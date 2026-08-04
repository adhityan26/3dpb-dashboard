import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

// Semua nilai yang dibutuhkan `vi.mock("electron", ...)` HARUS lewat vi.hoisted() --
// vi.mock di-hoist ke paling atas file, di atas class/const biasa (beda dari vi.hoisted()
// yang memang didesain buat kasus ini).
const { createFromPath, FakeTray, state } = vi.hoisted(() => {
  const state: { template: any[]; clickHandler: (() => void) | null } = { template: [], clickHandler: null };
  class FakeTray {
    icon: unknown;
    tooltip = "";
    contextMenu: unknown;
    constructor(icon: unknown) {
      this.icon = icon;
    }
    setToolTip(t: string) {
      this.tooltip = t;
    }
    setContextMenu(m: unknown) {
      this.contextMenu = m;
    }
    on(event: string, cb: () => void) {
      if (event === "click") state.clickHandler = cb;
    }
  }
  return { createFromPath: vi.fn((p: string) => ({ __iconPath: p })), FakeTray, state };
});

vi.mock("electron", () => ({
  app: { getAppPath: () => "/app-root" },
  nativeImage: { createFromPath },
  Menu: {
    buildFromTemplate: vi.fn((template: any[]) => {
      state.template = template;
      return { __menu: true };
    }),
  },
  Tray: FakeTray,
}));

import { createTray } from "./tray";

function fakeWindow(overrides: Partial<{ isVisible: () => boolean }> = {}) {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    isVisible: overrides.isVisible ?? vi.fn(() => true),
  };
}

beforeEach(() => {
  state.template = [];
  state.clickHandler = null;
  createFromPath.mockClear();
});

describe("createTray", () => {
  it("ikon dimuat dari resources/tray-icon.png lewat app.getAppPath() (bukan pipeline renderer)", () => {
    createTray(() => null, vi.fn());
    expect(createFromPath).toHaveBeenCalledWith(path.join("/app-root", "resources", "tray-icon.png"));
  });

  it("context menu berisi 'Buka Slizebiz Agent' dan 'Keluar'", () => {
    createTray(() => null, vi.fn());
    const labels = state.template.map((item) => item.label ?? item.type);
    expect(labels).toEqual(["Buka Slizebiz Agent", "separator", "Keluar"]);
  });

  it("klik 'Buka Slizebiz Agent' -> show() + focus() window dari getWindow()", () => {
    const win = fakeWindow();
    createTray(() => win as any, vi.fn());
    const openItem = state.template.find((item) => item.label === "Buka Slizebiz Agent");

    openItem.click();

    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it("klik 'Buka Slizebiz Agent' saat getWindow() balikin null (window sudah destroyed) -> tidak crash", () => {
    createTray(() => null, vi.fn());
    const openItem = state.template.find((item) => item.label === "Buka Slizebiz Agent");

    expect(() => openItem.click()).not.toThrow();
  });

  it("klik 'Keluar' -> panggil onQuit", () => {
    const onQuit = vi.fn();
    createTray(() => null, onQuit);
    const quitItem = state.template.find((item) => item.label === "Keluar");

    quitItem.click();

    expect(onQuit).toHaveBeenCalled();
  });

  it("klik ikon tray saat window kelihatan -> hide()", () => {
    const win = fakeWindow({ isVisible: () => true });
    createTray(() => win as any, vi.fn());

    state.clickHandler?.();

    expect(win.hide).toHaveBeenCalled();
    expect(win.show).not.toHaveBeenCalled();
  });

  it("klik ikon tray saat window tersembunyi -> show() + focus()", () => {
    const win = fakeWindow({ isVisible: () => false });
    createTray(() => win as any, vi.fn());

    state.clickHandler?.();

    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it("klik ikon tray saat getWindow() balikin null -> tidak crash", () => {
    createTray(() => null, vi.fn());
    expect(() => state.clickHandler?.()).not.toThrow();
  });
});

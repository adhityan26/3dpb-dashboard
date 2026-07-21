// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminTabs, type AdminTab } from "./AdminTabs";

const tabs: AdminTab[] = [
  { key: "setting", label: "Setting", node: <p>isi setting</p> },
  { key: "pembayaran", label: "Pembayaran", node: <p>isi pembayaran</p> },
  { key: "user", label: "User aktif", node: <p>isi user</p> },
];

beforeEach(() => { window.location.hash = ""; });

describe("AdminTabs", () => {
  it("default tab pertama", () => {
    render(<AdminTabs tabs={tabs} />);
    expect(screen.getByText("isi setting")).toBeTruthy();
  });

  it("hash #pembayaran → tab Pembayaran aktif (link antar-tab jalan)", () => {
    window.location.hash = "#pembayaran";
    render(<AdminTabs tabs={tabs} />);
    expect(screen.getByText("isi pembayaran")).toBeTruthy();
  });

  it("hash berubah saat halaman terbuka → tab ikut pindah", () => {
    render(<AdminTabs tabs={tabs} />);
    expect(screen.getByText("isi setting")).toBeTruthy();
    window.location.hash = "#pembayaran";
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.getByText("isi pembayaran")).toBeTruthy();
  });

  it("hash tak dikenal → tetap tab pertama", () => {
    window.location.hash = "#ngawur";
    render(<AdminTabs tabs={tabs} />);
    expect(screen.getByText("isi setting")).toBeTruthy();
  });

  it("klik tab → konten ganti", () => {
    render(<AdminTabs tabs={tabs} />);
    fireEvent.click(screen.getByText("User aktif"));
    expect(screen.getByText("isi user")).toBeTruthy();
  });
});

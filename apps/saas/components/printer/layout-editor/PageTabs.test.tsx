// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageTabs } from "./PageTabs";

const twoPages = [
  { id: "hal-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] },
  { id: "hal-2", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] },
];

describe("PageTabs", () => {
  it("klik tab memanggil onSelect dengan index yang benar", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={onSelect}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onRename={() => {}}
      />
    );
    // userEvent.click() memancarkan pointer events yang lebih realistis (pointerdown → pointermove
    // dengan offset kecil → click → pointerup), yang trigger PointerSensor dnd-kit. Ini berbeda
    // dari fireEvent.click() yang hanya emit MouseEvent bare tanpa pointerdown/pointermove sequence.
    // Tanpa activationConstraint: distance:4, sensor interpret offset kecil sebagai drag dan
    // swallow onClick; dengan constraint:4, offset 2px diabaikan, onClick tetap reach handler.
    await user.click(screen.getByText("hal-2"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("klik ikon pensil masuk mode edit, Enter commit rename via onRename", () => {
    const onRename = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByTitle("Ganti nama halaman hal-1"));
    const input = screen.getByDisplayValue("hal-1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "rak-kiri" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith(0, "rak-kiri");
  });

  it("commit id kosong -> tidak memanggil onRename, kembali ke tampilan normal", () => {
    const onRename = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByTitle("Ganti nama halaman hal-1"));
    const input = screen.getByDisplayValue("hal-1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("hal-1")).toBeTruthy(); // balik ke tampilan normal, id lama tetap
  });

  it("commit id duplikat via Enter -> tidak memanggil onRename, pesan error muncul, tetap mode edit", () => {
    const onRename = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByTitle("Ganti nama halaman hal-1"));
    const input = screen.getByDisplayValue("hal-1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hal-2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Nama halaman sudah dipakai")).toBeTruthy();
    expect(screen.getByDisplayValue("hal-2")).toBeTruthy(); // masih di mode edit, input tetap ada
  });

  it("Escape membatalkan edit tanpa memanggil onRename", () => {
    const onRename = vi.fn();
    render(
      <PageTabs
        pages={twoPages}
        activeIndex={0}
        onSelect={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={() => {}}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByTitle("Ganti nama halaman hal-1"));
    const input = screen.getByDisplayValue("hal-1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "berubah-tapi-batal" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("hal-1")).toBeTruthy();
  });
});

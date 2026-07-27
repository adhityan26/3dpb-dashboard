import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("manifest.json", () => {
  it("punya field wajib PWA", () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, "manifest.json"), "utf-8"));
    expect(manifest.name).toBe("Slizebiz");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons).toHaveLength(3);
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual([
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable-512.png",
    ]);
    expect(manifest.icons.find((i: { purpose?: string }) => i.purpose === "maskable")).toBeTruthy();
  });
});

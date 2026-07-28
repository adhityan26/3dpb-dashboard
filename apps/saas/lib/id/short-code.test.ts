import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { device: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { generateUniqueShortCode, BASE36_ALPHABET } from "./short-code";

beforeEach(() => vi.clearAllMocks());

describe("generateUniqueShortCode", () => {
  it("hasilnya 10 karakter, semua dari alfabet base36 lowercase", () => {
    (prisma.device.findUnique as any).mockResolvedValue(null);
    return generateUniqueShortCode().then((code) => {
      expect(code).toHaveLength(10);
      expect([...code].every((c) => BASE36_ALPHABET.includes(c))).toBe(true);
    });
  });

  it("retry kalau collision (findUnique nemu row), berhenti pas dapat yang unik", async () => {
    (prisma.device.findUnique as any)
      .mockResolvedValueOnce({ id: "existing-1" }) // collision pertama
      .mockResolvedValueOnce(null); // kedua unik
    const code = await generateUniqueShortCode();
    expect(code).toHaveLength(10);
    expect(prisma.device.findUnique).toHaveBeenCalledTimes(2);
  });

  it("nyerah setelah 3x collision berturut-turut (throw, bukan infinite loop)", async () => {
    (prisma.device.findUnique as any).mockResolvedValue({ id: "existing" });
    await expect(generateUniqueShortCode()).rejects.toThrow(/gagal generate shortCode/);
    expect(prisma.device.findUnique).toHaveBeenCalledTimes(3);
  });
});

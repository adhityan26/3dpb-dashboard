import { describe, it, expect } from "vitest";
import { truncateSlugSafe } from "../backfill-printer-slug";

describe("truncateSlugSafe", () => {
  it("slug pendek tidak berubah", () => {
    expect(truncateSlugSafe("mars", 23)).toBe("mars");
  });

  it("slug kepanjangan dipotong ke maxLen", () => {
    const long = "bambu-lab-x1-carbon-rack-2"; // 26 char
    const result = truncateSlugSafe(long, 23);
    expect(result.length).toBeLessThanOrEqual(23);
  });

  it("slug yang dipotong tetap unik lewat suffix hash pendek kalau ambigu", () => {
    const a = truncateSlugSafe("bambu-lab-x1-carbon-rack-alpha", 23);
    const b = truncateSlugSafe("bambu-lab-x1-carbon-rack-beta", 23);
    expect(a).not.toBe(b);
  });
});

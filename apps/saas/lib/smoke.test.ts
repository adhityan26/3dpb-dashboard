import { describe, it, expect } from "vitest";
import { MARGIN_TIER_LABEL } from "@3pb/kalkulator-core";

describe("smoke", () => {
  it("dapat resolve @3pb/kalkulator-core", () => {
    expect(MARGIN_TIER_LABEL.B).toBe("Standard");
  });
});

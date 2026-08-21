import { describe, it, expect } from "vitest";
import { capabilities, can, requirePlan, PlanError } from "@/lib/entitlement";

describe("capabilities", () => {
  it("Free (no lifetime, sub NONE) → tak ada kapabilitas", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "NONE", subExpiresAt: null });
    expect(caps).toEqual({ paidCore: false, cloud: false });
  });

  it("lifetimeOwned → paidCore true, cloud false", () => {
    const caps = capabilities({ lifetimeOwned: true, subStatus: "NONE", subExpiresAt: null });
    expect(caps).toEqual({ paidCore: true, cloud: false });
  });

  it("subStatus ACTIVE → paidCore & cloud true", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: null });
    expect(caps).toEqual({ paidCore: true, cloud: true });
  });

  it("subStatus EXPIRED → tak ada kapabilitas", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "EXPIRED", subExpiresAt: null });
    expect(caps).toEqual({ paidCore: false, cloud: false });
  });
});

describe("capabilities — subscription expiry", () => {
  const NOW = new Date("2026-08-21T00:00:00Z");
  const FUTURE = new Date("2026-09-01T00:00:00Z");
  const PAST = new Date("2026-08-01T00:00:00Z");

  it("subStatus ACTIVE with subExpiresAt in the future -> cloud and paidCore true", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: FUTURE }, NOW);
    expect(caps).toEqual({ paidCore: true, cloud: true });
  });

  it("subStatus ACTIVE with subExpiresAt in the past -> cloud and paidCore false (unless lifetimeOwned)", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: PAST }, NOW);
    expect(caps).toEqual({ paidCore: false, cloud: false });
  });

  it("lapsed subscription does not affect paidCore for a separate lifetimeOwned user", () => {
    const caps = capabilities({ lifetimeOwned: true, subStatus: "ACTIVE", subExpiresAt: PAST }, NOW);
    expect(caps).toEqual({ paidCore: true, cloud: false });
  });

  it("subStatus ACTIVE with subExpiresAt null is treated as active (defensive default)", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: null }, NOW);
    expect(caps).toEqual({ paidCore: true, cloud: true });
  });

  it("defaults now to the real current time when not passed", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: new Date(Date.now() + 60_000) });
    expect(caps.cloud).toBe(true);
  });
});

describe("can", () => {
  it("delegasi ke capabilities", () => {
    expect(can({ lifetimeOwned: true, subStatus: "NONE", subExpiresAt: null }, "paidCore")).toBe(true);
    expect(can({ lifetimeOwned: true, subStatus: "NONE", subExpiresAt: null }, "cloud")).toBe(false);
  });
});

describe("requirePlan", () => {
  it("lolos bila punya kapabilitas", () => {
    expect(() =>
      requirePlan({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: null }, "cloud")
    ).not.toThrow();
  });

  it("throw PlanError (status 403) bila tak punya", () => {
    try {
      requirePlan({ lifetimeOwned: false, subStatus: "NONE", subExpiresAt: null }, "paidCore");
      throw new Error("seharusnya throw");
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).status).toBe(403);
    }
  });
});

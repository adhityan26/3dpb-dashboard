import { describe, it, expect } from "vitest";
import { capabilities, can, requirePlan, PlanError } from "@/lib/entitlement";

describe("capabilities", () => {
  it("Free (no lifetime, sub NONE) → tak ada kapabilitas", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "NONE" });
    expect(caps).toEqual({ paidCore: false, cloud: false });
  });

  it("lifetimeOwned → paidCore true, cloud false", () => {
    const caps = capabilities({ lifetimeOwned: true, subStatus: "NONE" });
    expect(caps).toEqual({ paidCore: true, cloud: false });
  });

  it("subStatus ACTIVE → paidCore & cloud true", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE" });
    expect(caps).toEqual({ paidCore: true, cloud: true });
  });

  it("subStatus EXPIRED → tak ada kapabilitas", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "EXPIRED" });
    expect(caps).toEqual({ paidCore: false, cloud: false });
  });
});

describe("can", () => {
  it("delegasi ke capabilities", () => {
    expect(can({ lifetimeOwned: true, subStatus: "NONE" }, "paidCore")).toBe(true);
    expect(can({ lifetimeOwned: true, subStatus: "NONE" }, "cloud")).toBe(false);
  });
});

describe("requirePlan", () => {
  it("lolos bila punya kapabilitas", () => {
    expect(() => requirePlan({ lifetimeOwned: false, subStatus: "ACTIVE" }, "cloud")).not.toThrow();
  });

  it("throw PlanError (status 403) bila tak punya", () => {
    try {
      requirePlan({ lifetimeOwned: false, subStatus: "NONE" }, "paidCore");
      throw new Error("seharusnya throw");
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).status).toBe(403);
    }
  });
});

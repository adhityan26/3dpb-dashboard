import { describe, it, expect } from "vitest";
import { validateWaitlist } from "./validate";

describe("validateWaitlist", () => {
  it("email valid + interest beli → ok", () => {
    expect(validateWaitlist({ email: "A@B.com ", interest: "beli" })).toEqual({ ok: true, email: "a@b.com", interest: "beli" });
  });
  it("email invalid → error", () => {
    expect(validateWaitlist({ email: "bukan-email", interest: "beli" })).toEqual({ ok: false, error: "email tidak valid" });
  });
  it("interest invalid → error", () => {
    expect(validateWaitlist({ email: "a@b.com", interest: "xxx" })).toEqual({ ok: false, error: "minat tidak valid" });
  });
  it("body kosong → error", () => {
    expect(validateWaitlist(null)).toEqual({ ok: false, error: "email tidak valid" });
  });
  it("email terlalu panjang (255+ char) → error", () => {
    const email = "a".repeat(250) + "@b.com";
    expect(validateWaitlist({ email, interest: "beli" })).toEqual({ ok: false, error: "email tidak valid" });
  });
});

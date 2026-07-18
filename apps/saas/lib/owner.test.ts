import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isOwner } from "@/lib/owner";

describe("isOwner", () => {
  const orig = process.env.OWNER_EMAILS;
  beforeEach(() => { process.env.OWNER_EMAILS = "Owner@Slizebiz.com, admin@slizebiz.com"; });
  afterEach(() => { process.env.OWNER_EMAILS = orig; });

  it("cocok case-insensitive + trim", () => {
    expect(isOwner("owner@slizebiz.com")).toBe(true);
    expect(isOwner("ADMIN@SLIZEBIZ.COM")).toBe(true);
  });
  it("tolak email bukan owner", () => {
    expect(isOwner("user@gmail.com")).toBe(false);
  });
  it("tolak null/undefined/empty", () => {
    expect(isOwner(null)).toBe(false);
    expect(isOwner(undefined)).toBe(false);
    expect(isOwner("")).toBe(false);
  });
  it("OWNER_EMAILS kosong → tak ada owner", () => {
    process.env.OWNER_EMAILS = "";
    expect(isOwner("owner@slizebiz.com")).toBe(false);
  });
});

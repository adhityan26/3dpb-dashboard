// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getRincianPref, setRincianPref } from "./display-prefs";

beforeEach(() => window.localStorage.clear());

describe("display-prefs rincian", () => {
  it("default false", () => expect(getRincianPref()).toBe(false));
  it("set true → get true", () => {
    setRincianPref(true);
    expect(getRincianPref()).toBe(true);
  });
  it("set false → get false", () => {
    setRincianPref(true);
    setRincianPref(false);
    expect(getRincianPref()).toBe(false);
  });
});

import { describe, it, expect } from "vitest";

describe("getBrokerPin/setBrokerPin", () => {
  it("default null, tersimpan+terbaca kembali persis seperti setBrokerPort/getBrokerPort", async () => {
    const { setBrokerPin, getBrokerPin } = await import("./app-state");
    expect(getBrokerPin()).toBeNull();
    setBrokerPin("0042");
    expect(getBrokerPin()).toBe("0042");
    setBrokerPin(null);
    expect(getBrokerPin()).toBeNull();
  });
});

describe("getUpdateAvailable/setUpdateAvailable", () => {
  it("default false, tersimpan+terbaca kembali persis seperti setBrokerPin/getBrokerPin", async () => {
    const { setUpdateAvailable, getUpdateAvailable } = await import("./app-state");
    expect(getUpdateAvailable()).toBe(false);
    setUpdateAvailable(true);
    expect(getUpdateAvailable()).toBe(true);
    setUpdateAvailable(false);
    expect(getUpdateAvailable()).toBe(false);
  });
});

describe("getCredentialStoreDegraded/setCredentialStoreDegraded", () => {
  it("default false, tersimpan+terbaca kembali persis seperti flag lain di file ini", async () => {
    const { setCredentialStoreDegraded, getCredentialStoreDegraded } = await import("./app-state");
    expect(getCredentialStoreDegraded()).toBe(false);
    setCredentialStoreDegraded(true);
    expect(getCredentialStoreDegraded()).toBe(true);
    setCredentialStoreDegraded(false);
    expect(getCredentialStoreDegraded()).toBe(false);
  });
});

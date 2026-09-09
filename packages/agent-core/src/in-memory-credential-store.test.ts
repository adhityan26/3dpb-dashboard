import { describe, it, expect } from "vitest";
import { InMemoryCredentialStore } from "./in-memory-credential-store";

describe("InMemoryCredentialStore", () => {
  it("load() sebelum save() apa pun -> status empty", async () => {
    const store = new InMemoryCredentialStore();
    expect(await store.load()).toEqual({ status: "empty" });
  });

  it("save() lalu load() -> balikin blob yang sama, status ok", async () => {
    const store = new InMemoryCredentialStore();
    await store.save({ agentToken: "tok", devices: {} });
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "tok", devices: {} } });
  });

  it("isEncryptionAvailable() selalu true (fixture test, bukan simulasi degraded)", () => {
    const store = new InMemoryCredentialStore();
    expect(store.isEncryptionAvailable()).toBe(true);
  });

  it("bisa di-seed langsung lewat constructor, buat setup test yang butuh state awal", async () => {
    const store = new InMemoryCredentialStore({ agentToken: "seeded", devices: {}, brokerPin: "1234" });
    expect(await store.load()).toEqual({ status: "ok", blob: { agentToken: "seeded", devices: {}, brokerPin: "1234" } });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { InMemoryCredentialStore, ensureApiToken } from "@3pb/agent-core";
import { createAuthHook } from "./auth";

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("createAuthHook", () => {
  it("request tanpa header Authorization -> 401", async () => {
    const store = new InMemoryCredentialStore();
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, makeLogger()));
    app.get("/protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
  });

  it("token benar -> lolos, handler jalan", async () => {
    const store = new InMemoryCredentialStore();
    const logger = makeLogger();
    const token = await ensureApiToken(store, logger);
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, logger));
    app.get("/protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("token salah -> 401", async () => {
    const store = new InMemoryCredentialStore();
    const logger = makeLogger();
    await ensureApiToken(store, logger);
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, logger));
    app.get("/protected", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong-token" } });
    expect(res.statusCode).toBe(401);
  });

  it("5 kali token salah dari alamat yang sama -> attempt ke-6 locked (401 juga, tapi rate-limited)", async () => {
    const store = new InMemoryCredentialStore();
    const logger = makeLogger();
    await ensureApiToken(store, logger);
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, logger));
    app.get("/protected", async () => ({ ok: true }));
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong", "x-forwarded-for": "9.9.9.9" } });
    }
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong", "x-forwarded-for": "9.9.9.9" } });
    expect(res.statusCode).toBe(401);
    // Bedakan locked dari sekadar salah lewat body, kalau createAuthHook menyertakan reason:
    expect(res.json()).toMatchObject({ error: expect.stringContaining("lock") });
  });

  it("loopback (127.0.0.1) TETAP kena rate limit -- trustLoopback:false, beda dari broker MQTT", async () => {
    const store = new InMemoryCredentialStore();
    const logger = makeLogger();
    await ensureApiToken(store, logger);
    const app = Fastify();
    app.addHook("onRequest", createAuthHook(store, logger));
    app.get("/protected", async () => ({ ok: true }));
    // Fastify inject default pakai alamat konsisten -- pastikan tidak diistimewakan
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong" } });
    }
    const res = await app.inject({ method: "GET", url: "/protected", headers: { authorization: "Bearer wrong" } });
    expect(res.json()).toMatchObject({ error: expect.stringContaining("lock") });
  });
});

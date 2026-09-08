// packages/agent-core/src/config.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateConfig } from "./config";
import type { PathProvider } from "./interfaces";

describe("loadOrCreateConfig", () => {
  let dir: string;
  let pathProvider: PathProvider;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-core-config-"));
    pathProvider = { userDataDir: () => dir };
  });

  it("config.json belum ada, env var kosong -> tulis default, balikin default", async () => {
    const config = await loadOrCreateConfig(pathProvider, undefined);
    expect(config.saasBaseUrl).toBe("https://app.slizebiz.com");
    const written = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    expect(written.saasBaseUrl).toBe("https://app.slizebiz.com");
  });

  it("config.json belum ada, env var diisi -> seed dari env var, tulis ke file", async () => {
    const config = await loadOrCreateConfig(pathProvider, "http://192.168.88.113:3300");
    expect(config.saasBaseUrl).toBe("http://192.168.88.113:3300");
    const written = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    expect(written.saasBaseUrl).toBe("http://192.168.88.113:3300");
  });

  it("config.json SUDAH ADA -> env var TIDAK PERNAH menimpa nilai yang tersimpan", async () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ saasBaseUrl: "https://existing.example.com" }));
    await loadOrCreateConfig(pathProvider, "http://should-not-be-used:3300");
    // File yang SUDAH ADA tidak pernah ditulis ulang oleh env var -- env cuma jadi SEED saat
    // file belum ada sama sekali. (Nilai kembalian untuk pemanggilan ini sendiri tetap ikut
    // precedence env>config, diuji terpisah di test berikutnya.)
    const written = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    expect(written.saasBaseUrl).toBe("https://existing.example.com");
  });

  it("env var runtime menang di ATAS config yang sudah ada -- dibaca ulang tiap panggilan, precedence env>config>default", async () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ saasBaseUrl: "https://existing.example.com" }));
    const config = await loadOrCreateConfig(pathProvider, "http://env-override:3300");
    // Env var menang MESKI config sudah ada -- beda dari "seed cuma sekali" (test sebelumnya
    // menguji SEED tidak menimpa FILE; test ini menguji env var yang di-BACA SAAT INI tetap
    // menang di atas nilai file untuk resolusi runtime, sesuai precedence Global Constraints.
    expect(config.saasBaseUrl).toBe("http://env-override:3300");
  });

  it("field saasBaseUrl eksplisit string kosong di config -> tetap dianggap invalid/kosong (bukan diam-diam fallback default)", async () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ saasBaseUrl: "" }));
    const config = await loadOrCreateConfig(pathProvider, undefined);
    expect(config.saasBaseUrl).toBe("");
  });
});

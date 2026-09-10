import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodePathProvider, NodeLogAdapter, NodeLogFileProvider, getNodeBuildInfo } from "./platform-node";

describe("NodePathProvider", () => {
  it("userDataDir() balikin nilai dari env var AGENT_DATA_DIR kalau di-set", () => {
    const original = process.env.AGENT_DATA_DIR;
    process.env.AGENT_DATA_DIR = "/custom/path";
    expect(new NodePathProvider().userDataDir()).toBe("/custom/path");
    if (original === undefined) delete process.env.AGENT_DATA_DIR;
    else process.env.AGENT_DATA_DIR = original;
  });

  it("userDataDir() fallback ke /var/lib/slizebiz-agent kalau AGENT_DATA_DIR tak di-set", () => {
    const original = process.env.AGENT_DATA_DIR;
    delete process.env.AGENT_DATA_DIR;
    expect(new NodePathProvider().userDataDir()).toBe("/var/lib/slizebiz-agent");
    if (original !== undefined) process.env.AGENT_DATA_DIR = original;
  });
});

describe("NodeLogAdapter", () => {
  it("info/warn/error delegasi ke console yang sesuai (systemd menangkap stdout/stderr)", () => {
    const adapter = new NodeLogAdapter();
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    adapter.info("hello", 1);
    adapter.error("bad", { detail: 1 });
    expect(infoSpy).toHaveBeenCalledWith("hello", 1);
    expect(errorSpy).toHaveBeenCalledWith("bad", { detail: 1 });
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("NodeLogFileProvider", () => {
  it("getLogFilePath() selalu null -- journald-only, tak ada file log terpisah (lihat spec)", () => {
    expect(new NodeLogFileProvider().getLogFilePath()).toBeNull();
  });
});

describe("getNodeBuildInfo", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-headless-buildinfo-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("baca build-info.json kalau ada", () => {
    writeFileSync(join(dir, "build-info.json"), JSON.stringify({ version: "1.2.3", commitHash: "abc1234" }));
    expect(getNodeBuildInfo(dir)).toEqual({ version: "1.2.3", commitHash: "abc1234" });
  });

  it("fallback ke 0.0.0/nogit kalau build-info.json tak ada (dev run tanpa build step)", () => {
    expect(getNodeBuildInfo(dir)).toEqual({ version: "0.0.0", commitHash: "nogit" });
  });
});

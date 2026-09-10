import fs from "node:fs";
import path from "node:path";
import type { PathProvider, Logger, LogFileProvider, BuildInfo } from "@3pb/agent-core";

const DEFAULT_DATA_DIR = "/var/lib/slizebiz-agent";

export class NodePathProvider implements PathProvider {
  userDataDir(): string {
    return process.env.AGENT_DATA_DIR || DEFAULT_DATA_DIR;
  }
}

export class NodeLogAdapter implements Logger {
  info(...args: unknown[]): void {
    console.log(...args);
  }
  warn(...args: unknown[]): void {
    console.warn(...args);
  }
  error(...args: unknown[]): void {
    console.error(...args);
  }
}

// journald-only (lihat spec §Logging) -- systemd menangkap stdout/stderr proses secara
// keseluruhan (termasuk console.error dari kode yang tidak lewat Logger, mis. Engine/Reporter
// di printer-monitor-core), jadi TIDAK perlu trik Object.assign(console, ...) seperti Electron.
// sendLogs() balikin read_failed apa adanya untuk v1 -- dukungan journalctl adalah perbaikan lanjutan.
export class NodeLogFileProvider implements LogFileProvider {
  getLogFilePath(): string | null {
    return null;
  }
}

export function getNodeBuildInfo(dirForBuildInfoJson: string = path.dirname(new URL(import.meta.url).pathname)): BuildInfo {
  try {
    const raw = fs.readFileSync(path.join(dirForBuildInfoJson, "build-info.json"), "utf8");
    return JSON.parse(raw) as BuildInfo;
  } catch {
    return { version: "0.0.0", commitHash: "nogit" };
  }
}

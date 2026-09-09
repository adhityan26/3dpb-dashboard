import { Bonjour } from "bonjour-service";

export interface DiscoveredMoonrakerPrinter {
  ip: string;
  name: string;
}

function isIPv4(addr: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(addr);
}

export function scanMoonraker(durationMs = 5_000): Promise<DiscoveredMoonrakerPrinter[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const found: DiscoveredMoonrakerPrinter[] = [];
    const browser = bonjour.find({ type: "moonraker", protocol: "tcp" });
    browser.on("up", (service: { name: string; addresses?: string[] }) => {
      const ip = (service.addresses ?? []).find(isIPv4);
      if (!ip) return;
      found.push({ ip, name: service.name });
    });
    setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      resolve(found);
    }, durationMs);
  });
}

// Import JSON langsung (bukan andalkan HmsLookup default loading via import.meta.url,
// yang rawan patah kalau di-bundle Electron/asar — lihat Global Constraints plan ini).
import hmsCodes from "../../../../packages/printer-monitor-core/src/hms-codes.json";

export const hmsTable: Record<string, string> = hmsCodes as Record<string, string>;

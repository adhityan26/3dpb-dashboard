import type { DiscordOption } from "../types"
import { getOption } from "../format"
import { listSpools } from "@/lib/filamen/spool-service"

export async function handleStokFilament(options: DiscordOption[] | undefined): Promise<string> {
  const brand = String(getOption(options, "brand") ?? "").trim().toLowerCase()
  const { spools } = await listSpools()
  const filtered = brand ? spools.filter(s => s.brand.toLowerCase().includes(brand)) : spools
  if (filtered.length === 0) return brand ? `Tidak ada spool brand \`${brand}\`.` : "Belum ada spool."

  // Group by brand+material, count non-empty
  const groups = new Map<string, number>()
  for (const s of filtered) {
    if (s.status === "empty") continue
    const key = `${s.brand} ${s.material}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const lines = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => `• ${k}: ${n} spool`)
  return `🧵 Stok filament${brand ? ` (${brand})` : ""}:\n${lines.join("\n") || "semua kosong"}`
}

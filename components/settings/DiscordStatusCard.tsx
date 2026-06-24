"use client"

import { useDiscordStatus } from "@/lib/hooks/use-settings"

export function DiscordStatusCard() {
  const { data, isLoading } = useDiscordStatus()

  return (
    <div className="rounded-[16px] p-5 space-y-3 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">🤖 Discord Bot</div>
        <div className="text-xs mt-0.5 g-t4">Status koneksi & command terdaftar (read-only)</div>
      </div>

      {isLoading ? (
        <div className="text-sm g-t4">Memuat...</div>
      ) : !data ? (
        <div className="text-sm g-t4">Gagal memuat status.</div>
      ) : (
        <div className="space-y-2 text-sm">
          <div>
            Status:{" "}
            {data.configured
              ? <span style={{ color: "#34d399" }}>✓ Terkonfigurasi</span>
              : <span style={{ color: "#f87171" }}>✗ Belum (set env DISCORD_*)</span>}
          </div>
          <div className="g-t4 text-xs">
            Interactions Endpoint URL (paste ke Discord Developer Portal):
            <div className="font-mono text-[11px] mt-1 p-2 rounded-[8px]" style={{ background: "var(--g-inner)" }}>
              {data.endpointUrl}
            </div>
          </div>
          {data.guildId && <div className="g-t4 text-xs">Guild ID: <span className="font-mono">{data.guildId}</span></div>}
          <div className="g-t4 text-xs">
            Command terdaftar:{" "}
            {data.commands == null
              ? "—"
              : data.commands.length === 0
                ? "belum ada — jalankan `npm run discord:register`"
                : data.commands.map(c => `/${c.name}`).join(", ")}
          </div>
        </div>
      )}
    </div>
  )
}

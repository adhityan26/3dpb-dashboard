/** Server component (statik) -- tak ada state, cuma 2 link download. Sengaja "latest only",
 * tak ada histori versi/pilihan admin (lihat percakapan brainstorm) -- admin overwrite manual
 * key R2 tiap ada build baru. */
export function DownloadAgentSection() {
  return (
    <div className="g-card p-4">
      <h3 className="text-[14px] font-semibold mb-2">Download Slizebiz Agent</h3>
      <p className="text-[12px] g-t4 mb-3">
        Aplikasi desktop buat pasangkan &amp; monitor printer -- perlu token di atas buat aktivasi.
      </p>
      <div className="flex gap-2">
        <a
          href="/api/agent/binary/win"
          className="text-[12px] px-3 py-1.5 rounded-md"
          style={{ background: "var(--g-accent)", color: "#fff" }}
        >
          Windows
        </a>
        <a
          href="/api/agent/binary/mac"
          className="text-[12px] px-3 py-1.5 rounded-md g-btn-ghost"
        >
          macOS
        </a>
      </div>
    </div>
  );
}

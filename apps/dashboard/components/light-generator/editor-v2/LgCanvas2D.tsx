"use client"
export function LgCanvas2D({ pngUrl, loading }: { pngUrl: string | null; loading: boolean }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-[#16181d]">
      {pngUrl
        ? <img src={pngUrl} alt="Shadow preview" className={`h-full w-full object-contain ${loading ? "opacity-60" : ""}`} />
        : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Belum ada preview — ubah parameter untuk memicu</div>}
      {loading && (
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">updating…</span>
      )}
    </div>
  )
}

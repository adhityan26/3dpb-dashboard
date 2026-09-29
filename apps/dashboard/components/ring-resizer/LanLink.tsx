/** Direct NAS download over plain http: fast on LAN, but the browser may ask to "Keep" it on https pages. */
export function LanLink({ url, className }: { url: string; className?: string }) {
  return (
    <a href={url} title="Download langsung dari NAS (http, LAN) — kalau Chrome memblokir, pilih Keep"
      className={className ?? "underline g-t2"}>
      LAN
    </a>
  )
}

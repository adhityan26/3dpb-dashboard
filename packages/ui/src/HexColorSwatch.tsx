const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/

export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_RE.test(color.trim())
}

/** Small circular swatch preview for a hex color string. Renders nothing if `color` isn't valid hex. */
export function HexColorSwatch({ color, className = '' }: { color: string; className?: string }) {
  if (!isValidHexColor(color)) return null
  return (
    <span
      className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${className}`}
      style={{ background: color, border: '1px solid rgba(255,255,255,0.25)' }}
    />
  )
}

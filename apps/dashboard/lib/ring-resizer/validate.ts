import type { SizeMode } from "./sizing"
import type { AnchorInput } from "./types"

export interface ProcessRequest {
  modelId: string
  mode: SizeMode
  value: number
  clearanceMm: number
  text: string
}

export const MAX_TEXT_LEN = 24
const TEXT_RE = /^[\x20-\x7E]*$/ // printable ASCII — matches the engrave font coverage we rely on

type Result<T> = { ok: true } & T | { ok: false; error: string }

export function parseProcessRequest(body: unknown): Result<{ req: ProcessRequest }> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be an object" }
  const b = body as Record<string, unknown>
  if (typeof b.modelId !== "string" || b.modelId.length === 0) return { ok: false, error: "modelId required" }
  if (b.mode !== "us" && b.mode !== "dia" && b.mode !== "circ") return { ok: false, error: "mode must be us|dia|circ" }
  if (typeof b.value !== "number" || !(b.value > 0)) return { ok: false, error: "value must be > 0" }
  const clearanceMm = typeof b.clearanceMm === "number" ? b.clearanceMm : 0
  if (clearanceMm < 0 || clearanceMm > 2) return { ok: false, error: "clearanceMm out of range" }
  if (typeof b.text !== "string" || b.text.length > MAX_TEXT_LEN || !TEXT_RE.test(b.text)) {
    return { ok: false, error: `text must be printable ASCII, max ${MAX_TEXT_LEN} chars` }
  }
  return { ok: true, req: { modelId: b.modelId, mode: b.mode, value: b.value, clearanceMm, text: b.text } }
}

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n))
}

export function parseAnchorsBody(body: unknown): Result<{ anchors: AnchorInput[] }> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be an object" }
  const list = (body as Record<string, unknown>).anchors
  if (!Array.isArray(list)) return { ok: false, error: "anchors must be an array" }
  const anchors: AnchorInput[] = []
  for (const a of list) {
    if (typeof a !== "object" || a === null) return { ok: false, error: "anchor must be an object" }
    const r = a as Record<string, unknown>
    if (!isVec3(r.pos) || !isVec3(r.normal) || !isVec3(r.up)) {
      return { ok: false, error: "anchor pos/normal/up must be [x,y,z] numbers" }
    }
    const textHeightMm = typeof r.textHeightMm === "number" && r.textHeightMm > 0.5 && r.textHeightMm <= 20 ? r.textHeightMm : NaN
    const depthMm = typeof r.depthMm === "number" && r.depthMm > 0 && r.depthMm <= 3 ? r.depthMm : NaN
    if (Number.isNaN(textHeightMm) || Number.isNaN(depthMm)) {
      return { ok: false, error: "textHeightMm (0.5..20) and depthMm (0..3) required" }
    }
    anchors.push({ pos: r.pos, normal: r.normal, up: r.up, textHeightMm, depthMm })
  }
  return { ok: true, anchors }
}

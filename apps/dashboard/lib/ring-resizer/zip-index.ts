// Reads entry names from the tail of a ZIP without downloading the whole
// archive (result ZIPs are ~150 MB; the central directory is a few hundred bytes).

const EOCD_SIG = 0x06054b50
const CDH_SIG = 0x02014b50
const EOCD_MIN = 22

/** Bytes to fetch from the end of a ZIP so the central directory fits for our small archives. */
export const ZIP_TAIL_BYTES = 64 * 1024

/**
 * Entry names from a ZIP given its last `tail.length` bytes and total size.
 * Returns [] when the central directory is not fully inside the tail or the
 * data is not a ZIP — callers treat that as "unknown contents".
 */
export function zipEntryNamesFromTail(tail: Buffer, totalSize: number): string[] {
  let eocd = -1
  for (let i = tail.length - EOCD_MIN; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd < 0) return []
  const count = tail.readUInt16LE(eocd + 10)
  const cdOffset = tail.readUInt32LE(eocd + 16)
  const tailStart = totalSize - tail.length
  let p = cdOffset - tailStart
  if (p < 0) return []

  const names: string[] = []
  for (let n = 0; n < count; n++) {
    if (p + 46 > tail.length || tail.readUInt32LE(p) !== CDH_SIG) return []
    const nameLen = tail.readUInt16LE(p + 28)
    const extraLen = tail.readUInt16LE(p + 30)
    const commentLen = tail.readUInt16LE(p + 32)
    if (p + 46 + nameLen > tail.length) return []
    names.push(tail.toString("utf8", p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
  }
  return names
}

/**
 * Size label shared by every entry ("Ring_7.5.stl", "Frame_7.5.stl" → "7.5");
 * null when entries disagree or don't follow the <part>_<label>.stl pattern.
 */
export function labelFromEntries(names: string[]): string | null {
  const labels = new Set(
    names.map((n) => /_([^_]+)\.stl$/i.exec(n)?.[1] ?? null),
  )
  if (labels.size !== 1) return null
  return [...labels][0]
}

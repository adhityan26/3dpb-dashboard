interface TlvField {
  tag: string
  value: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Parse an EMVCo TLV payload into its fields, operating on UTF-8 BYTES
 * throughout (length prefixes are byte counts per the EMVCo spec, not JS
 * string character counts). Throws a descriptive Error on any structural
 * defect rather than silently returning a partial/garbage result.
 */
export function parseTlv(payload: string): TlvField[] {
  if (!payload.startsWith('0002')) {
    throw new Error('Payload QRIS tidak valid')
  }

  const bytes = encoder.encode(payload)
  const fields: TlvField[] = []
  let i = 0
  while (i < bytes.length) {
    if (i + 4 > bytes.length) {
      throw new Error('Payload QRIS tidak valid')
    }
    const tag = decoder.decode(bytes.slice(i, i + 2))
    const lenStr = decoder.decode(bytes.slice(i + 2, i + 4))
    if (!/^\d{2}$/.test(lenStr)) {
      throw new Error('Payload QRIS tidak valid')
    }
    const len = parseInt(lenStr, 10)
    if (i + 4 + len > bytes.length) {
      throw new Error('Payload QRIS tidak valid')
    }
    const value = decoder.decode(bytes.slice(i + 4, i + 4 + len))
    fields.push({ tag, value })
    i += 4 + len
  }

  if (i !== bytes.length) {
    throw new Error('Payload QRIS tidak valid')
  }

  return fields
}

/** Returns true if `text` has the basic structural shape of a valid EMVCo TLV payload. */
export function isValidEmvcoPayload(text: string): boolean {
  try {
    parseTlv(text)
    return true
  } catch {
    return false
  }
}

function serializeTlv(fields: TlvField[]): string {
  return fields
    .map((f) => {
      const valueBytes = encoder.encode(f.value)
      return `${f.tag}${String(valueBytes.length).padStart(2, '0')}${f.value}`
    })
    .join('')
}

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection — the variant EMVCo/QRIS requires. */
export function crc16ccitt(str: string): string {
  const bytes = encoder.encode(str)
  let crc = 0xffff
  for (let c = 0; c < bytes.length; c++) {
    crc ^= bytes[c] << 8
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Convert a static QRIS EMVCo payload into a dynamic one carrying a specific
 * transaction amount: flips the Point of Initiation Method (tag 01) from
 * static ("11") to dynamic ("12"), injects/replaces the Transaction Amount
 * (tag 54), and recomputes the trailing CRC (tag 63) — the input payload's
 * own CRC is always discarded, never trusted.
 */
export function buildDynamicQris(staticPayload: string, amountRupiah: number): string {
  if (!Number.isFinite(amountRupiah) || amountRupiah <= 0) {
    throw new Error('Jumlah QRIS tidak valid')
  }

  const fields = parseTlv(staticPayload).filter((f) => f.tag !== '63' && f.tag !== '54')

  const poi = fields.find((f) => f.tag === '01')
  if (poi) poi.value = '12'

  const amountValue = Number.isInteger(amountRupiah) ? String(amountRupiah) : amountRupiah.toFixed(2)
  if (!/^\d{1,10}(\.\d{2})?$/.test(amountValue)) {
    throw new Error('Jumlah QRIS terlalu besar atau format tidak valid')
  }
  fields.push({ tag: '54', value: amountValue })

  fields.sort((a, b) => Number(a.tag) - Number(b.tag))

  const withoutCrc = serializeTlv(fields) + '6304'
  return withoutCrc + crc16ccitt(withoutCrc)
}

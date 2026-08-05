interface TlvField {
  tag: string
  value: string
}

function parseTlv(payload: string): TlvField[] {
  const fields: TlvField[] = []
  let i = 0
  while (i < payload.length) {
    const tag = payload.substring(i, i + 2)
    const len = parseInt(payload.substring(i + 2, i + 4), 10)
    const value = payload.substring(i + 4, i + 4 + len)
    fields.push({ tag, value })
    i += 4 + len
  }
  return fields
}

function serializeTlv(fields: TlvField[]): string {
  return fields.map((f) => `${f.tag}${String(f.value.length).padStart(2, '0')}${f.value}`).join('')
}

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection — the variant EMVCo/QRIS requires. */
export function crc16ccitt(str: string): string {
  let crc = 0xffff
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8
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
  fields.push({ tag: '54', value: amountValue })

  fields.sort((a, b) => Number(a.tag) - Number(b.tag))

  const withoutCrc = serializeTlv(fields) + '6304'
  return withoutCrc + crc16ccitt(withoutCrc)
}

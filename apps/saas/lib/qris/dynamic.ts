/** CRC16-CCITT (FALSE): poly 0x1021, init 0xFFFF, tanpa reflect/xorout. 4 hex uppercase. */
export function crc16ccitt(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/**
 * Generate dynamic QRIS dari payload statis + nominal.
 * - Tag 01 (point of initiation) → "12" (dinamis).
 * - Tag 54 (amount) disisipkan/ditimpa.
 * - Tag 63 (CRC) dihitung ulang di akhir.
 */
export function generateDynamicQris(staticPayload: string, amount: number): string {
  let p = staticPayload.trim();
  // buang CRC lama (tag 63, selalu di akhir: "6304" + 4 char)
  const crcIdx = p.lastIndexOf("6304");
  if (crcIdx !== -1 && crcIdx === p.length - 8) p = p.slice(0, crcIdx);
  // point of initiation 11 → 12 (atau sisipkan bila tak ada)
  if (p.includes("010211")) p = p.replace("010211", "010212");
  else if (!p.includes("010212")) p = p.slice(0, 4) + "010212" + p.slice(4); // setelah tag 00 (6 char)
  // sisipkan tag 54 baru sebelum tag 58 (country code), yang selalu ada di QRIS.
  // (QRIS statik nyaris tak pernah punya tag 54, jadi tidak perlu regex hapus tag 54 lama —
  // lihat catatan di report re: brief step 4.)
  const amountTlv = tlv("54", String(amount));
  const anchor = p.indexOf("5802");
  if (anchor !== -1) p = p.slice(0, anchor) + amountTlv + p.slice(anchor);
  else p = p + amountTlv;
  // CRC baru
  const body = p + "6304";
  return body + crc16ccitt(body);
}

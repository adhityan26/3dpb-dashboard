/** Normalisasi nomor Indonesia ke format 628… (yang diminta WA Omni). null jika invalid. */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, "");
  let digits: string;
  if (cleaned.startsWith("+62")) digits = "62" + cleaned.slice(3);
  else if (cleaned.startsWith("62")) digits = cleaned;
  else if (cleaned.startsWith("0")) digits = "62" + cleaned.slice(1);
  else if (cleaned.startsWith("8")) digits = "62" + cleaned;
  else return null;
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Tentukan channel dari satu input login. */
export function detectChannel(input: string): "email" | "phone" | null {
  const t = input.trim();
  if (t.includes("@")) return "email";
  if (normalizePhone(t)) return "phone";
  return null;
}

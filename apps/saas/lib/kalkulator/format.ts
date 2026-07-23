// Helper format tampilan — dipisah dari compute agar bisa dipakai UI tanpa impor logika formula.
export const rupiah = (n: number): string => "Rp" + Math.round(n).toLocaleString("id-ID");
export const ceil500 = (n: number): number => Math.ceil(n / 500) * 500;

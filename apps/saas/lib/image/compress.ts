export function fitDimensions(w: number, h: number, maxSide: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= maxSide) return { w, h };
  const scale = maxSide / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Kompres gambar di browser: resize ke maxSide lalu encode JPEG. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitDimensions(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("compress_failed");
  return blob;
}

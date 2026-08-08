import { NextResponse } from "next/server";
import { requirePaidCore } from "@/lib/session-auth";
import { getBinary } from "@/lib/storage/r2";

/**
 * "Latest only" (spec: tak ada histori versi/panel admin pilih versi -- lihat percakapan) --
 * admin overwrite key ini manual tiap ada build baru. Key/Content-Type/filename dipetakan di
 * sini (bukan diterima dari URL) supaya user tak bisa minta path R2 sembarangan.
 */
const BINARIES: Record<string, { key: string; contentType: string; filename: string }> = {
  win: { key: "agent/latest/win.exe", contentType: "application/x-msdownload", filename: "Slizebiz-Agent-Setup.exe" },
  mac: { key: "agent/latest/mac.dmg", contentType: "application/x-apple-diskimage", filename: "Slizebiz-Agent.dmg" },
};

export async function GET(_req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const gate = await requirePaidCore();
  if (gate instanceof NextResponse) return gate;

  const { platform } = await ctx.params;
  const meta = BINARIES[platform];
  if (!meta) return NextResponse.json({ error: "unknown_platform" }, { status: 404 });

  let obj;
  try {
    obj = await getBinary(meta.key);
  } catch {
    // R2NotConfigured atau kegagalan jaringan ke R2 -- beda kelas dari "admin belum upload"
    // (di bawah), jadi status code beda (503, bukan 404).
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  if (!obj) return NextResponse.json({ error: "binary_not_uploaded" }, { status: 404 });

  return new NextResponse(obj.body, {
    status: 200,
    headers: {
      "Content-Type": meta.contentType,
      "Content-Disposition": `attachment; filename="${meta.filename}"`,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

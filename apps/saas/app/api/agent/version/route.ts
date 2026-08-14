import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { headBinary } from "@/lib/storage/r2";

const KEYS: Record<string, string> = {
  win: "agent/latest/win.exe",
  mac: "agent/latest/mac.dmg",
};

export async function GET(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;

  const platform = new URL(req.url).searchParams.get("platform");
  const key = platform ? KEYS[platform] : undefined;
  if (!key) return NextResponse.json({ error: "invalid_platform" }, { status: 400 });

  let meta;
  try {
    meta = await headBinary(key);
  } catch {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ commitHash: meta?.commitHash ?? null });
}

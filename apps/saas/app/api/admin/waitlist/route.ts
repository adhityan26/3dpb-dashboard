import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { fetchWaitlist } from "@/lib/waitlist/cloudflare";

export async function GET() {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const rows = await fetchWaitlist();
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, rows: [] }, { status: 502 });
  }
}

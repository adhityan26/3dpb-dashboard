import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { getLayoutOrNull } from "@/lib/cyd-layout/service";
import { getEligibleShortCodes } from "@/lib/printer-slots/capacity";

export async function GET(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;
  const layout = await getLayoutOrNull(result.userId);
  if (!layout) return NextResponse.json({ error: "no_layout" }, { status: 404 });

  const eligible = await getEligibleShortCodes(result.userId);
  const filtered = {
    ...layout,
    pages: layout.pages.map((page) => ({
      ...page,
      cells: page.cells.filter((cell) => !("printer" in cell) || eligible.has(cell.printer as string)),
    })),
  };
  return NextResponse.json(filtered);
}

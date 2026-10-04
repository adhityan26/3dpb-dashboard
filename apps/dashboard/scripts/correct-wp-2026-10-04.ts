// One-off corrections (2026-10-04), approved by the owner after a full audit of
// WP status vs live Shopee/Tokopedia order status (see status-sync.ts for the
// Tokopedia code fix that caused most of these):
//  B. WPs already Done/Canceled whose order says otherwise — the daily sync never
//     rescans terminal WPs, so these need a one-time fix.
//  C. Open Shopee WPs created before the due-date fix, with no due date.
// Every row is only touched if it still has the exact "from" state it was audited
// in, and the Discord re-sync result is checked (updateWorkingProject reports
// discordSynced:false instead of throwing when the thread edit fails).
import { prisma } from "@/lib/db"
import { updateWorkingProject } from "@/lib/working-projects/service"

type StatusFix = { source: "shopee" | "tokopedia"; order: string; from: string; to: string }
const sh = (order: string): StatusFix => ({ source: "shopee", order, from: "Done", to: "Canceled" })
const tk = (order: string): StatusFix => ({ source: "tokopedia", order, from: "Done", to: "Canceled" })

const STATUS_FIXES: StatusFix[] = [
  sh("260617BHRN6MB0"), sh("2607073NW557QM"), sh("2608258D07BGAW"), sh("260923RXJDM6Q8"),
  tk("585151280521119278"), tk("585193155184526418"), tk("585214993077012027"), tk("585479525198235026"),
  tk("585479525198431634"), tk("585699121773512320"), tk("585742011762181297"), tk("585997043493209601"),
  tk("586102098633787298"), tk("586127448331814799"), tk("586244925283534407"), tk("586290374510740717"),
  tk("586299679265424673"), tk("586349389046122298"),
  { source: "tokopedia", order: "586019150943193012", from: "Canceled", to: "Done" },
]
const DUE_FIXES = ["2609263PKDHY4X", "2609263A1N0C0M", "26092630TD0KJB", "2609276FA9MKWF"]
const DUE_DATE = "2026-10-14"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let changed = 0, skipped = 0, failed = 0, discordFailed = 0

  for (const f of STATUS_FIXES) {
    const wp = await prisma.workingProject.findFirst({ where: { source: f.source, sourceOrderNo: f.order }, select: { status: true, discordThreadId: true } })
    if (!wp?.discordThreadId) { skipped++; console.log(`SKIP ${f.order}: WP/thread tidak ditemukan`); continue }
    if (wp.status !== f.from) { skipped++; console.log(`SKIP ${f.order}: status sekarang "${wp.status}", bukan "${f.from}"`); continue }
    try {
      const r = await updateWorkingProject(wp.discordThreadId, { status: f.to })
      changed++
      if (!r.discordSynced) { discordFailed++; console.log(`DISCORD-SYNC GAGAL ${f.order} (DB sudah berubah)`) }
    } catch (err) { failed++; console.log(`GAGAL ${f.order}: ${(err as Error).message}`) }
    await sleep(300)
  }

  for (const order of DUE_FIXES) {
    const wp = await prisma.workingProject.findFirst({ where: { source: "shopee", sourceOrderNo: order }, select: { status: true, dueDate: true, discordThreadId: true } })
    if (!wp?.discordThreadId) { skipped++; console.log(`SKIP due ${order}: WP/thread tidak ditemukan`); continue }
    if (wp.dueDate || wp.status !== "Open") { skipped++; console.log(`SKIP due ${order}: status "${wp.status}", due ${wp.dueDate?.toISOString().slice(0, 10) ?? "kosong"}`); continue }
    try {
      const r = await updateWorkingProject(wp.discordThreadId, { dueDateRaw: DUE_DATE })
      changed++
      if (!r.discordSynced) { discordFailed++; console.log(`DISCORD-SYNC GAGAL due ${order} (DB sudah berubah)`) }
    } catch (err) { failed++; console.log(`GAGAL due ${order}: ${(err as Error).message}`) }
    await sleep(300)
  }

  console.log(`changed: ${changed}  skipped: ${skipped}  failed: ${failed}  discordSyncFailed: ${discordFailed}`)
  const errRows = await prisma.workingProject.count({ where: { syncState: "error" } })
  console.log(`total WP dengan syncState=error saat ini: ${errRows}`)
}

main().finally(() => prisma.$disconnect())

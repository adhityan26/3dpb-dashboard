import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { getAllConfig } from "@/lib/config";
import { fetchWaitlist, type WaitlistRow } from "@/lib/waitlist/cloudflare";
import { listPending, listPaid } from "@/lib/payment/service";
import { prisma } from "@/lib/db";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import { PaymentQueue, type PendingRow } from "@/components/admin/PaymentQueue";
import { PaidList, type PaidRow } from "@/components/admin/PaidList";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!isOwner(session?.user?.email)) redirect("/");

  const config = await getAllConfig();
  let rows: WaitlistRow[] = [];
  let waitlistError: string | null = null;
  try {
    rows = await fetchWaitlist();
  } catch (e) {
    waitlistError = (e as Error).message;
  }

  const now = new Date();
  const pending = await listPending(now);
  const paid = await listPaid(20);
  const userIds = [...new Set([...pending, ...paid].map((p) => p.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, phone: true } });
  const whoOf = (uid: string) => { const u = users.find((x) => x.id === uid); return u?.email ?? u?.phone ?? uid.slice(0, 6); };
  const pendingRows: PendingRow[] = pending.map((p) => ({ id: p.id, amount: p.amount, who: whoOf(p.userId), ageMin: Math.floor((now.getTime() - p.createdAt.getTime()) / 60000), marked: !!p.paidMarkedAt }));
  const paidRows: PaidRow[] = paid.map((p) => ({ id: p.id, userId: p.userId, amount: p.amount, who: whoOf(p.userId), when: p.verifiedAt ? p.verifiedAt.toISOString().slice(0, 10) : "" }));

  return (
    <main className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold g-t1">Admin Slizebiz</h1>
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Harga & copy (Config)</h2>
        <ConfigEditor initial={config} />
      </section>
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Waitlist ({rows.length})</h2>
        {waitlistError
          ? <p className="text-[12px]" style={{ color: "#dc2626" }}>Gagal baca waitlist: {waitlistError}</p>
          : <WaitlistTable rows={rows} />}
      </section>
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Pembayaran pending ({pendingRows.length})</h2>
        <PaymentQueue rows={pendingRows} />
      </section>
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Terverifikasi (refund/nonaktif)</h2>
        <PaidList rows={paidRows} />
      </section>
    </main>
  );
}

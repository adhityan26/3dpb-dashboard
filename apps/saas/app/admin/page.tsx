import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { getAllConfig } from "@/lib/config";
import { fetchWaitlist, type WaitlistRow } from "@/lib/waitlist/cloudflare";
import { listPending, listPaid } from "@/lib/payment/service";
import { prisma } from "@/lib/db";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import { LogoutButton } from "@/components/LogoutButton";
import { PaymentQueue, type PendingRow } from "@/components/admin/PaymentQueue";
import { PaidList, type PaidRow } from "@/components/admin/PaidList";
import { UserList, type UserRow } from "@/components/admin/UserList";
import { AdminTabs, type AdminTab } from "@/components/admin/AdminTabs";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!isOwner(session?.user?.email)) redirect("/");

  const now = new Date();

  // Config
  const config = await getAllConfig();

  // Waitlist (Cloudflare D1, read-only)
  let waitRows: WaitlistRow[] = [];
  let waitlistError: string | null = null;
  try {
    waitRows = await fetchWaitlist();
  } catch (e) {
    waitlistError = (e as Error).message;
  }

  // Pembayaran
  const pending = await listPending(now);
  const paid = await listPaid(20);
  const payUserIds = [...new Set([...pending, ...paid].map((p) => p.userId))];
  const payUsers = await prisma.user.findMany({ where: { id: { in: payUserIds } }, select: { id: true, email: true, phone: true } });
  const whoOf = (uid: string) => {
    const u = payUsers.find((x) => x.id === uid);
    return u?.email ?? u?.phone ?? uid.slice(0, 6);
  };
  const pendingRows: PendingRow[] = pending.map((p) => ({
    id: p.id, amount: p.amount, who: whoOf(p.userId),
    ageMin: Math.floor((now.getTime() - p.createdAt.getTime()) / 60000), marked: !!p.paidMarkedAt,
  }));
  const paidRows: PaidRow[] = paid.map((p) => ({
    id: p.id, userId: p.userId, amount: p.amount, who: whoOf(p.userId),
    when: p.verifiedAt ? p.verifiedAt.toISOString().slice(0, 10) : "",
  }));

  // User aktif (semua user + status entitlement)
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, phone: true, createdAt: true, entitlement: { select: { lifetimeOwned: true, subStatus: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const userRows: UserRow[] = allUsers.map((u) => ({
    who: u.email ?? u.phone ?? u.id.slice(0, 6),
    status: u.entitlement?.lifetimeOwned ? "Beli" : u.entitlement?.subStatus === "ACTIVE" ? "Subscribe" : "Free",
    joined: u.createdAt.toISOString().slice(0, 10),
  }));

  const tabs: AdminTab[] = [
    { key: "setting", label: "Setting", node: <ConfigEditor initial={config} /> },
    {
      key: "waitlist",
      label: `Waitlist (${waitRows.length})`,
      node: waitlistError
        ? <p className="text-[12px]" style={{ color: "#dc2626" }}>Gagal baca waitlist: {waitlistError}</p>
        : <WaitlistTable rows={waitRows} />,
    },
    {
      key: "pembayaran",
      label: `Pembayaran (${pendingRows.length})`,
      node: (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="text-sm font-medium g-t2 mb-2">Pending ({pendingRows.length})</h3>
            <PaymentQueue rows={pendingRows} />
          </div>
          <div>
            <h3 className="text-sm font-medium g-t2 mb-2">Terverifikasi (refund/nonaktif)</h3>
            <PaidList rows={paidRows} />
          </div>
        </div>
      ),
    },
    { key: "user", label: `User aktif (${userRows.length})`, node: <UserList rows={userRows} /> },
  ];

  return (
    <main className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold g-t1">Admin Slizebiz</h1>
        <LogoutButton />
      </div>
      <AdminTabs tabs={tabs} />
    </main>
  );
}

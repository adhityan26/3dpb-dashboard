import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { prisma } from "@/lib/db";
import { BeliCydCheckout } from "@/components/BeliCydCheckout";
import { PageShell } from "@/components/PageShell";
import { isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function BeliCydPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const paidCore = capabilities(ent).paidCore;
  const variants = await prisma.cydVariant.findMany({ where: { active: true }, select: { id: true, label: true, price: true } });
  const refund = await getConfig("copy.refund");
  return (
    <PageShell title="Beli CYD" current="beli" owner={isOwner(session.user?.email)} userLabel={session.user?.email ?? undefined} narrow>
      {paidCore ? (
        <BeliCydCheckout variants={variants} refundCopy={refund} />
      ) : (
        <p className="text-[13px] g-t4">
          🔒 Beli CYD perlu Pro dulu — upgrade ke Pro di <a href="/beli" className="underline">/beli</a>.
        </p>
      )}
    </PageShell>
  );
}

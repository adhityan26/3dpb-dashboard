import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { BeliSlotCheckout } from "@/components/BeliSlotCheckout";
import { PageShell } from "@/components/PageShell";
import { isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function BeliSlotPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const paidCore = capabilities(ent).paidCore;
  const pricePerUnit = await getConfig("price.slotPerUnit");
  const refund = await getConfig("copy.refund");
  return (
    <PageShell title="Beli Slot Printer" current="beli" owner={isOwner(session.user?.email)} userLabel={session.user?.email ?? undefined} narrow>
      {paidCore ? (
        <BeliSlotCheckout pricePerUnit={pricePerUnit} refundCopy={refund} />
      ) : (
        <p className="text-[13px] g-t4">
          🔒 Beli slot tambahan perlu Pro dulu — upgrade ke Pro di <a href="/beli" className="underline">/beli</a>.
        </p>
      )}
    </PageShell>
  );
}

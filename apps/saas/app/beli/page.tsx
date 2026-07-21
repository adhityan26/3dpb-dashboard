import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { BeliCheckout } from "@/components/BeliCheckout";
import { PageShell } from "@/components/PageShell";
import { isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function BeliPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const price = await getConfig("price.beli");
  const refund = await getConfig("copy.refund");
  return (
    <PageShell title="Slizebiz Pro" current="beli" owner={isOwner(session.user?.email)} userLabel={session.user?.email ?? undefined} narrow>
      {ent.lifetimeOwned
        ? <p className="text-[13px] g-t2 mt-3">Akses Pro kamu sudah aktif. Terima kasih! 🎉</p>
        : <BeliCheckout displayPrice={price} refundCopy={refund} />}
    </PageShell>
  );
}

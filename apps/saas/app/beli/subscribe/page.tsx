import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { BeliSubscribeCheckout } from "@/components/BeliSubscribeCheckout";
import { PageShell } from "@/components/PageShell";
import { isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function BeliSubscribePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const isActive = ent.subStatus === "ACTIVE" && ent.subExpiresAt !== null && ent.subExpiresAt > new Date();
  const priceKey = ent.lifetimeOwned ? "price.sub.owner" : "price.sub.standalone";
  const price = await getConfig(priceKey);
  const refund = await getConfig("copy.refund");
  return (
    <PageShell title="Subscribe Bulanan" current="beli" owner={isOwner(session.user?.email)} userLabel={session.user?.email ?? undefined} narrow>
      {isActive && (
        <p className="text-[13px] g-t2 mb-3">
          Langganan kamu aktif sampai <b>{ent.subExpiresAt!.toLocaleDateString("id-ID")}</b>. Perpanjang sekarang biar gak putus.
        </p>
      )}
      <BeliSubscribeCheckout price={price} refundCopy={refund} isOwner={ent.lifetimeOwned} />
    </PageShell>
  );
}

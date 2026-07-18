import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { BeliCheckout } from "@/components/BeliCheckout";

export const dynamic = "force-dynamic";

export default async function BeliPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const price = await getConfig("price.beli");
  const refund = await getConfig("copy.refund");
  return (
    <main className="max-w-sm mx-auto p-6 mt-10">
      <h1 className="text-lg font-semibold g-t1 mb-1">Beli Slizebiz</h1>
      {ent.lifetimeOwned
        ? <p className="text-[13px] g-t2 mt-3">Kamu sudah punya akses Beli. Terima kasih! 🎉</p>
        : <BeliCheckout displayPrice={price} refundCopy={refund} />}
    </main>
  );
}

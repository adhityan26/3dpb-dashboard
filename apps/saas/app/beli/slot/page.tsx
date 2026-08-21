import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { BeliSlotCheckout } from "@/components/BeliSlotCheckout";
import { PageShell } from "@/components/PageShell";
import { isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function BeliSlotPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const pricePerUnit = await getConfig("price.slotPerUnit");
  const refund = await getConfig("copy.refund");
  return (
    <PageShell title="Beli Slot Printer" current="beli" owner={isOwner(session.user?.email)} userLabel={session.user?.email ?? undefined} narrow>
      <BeliSlotCheckout pricePerUnit={pricePerUnit} refundCopy={refund} />
    </PageShell>
  );
}

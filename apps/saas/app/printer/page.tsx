import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { DeviceList } from "@/components/printer/DeviceList";
import { PageShell } from "@/components/PageShell";

export const dynamic = "force-dynamic";

export default async function PrinterPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const ent = await getEntitlement(userId);
  const paidCore = capabilities(ent).paidCore;
  return (
    <PageShell title="Printer" current="printer" owner={isOwner(session?.user?.email)} userLabel={session?.user?.email ?? undefined}>
      <DeviceList paidCore={paidCore} />
    </PageShell>
  );
}

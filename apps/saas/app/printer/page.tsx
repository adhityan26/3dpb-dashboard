import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { DeviceList } from "@/components/printer/DeviceList";
import { LayoutEditor } from "@/components/printer/LayoutEditor";
import { listDevices } from "@/lib/devices/service";
import { PageShell } from "@/components/PageShell";
import { hasActiveSlotGrant } from "@/lib/printer-slots/capacity";

export const dynamic = "force-dynamic";

export default async function PrinterPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const ent = await getEntitlement(userId);
  // paidCore lapse (mis. Subscribe berhenti) tak boleh menutup akses kalau user masih pegang
  // SlotGrant permanen (beli-slot / CYD) — samakan dengan gate backend requireAgentAccess().
  const hasAgentAccess = capabilities(ent).paidCore || (await hasActiveSlotGrant(userId));
  // Palette layout dapat snapshot device dari server (bukan fetch sendiri di client) — cukup
  // field yang dipakai editor, jangan kirim kolom lain (userId dll) ke browser.
  const devices = hasAgentAccess
    ? (await listDevices(userId)).map((d) => ({ shortCode: d.shortCode, label: d.label, printerType: d.printerType, model: d.model }))
    : [];
  return (
    <PageShell title="Printer" current="printer" owner={isOwner(session?.user?.email)} userLabel={session?.user?.email ?? undefined}>
      <DeviceList paidCore={hasAgentAccess} />
      {hasAgentAccess && (
        <div className="mt-4">
          <LayoutEditor devices={devices} />
        </div>
      )}
    </PageShell>
  );
}

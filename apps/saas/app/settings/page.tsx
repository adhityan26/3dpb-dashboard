import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { SettingsPanel } from "@/components/SettingsPanel";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const ent = await getEntitlement(userId);
  const paidCore = capabilities(ent).paidCore;
  return (
    <main className="max-w-xl mx-auto p-6">
      <AppHeader subtitle="Setting" />
      <h1 className="text-lg font-semibold g-t1 mb-1">Setting kalkulator</h1>
      {!paidCore && <p className="text-[12px] g-t4 mb-4">Ini nilai default (read-only). Ambil Pro untuk mengubah &amp; memakainya di kalkulatormu.</p>}
      <SettingsPanel editable={paidCore} userId={userId} />
    </main>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { Calculator } from "@/components/Calculator";
import { PageShell } from "@/components/PageShell";

export default async function KalkulatorEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  if (!capabilities(ent).paidCore) redirect("/");
  const { id } = await params;
  return (
    <PageShell title="Kalkulator harga jual" current="kalkulator" owner={isOwner(session.user.email)} userLabel={session.user.email ?? undefined}>
      <Calculator paidCore userId={session.user.id} kalkulasiId={id} />
    </PageShell>
  );
}

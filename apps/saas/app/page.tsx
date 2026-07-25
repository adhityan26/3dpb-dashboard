import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { Calculator } from "@/components/Calculator";
import { RiwayatList } from "@/components/RiwayatList";
import { PageShell } from "@/components/PageShell";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const paidCore = capabilities(ent).paidCore;
  return (
    <PageShell title="Kalkulator harga jual" description="Hitung biaya modal & harga jual produk 3D print-mu." current="kalkulator" owner={isOwner(session.user.email)} userLabel={session.user.email ?? undefined}>
      {paidCore ? <RiwayatList userId={session.user.id} /> : <Calculator paidCore={false} userId={session.user.id} />}
    </PageShell>
  );
}

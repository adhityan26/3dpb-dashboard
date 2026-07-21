import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { isOwner } from "@/lib/owner";
import { Calculator } from "@/components/Calculator";
import { PageShell } from "@/components/PageShell";

export default async function Home() {
  const session = await auth();
  // App = properti ber-auth (teaser anon hidup di landing www.slizebiz.com).
  // Belum login → ke /login; sudah login → kalkulator penuh Free.
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  return (
    <PageShell subtitle="Kalkulator harga jual" current="kalkulator" owner={isOwner(session.user.email)} userLabel={session.user.email ?? undefined}>
      <Calculator authenticated={true} paidCore={capabilities(ent).paidCore} userId={session.user.id} />
    </PageShell>
  );
}

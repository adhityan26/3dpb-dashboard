import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Calculator } from "@/components/Calculator";

export default async function Home() {
  const session = await auth();
  // App = properti ber-auth (teaser anon hidup di landing www.slizebiz.com).
  // Belum login → ke /login; sudah login → kalkulator penuh Free.
  if (!session?.user) redirect("/login");
  return <Calculator authenticated={true} />;
}

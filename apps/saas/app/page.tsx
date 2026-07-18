import { auth } from "@/lib/auth";
import { Calculator } from "@/components/Calculator";

export default async function Home() {
  const session = await auth();
  return <Calculator authenticated={!!session?.user} />;
}

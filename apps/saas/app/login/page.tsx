import { signIn } from "@/lib/auth";
import { GlassButton, GlassInput } from "@3pb/ui";

export default function LoginPage() {
  async function sendLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    await signIn("resend", { email, redirectTo: "/" });
  }
  return (
    <main className="max-w-sm mx-auto p-6 mt-16">
      <img src="/logo.svg" alt="Slizebiz" width={44} height={44} className="mb-3" />
      <h1 className="text-lg font-semibold g-t1 mb-1">Masuk Slizebiz</h1>
      <p className="text-[12px] g-t4 mb-4">Tanpa password — kami kirim link masuk via email.</p>
      <form action={sendLink} className="flex flex-col gap-3">
        <GlassInput type="email" name="email" placeholder="email@kamu.com" required />
        <GlassButton type="submit">Kirim link masuk</GlassButton>
      </form>
    </main>
  );
}

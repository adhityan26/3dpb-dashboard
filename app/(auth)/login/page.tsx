import { auth, signIn } from "@/lib/auth"
import { redirect } from "next/navigation"
import { AuthError } from "next-auth"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (session?.user && !("error" in session)) {
    redirect("/order")
  }

  const params = await searchParams
  const loginError = params.error

  return (
    <div
      className="relative w-full max-w-sm rounded-[24px] overflow-hidden"
      style={{
        background: "rgba(14,14,44,0.75)",
        backdropFilter: "blur(28px) saturate(1.8)",
        WebkitBackdropFilter: "blur(28px) saturate(1.8)",
        boxShadow: [
          "0 24px 60px rgba(0,0,0,0.5)",
          "0 0 0 1px rgba(99,102,241,0.2)",
          "inset 0 1px 0 rgba(255,255,255,0.12)",
          "inset 0 -1px 0 rgba(0,0,0,0.15)",
        ].join(", "),
      }}
    >
      {/* Iridescent top border */}
      <div
        className="absolute top-0 left-[10%] right-[10%] h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(165,180,252,0.6), rgba(196,181,253,0.4), rgba(165,180,252,0.6), transparent)",
        }}
        aria-hidden
      />

      {/* Specular highlight */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: 0, left: 0, width: "60%", height: "45%",
          background: "radial-gradient(ellipse at 20% 15%, rgba(255,255,255,0.08) 0%, transparent 70%)",
          borderRadius: "24px 0 50px 0",
        }}
        aria-hidden
      />

      <div className="relative z-10 px-8 py-9">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🖨️</div>
          <h1
            className="text-[22px] font-extrabold mb-1"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            3DPB Ops
          </h1>
          <p className="text-[13px]" style={{ color: "rgba(165,180,252,0.6)" }}>
            3D Printing Bandung
          </p>
        </div>

        {/* SSO button */}
        <a href="/api/auth/sso" className="sso-btn mb-5">
          <span className="mr-2 text-[16px]">🔐</span>
          Masuk dengan SSO
        </a>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
            atau
          </span>
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        </div>

        {/* Credentials fallback */}
        <form
          action={async (formData: FormData) => {
            "use server"
            try {
              await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: "/order",
              })
            } catch (error) {
              if (error instanceof AuthError) {
                redirect("/login?error=Email+atau+password+salah")
              }
              throw error // Re-throw NEXT_REDIRECT so it still redirects on success
            }
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "rgba(165,180,252,0.6)" }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="owner@example.com"
              required
              className="glass-input w-full h-10 rounded-[10px] px-3 text-[13px]"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "rgba(165,180,252,0.6)" }}
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="glass-input w-full h-10 rounded-[10px] px-3 text-[13px]"
            />
          </div>

          {loginError && (
            <p className="text-[12px] text-center" style={{ color: "rgba(239,100,100,0.85)" }}>
              {decodeURIComponent(loginError)}
            </p>
          )}

          <button type="submit" className="glass-submit mt-1">
            Masuk dengan Password
          </button>
        </form>
      </div>
    </div>
  )
}

# Glass UI — Plan 3: Login Page Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the login page card to match the Glass UI design system — liquid glass card, iridescent border, specular highlight, gradient logo, indigo SSO button, glass inputs.

**Architecture:** Replace the ShadCN Card with a custom glass card div. Keep all auth logic (SSO route, server action credentials) unchanged — only the visual layer changes. The auth layout already provides the background (bg-glass-page + AmbientOrbs).

**Tech Stack:** Next.js 16 App Router, Tailwind v4, CSS inline styles for glass effects

---

## File Map

| Action | Path | What changes |
|---|---|---|
| Modify | `app/(auth)/login/page.tsx` | Full card redesign — remove ShadCN Card, replace with custom glass card |

---

### Task 1: Redesign Login Page Card

**Files:**
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Read current `app/(auth)/login/page.tsx`** to understand the full structure before replacing.

- [ ] **Step 2: Replace the entire file content with:**

```tsx
import { auth, signIn } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function LoginPage() {
  // Auto-redirect if already authenticated
  const session = await auth()
  if (session?.user && !("error" in session)) {
    redirect("/order")
  }

  return (
    /* Glass card — no ShadCN Card, full custom glass */
    <div
      className="relative w-full max-w-sm rounded-[24px] overflow-hidden"
      style={{
        /* Dark: deep indigo glass */
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
        className="absolute top-0 left-[10%] right-[10%] h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(165,180,252,0.6), rgba(196,181,253,0.4), rgba(165,180,252,0.6), transparent)",
        }}
        aria-hidden
      />

      {/* Specular highlight — top-left corner */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: 0, left: 0, width: "60%", height: "45%",
          background: "radial-gradient(ellipse at 20% 15%, rgba(255,255,255,0.08) 0%, transparent 70%)",
          borderRadius: "24px 0 50px 0",
        }}
        aria-hidden
      />

      {/* Card content */}
      <div className="relative z-10 px-8 py-9">

        {/* Logo + branding */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🛍️</div>
          <h1
            className="text-[22px] font-extrabold mb-1"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Shopee Dashboard
          </h1>
          <p className="text-[13px]" style={{ color: "rgba(165,180,252,0.6)" }}>
            3D Printing Bandung
          </p>
        </div>

        {/* Primary: SSO button */}
        <a
          href="/api/auth/sso"
          className="flex items-center justify-center w-full h-11 rounded-[14px] text-[14px] font-semibold text-white mb-5 transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #5055e8, #7c84f8)",
            boxShadow: "0 4px 20px rgba(99,102,241,0.45), 0 0 0 1px rgba(165,180,252,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 6px 28px rgba(99,102,241,0.6), 0 0 0 1px rgba(165,180,252,0.3), inset 0 1px 0 rgba(255,255,255,0.2)"
            e.currentTarget.style.transform = "translateY(-1px)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 4px 20px rgba(99,102,241,0.45), 0 0 0 1px rgba(165,180,252,0.2), inset 0 1px 0 rgba(255,255,255,0.15)"
            e.currentTarget.style.transform = "translateY(0)"
          }}
        >
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

        {/* Fallback: email/password */}
        <form
          action={async (formData: FormData) => {
            "use server"
            await signIn("credentials", {
              email: formData.get("email"),
              password: formData.get("password"),
              redirectTo: "/order",
            })
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
              className="w-full h-10 rounded-[10px] px-3 text-[13px] text-white outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(8px)",
                caretColor: "#a5b4fc",
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1px solid rgba(99,102,241,0.5)"
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)"
                e.currentTarget.style.boxShadow = "none"
              }}
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
              className="w-full h-10 rounded-[10px] px-3 text-[13px] text-white outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(8px)",
                caretColor: "#a5b4fc",
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1px solid rgba(99,102,241,0.5)"
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)"
                e.currentTarget.style.boxShadow = "none"
              }}
            />
          </div>

          <button
            type="submit"
            className="w-full h-10 rounded-[10px] text-[13px] font-medium transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(8px)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)"
              e.currentTarget.style.color = "rgba(255,255,255,0.9)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)"
              e.currentTarget.style.color = "rgba(255,255,255,0.7)"
            }}
          >
            Masuk dengan Password
          </button>
        </form>

      </div>
    </div>
  )
}
```

**Important notes:**
- All auth logic (SSO route href, server action with `signIn`) is unchanged — only visual
- `onFocus`/`onBlur`/`onMouseEnter`/`onMouseLeave` are valid on HTML elements in Next.js Server Components for progressive enhancement (they render as static HTML attributes)
- Actually: `onFocus`, `onBlur`, `onMouseEnter`, `onMouseLeave` require `"use client"` in React. Since this is a Server Component, replace these event handlers with CSS-based hover/focus instead. See Step 3.

- [ ] **Step 3: Since Server Components can't use event handlers — use CSS classes instead**

After writing the file in Step 2, the event handlers (onFocus, onBlur, onMouseEnter, onMouseLeave) need to be removed since this is a Server Component. Replace the input and button elements with simpler versions using Tailwind arbitrary values:

**For inputs**, replace the `onFocus`/`onBlur` handlers with Tailwind `focus:` variants by adding this to `app/globals.css`:

```css
/* ── LOGIN PAGE GLASS INPUTS ── */
.glass-input {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
  color: white;
  transition: border-color 0.2s, box-shadow 0.2s;
  caret-color: #a5b4fc;
}
.glass-input::placeholder { color: rgba(255,255,255,0.25); }
.glass-input:focus {
  outline: none;
  border-color: rgba(99,102,241,0.5);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
}

/* SSO button hover */
.sso-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 28px rgba(99,102,241,0.6), 0 0 0 1px rgba(165,180,252,0.3), inset 0 1px 0 rgba(255,255,255,0.2) !important;
}

/* Glass submit button hover */
.glass-submit:hover {
  background: rgba(255,255,255,0.1) !important;
  color: rgba(255,255,255,0.9) !important;
}
```

Then in `login/page.tsx`, update the elements to use these classes instead of event handlers:
- Inputs: add `className="... glass-input"`
- SSO `<a>`: add `className="... sso-btn"`
- Submit `<button>`: add `className="... glass-submit"`
- Remove ALL `onFocus`, `onBlur`, `onMouseEnter`, `onMouseLeave` props

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/login/page.tsx" app/globals.css
git commit -m "feat(glass-ui): redesign login page — liquid glass card, iridescent border, indigo SSO button"
git push
```

---

### Task 2: Build, Deploy, Verify

- [ ] **Step 1: Build**

```bash
./deploy.sh build 2>&1 | tail -8
```
Expected: `✅  Deploy berhasil!`

- [ ] **Step 2: Reconnect homelab network**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker network connect homelab shopee-dashboard 2>/dev/null || true
```

- [ ] **Step 3: Verify in browser**

Open `http://shopee.homelab.lan/login` in incognito:
- [ ] Full-screen background with Deep Space gradient + animated orbs ✅
- [ ] Glass card centered with iridescent top border line ✅
- [ ] "🛍️ Shopee Dashboard" gradient text title ✅
- [ ] "Masuk dengan SSO" button — indigo gradient with glow ✅
- [ ] Email + password inputs with glass styling ✅
- [ ] Input focus → indigo border + soft glow ✅

- [ ] **Step 4: Push**

```bash
git push
```

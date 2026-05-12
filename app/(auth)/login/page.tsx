"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const [showFallback, setShowFallback] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    setLoading(false)
    if (result?.error) {
      setError("Email atau password salah.")
      return
    }
    window.location.href = "/order"
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🛍️</span>
          <CardTitle className="text-lg">Shopee Dashboard</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">3D Printing Bandung</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary: Authentik SSO */}
        <Button
          className="w-full bg-[#EE4D2D] hover:bg-[#d44226]"
          onClick={() => signIn("authentik", { callbackUrl: "/order" })}
        >
          🔐 Masuk dengan SSO
        </Button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t dark:border-slate-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">atau</span>
          </div>
        </div>

        {/* Fallback: email/password */}
        {!showFallback ? (
          <button
            onClick={() => setShowFallback(true)}
            className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
          >
            Login dengan password (fallback)
          </button>
        ) : (
          <form onSubmit={handleCredentials} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Masuk..." : "Masuk"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

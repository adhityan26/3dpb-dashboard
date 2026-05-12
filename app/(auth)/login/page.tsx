"use client"

import { useEffect } from "react"
import { signIn } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  // Auto-redirect ke Authentik SSO saat halaman dimuat
  useEffect(() => {
    signIn("authentik", { callbackUrl: "/order" })
  }, [])

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🛍️</span>
          <CardTitle className="text-lg">Shopee Dashboard</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">3D Printing Bandung</p>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground text-center py-4">
          Mengarahkan ke halaman login...
        </p>
      </CardContent>
    </Card>
  )
}

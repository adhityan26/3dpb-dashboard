import { signIn } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
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
        {/* Primary: Authentik SSO — GET route handler */}
        <a
          href="/api/auth/sso"
          className="flex items-center justify-center w-full h-10 px-4 rounded-md text-sm font-medium text-white bg-[#EE4D2D] hover:bg-[#d44226] transition-colors"
        >
          🔐 Masuk dengan SSO
        </a>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t dark:border-slate-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">atau</span>
          </div>
        </div>

        {/* Fallback: email/password via Server Action */}
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
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="owner@example.com"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
            />
          </div>
          <Button type="submit" variant="outline" className="w-full">
            Masuk dengan Password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

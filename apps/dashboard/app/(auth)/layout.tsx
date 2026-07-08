import { AmbientOrbs } from "@/components/ui/AmbientOrbs"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-glass-page flex items-center justify-center p-4">
      <AmbientOrbs />
      <div className="relative z-10 w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}

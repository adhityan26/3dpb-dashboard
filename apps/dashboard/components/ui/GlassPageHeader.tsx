interface GlassPageHeaderProps {
  title: string
  subtitle?: string
  children?: React.ReactNode
}

export function GlassPageHeader({ title, subtitle, children }: GlassPageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-5 gap-4">
      <div>
        <h1
          className="text-[26px] font-extrabold mb-1"
          style={{
            background: "linear-gradient(135deg, var(--glass-title-from, #fff) 0%, var(--glass-title-to, #a5b4fc) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm g-t3">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
    </div>
  )
}

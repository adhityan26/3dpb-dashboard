import type { HTMLAttributes } from 'react'
export function GlassCard({ className = '', ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`g-card rounded-[14px] ${className}`} {...p} />
}

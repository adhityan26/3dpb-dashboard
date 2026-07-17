import type { ButtonHTMLAttributes } from 'react'
export function GlassButton({ className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`g-btn-ghost rounded-[10px] px-4 h-10 text-sm font-medium transition-colors ${className}`} {...p} />
}

import type { InputHTMLAttributes } from 'react'
export function GlassInput({ className = '', ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`glass-input rounded-[5px] px-3 h-10 text-sm ${className}`} {...p} />
}

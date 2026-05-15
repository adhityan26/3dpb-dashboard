import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  return NextResponse.json({
    hasUser: !!session?.user,
    role: session?.user?.role ?? null,
    email: session?.user?.email ?? null,
    error: (session as Record<string, unknown>)?.error ?? null,
  })
}

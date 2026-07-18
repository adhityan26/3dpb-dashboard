import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Fallback mencegah crash saat import-time selama build; query runtime
  // akan fail-fast bila DATABASE_URL absen.
  const connectionString = process.env.DATABASE_URL ?? "postgresql://localhost/build_placeholder"
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter, log: ["error"] })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

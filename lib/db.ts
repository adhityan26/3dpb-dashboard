import { PrismaClient } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db"
  // DATABASE_URL is in the form `file:./dev.db` — strip the `file:` prefix for better-sqlite3.
  const filename = url.startsWith("file:") ? url.slice("file:".length) : url
  const adapter = new PrismaBetterSqlite3({ url: filename })
  return new PrismaClient({ adapter, log: ["error"] })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

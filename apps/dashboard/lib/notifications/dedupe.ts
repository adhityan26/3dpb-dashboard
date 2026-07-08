import { prisma } from "@/lib/db"

const DEFAULT_DEDUP_HOURS = 24

/**
 * Check if an alert with the given key was already sent within the dedup window.
 * Returns true if it was sent (caller should skip), false if not.
 */
export async function wasRecentlySent(
  alertKey: string,
  dedupHours: number = DEFAULT_DEDUP_HOURS,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - dedupHours * 60 * 60 * 1000)
  const recent = await prisma.notificationLog.findFirst({
    where: {
      alertKey,
      sentAt: { gte: cutoff },
    },
    orderBy: { sentAt: "desc" },
  })
  return recent !== null
}

/**
 * Cleanup old notification logs (older than 30 days).
 */
export async function pruneOldLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.notificationLog.deleteMany({
    where: { sentAt: { lt: cutoff } },
  })
  return result.count
}

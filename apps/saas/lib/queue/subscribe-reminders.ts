import { Queue } from "bullmq";
import { redisConnection } from "./redis";
import { prisma } from "@/lib/db";
import { sendWA } from "@/lib/wa/client";
import { sendEmail } from "@/lib/payment/notify";

const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // H-3

export const subscribeReminderQueue = new Queue("slizebiz-subscribe-reminders", { connection: redisConnection });

/** Daftarkan job berulang harian (jam 9 pagi). BullMQ dedupe berdasarkan jobId+pattern -- aman
 * dipanggil ulang tiap boot server, gak bikin duplikat. */
export async function scheduleSubscribeReminderSweep(): Promise<void> {
  await subscribeReminderQueue.add(
    "sweep",
    {},
    { repeat: { pattern: "0 9 * * *" }, jobId: "subscribe-reminder-sweep" }
  );
}

/** Logika sapuan murni -- dites langsung, dipanggil oleh worker BullMQ (lihat
 * subscribe-reminders.worker.ts). H-3, kirim sekali per siklus expiry (reminderSentForExpiry),
 * gagal 1 user gak menghentikan sisanya. */
export async function sweepSubscribeReminders(now = new Date()): Promise<number> {
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const candidates = await prisma.entitlement.findMany({
    where: { subStatus: "ACTIVE", subExpiresAt: { gt: now, lte: windowEnd } },
    include: { user: { select: { email: true, phone: true } } },
  });

  let sent = 0;
  for (const ent of candidates) {
    if (ent.reminderSentForExpiry?.getTime() === ent.subExpiresAt?.getTime()) continue;
    const dateStr = ent.subExpiresAt!.toLocaleDateString("id-ID");
    const msg = `Langganan Slizebiz kamu berakhir ${dateStr} — perpanjang sebelum slot printer berkurang.`;
    try {
      if (ent.user.email) await sendEmail(ent.user.email, msg, "Langganan Slizebiz segera berakhir");
      else if (ent.user.phone) await sendWA(ent.user.phone, msg);
      else {
        console.warn(`[subscribe-reminder] user ${ent.userId} tak punya email maupun phone, dilewati`);
        continue;
      }
      await prisma.entitlement.update({ where: { userId: ent.userId }, data: { reminderSentForExpiry: ent.subExpiresAt } });
      sent++;
    } catch (e) {
      console.error(`[subscribe-reminder] gagal kirim ke user ${ent.userId}:`, (e as Error).message);
    }
  }
  return sent;
}

import { Worker } from "bullmq";
import { redisConnection } from "./redis";
import { sweepSubscribeReminders } from "./subscribe-reminders";

let worker: Worker | null = null;

/** Idempoten -- boleh dipanggil ulang, gak bikin worker kedua. */
export function startSubscribeReminderWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(
    "slizebiz-subscribe-reminders",
    async () => {
      await sweepSubscribeReminders();
    },
    { connection: redisConnection }
  );
  worker.on("failed", (job, err) => {
    console.error(`[subscribe-reminder-worker] job ${job?.id} gagal:`, err.message);
  });
  return worker;
}

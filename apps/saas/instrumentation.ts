export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { scheduleSubscribeReminderSweep } = await import("@/lib/queue/subscribe-reminders");
  const { startSubscribeReminderWorker } = await import("@/lib/queue/subscribe-reminders.worker");

  startSubscribeReminderWorker();
  void scheduleSubscribeReminderSweep().catch((err) => {
    console.error("[subscribe-reminders] gagal menjadwalkan sweep, reminder H-3 nonaktif untuk boot ini:", err);
  });
}

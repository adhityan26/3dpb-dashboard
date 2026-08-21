export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { scheduleSubscribeReminderSweep } = await import("@/lib/queue/subscribe-reminders");
  const { startSubscribeReminderWorker } = await import("@/lib/queue/subscribe-reminders.worker");

  startSubscribeReminderWorker();
  await scheduleSubscribeReminderSweep();
}

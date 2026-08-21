import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    entitlement: { findMany: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/wa/client", () => ({ sendWA: vi.fn() }));
vi.mock("@/lib/payment/notify", () => ({ sendEmail: vi.fn() }));

import { prisma } from "@/lib/db";
import { sendWA } from "@/lib/wa/client";
import { sendEmail } from "@/lib/payment/notify";
import { sweepSubscribeReminders } from "./subscribe-reminders";

const NOW = new Date("2026-08-21T09:00:00Z");
beforeEach(() => vi.clearAllMocks());

it("sends a WA reminder to a user with email null, phone set, expiring within 3 days", async () => {
  const expiry = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u1", subExpiresAt: expiry, reminderSentForExpiry: null, user: { email: null, phone: "628111" } },
  ]);
  const sent = await sweepSubscribeReminders(NOW);
  expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("berakhir"));
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.entitlement.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { reminderSentForExpiry: expiry } });
  expect(sent).toBe(1);
});

it("sends an email reminder to a user with only email set", async () => {
  const expiry = new Date(NOW.getTime() + 1 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u2", subExpiresAt: expiry, reminderSentForExpiry: null, user: { email: "a@b.com", phone: null } },
  ]);
  await sweepSubscribeReminders(NOW);
  expect(sendEmail).toHaveBeenCalledWith("a@b.com", expect.stringContaining("berakhir"), expect.any(String));
  expect(sendWA).not.toHaveBeenCalled();
});

it("skips a user already reminded for this exact expiry cycle", async () => {
  const expiry = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u3", subExpiresAt: expiry, reminderSentForExpiry: expiry, user: { email: "a@b.com", phone: null } },
  ]);
  const sent = await sweepSubscribeReminders(NOW);
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.entitlement.update).not.toHaveBeenCalled();
  expect(sent).toBe(0);
});

it("re-arms after a renewal changes subExpiresAt to a new value", async () => {
  const oldExpiry = new Date(NOW.getTime() - 1000);
  const newExpiry = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u4", subExpiresAt: newExpiry, reminderSentForExpiry: oldExpiry, user: { email: "a@b.com", phone: null } },
  ]);
  const sent = await sweepSubscribeReminders(NOW);
  expect(sendEmail).toHaveBeenCalled();
  expect(sent).toBe(1);
});

it("continues the sweep when one user's send fails", async () => {
  const expiry = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u5", subExpiresAt: expiry, reminderSentForExpiry: null, user: { email: "fail@b.com", phone: null } },
    { userId: "u6", subExpiresAt: expiry, reminderSentForExpiry: null, user: { email: "ok@b.com", phone: null } },
  ]);
  (sendEmail as any).mockRejectedValueOnce(new Error("resend down")).mockResolvedValueOnce(undefined);
  const sent = await sweepSubscribeReminders(NOW);
  expect(sent).toBe(1);
  expect(prisma.entitlement.update).toHaveBeenCalledTimes(1);
  expect(prisma.entitlement.update).toHaveBeenCalledWith({ where: { userId: "u6" }, data: { reminderSentForExpiry: expiry } });
});

it("queries entitlements with subStatus ACTIVE and subExpiresAt in the (now, now+3d] window", async () => {
  (prisma.entitlement.findMany as any).mockResolvedValue([]);
  await sweepSubscribeReminders(NOW);
  expect(prisma.entitlement.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        subStatus: "ACTIVE",
        subExpiresAt: { gt: NOW, lte: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000) },
      }),
    })
  );
});

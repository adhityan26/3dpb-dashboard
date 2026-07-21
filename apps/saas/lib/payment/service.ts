import crypto from "crypto";
import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConfig, parsePrice } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { generateDynamicQris } from "@/lib/qris/dynamic";
import { AlreadyOwned, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

export function liveSince(now: Date): Date {
  return new Date(now.getTime() - LIVE_WINDOW_MS);
}

export async function allocUniqueCode(now = new Date()): Promise<number> {
  const live = await prisma.payment.findMany({
    where: { status: "PENDING", createdAt: { gt: liveSince(now) } },
    select: { uniqueCode: true },
  });
  const used = new Set(live.map((p) => p.uniqueCode));
  if (used.size >= 1000) throw new CodePoolExhausted();
  let code = crypto.randomInt(0, 1000);
  while (used.has(code)) code = crypto.randomInt(0, 1000);
  return code;
}

export async function createOrReuseCheckout(userId: string, now = new Date()): Promise<Payment> {
  const ent = await getEntitlement(userId);
  if (ent.lifetimeOwned) throw new AlreadyOwned();

  const existing = await prisma.payment.findFirst({
    where: { userId, status: "PENDING", createdAt: { gt: liveSince(now) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const price = parsePrice(await getConfig("price.beli"));
  if (price === null || price <= 0) throw new PriceNotSet();
  const staticQ = (await getConfig("qris.static")).trim();
  if (!staticQ) throw new QrisNotSet();
  const buffer = Math.max(1000, parsePrice(await getConfig("price.discountBuffer")) ?? 1000);
  if (price <= buffer) throw new PriceNotSet();

  const code = await allocUniqueCode(now);
  const amount = price - buffer + code;
  const qrPayload = generateDynamicQris(staticQ, amount);

  return prisma.payment.create({
    data: { userId, tier: "beli", displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING" },
  });
}

export async function findClaimablePayment(id: string, userId: string, now = new Date()): Promise<Payment | null> {
  return prisma.payment.findFirst({
    where: { id, userId, status: "PENDING", createdAt: { gt: liveSince(now) } },
  });
}

export async function markPaid(
  id: string,
  userId: string,
  proof: { proofKey: string; proofType: string },
  now = new Date(),
): Promise<void> {
  const p = await findClaimablePayment(id, userId, now);
  if (!p) throw new Error("not_found");
  await prisma.payment.update({
    where: { id },
    data: { paidMarkedAt: now, proofKey: proof.proofKey, proofType: proof.proofType },
  });
}

export async function listPending(now = new Date()): Promise<Payment[]> {
  const rows = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      OR: [
        { createdAt: { gt: liveSince(now) } }, // masih hidup (dalam 3 jam)
        { paidMarkedAt: { not: null } }, // sudah ditandai bayar — jangan hilang walau lewat 3 jam
      ],
    },
    orderBy: [{ paidMarkedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
  return rows;
}

export async function activate(id: string, ownerEmail: string, now = new Date()): Promise<Payment | null> {
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p || p.status !== "PENDING") return null;
  const updated = await prisma.payment.update({
    where: { id },
    data: { status: "PAID", verifiedAt: now, verifiedBy: ownerEmail },
  });
  await prisma.entitlement.upsert({
    where: { userId: p.userId },
    create: { userId: p.userId, lifetimeOwned: true, lifetimePurchasedAt: now },
    update: { lifetimeOwned: true, lifetimePurchasedAt: now },
  });
  return updated;
}

export async function cancel(id: string): Promise<void> {
  await prisma.payment.update({ where: { id }, data: { status: "CANCELLED" } });
}

export async function deactivate(userId: string): Promise<void> {
  await prisma.entitlement.update({ where: { userId }, data: { lifetimeOwned: false } });
}

export async function listPaid(limit = 20): Promise<Payment[]> {
  return prisma.payment.findMany({ where: { status: "PAID" }, orderBy: { verifiedAt: "desc" }, take: limit });
}

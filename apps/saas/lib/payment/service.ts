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
  const buffer = parsePrice(await getConfig("price.discountBuffer")) ?? 1000;

  const code = await allocUniqueCode(now);
  const amount = price - buffer + code;
  const qrPayload = generateDynamicQris(staticQ, amount);

  return prisma.payment.create({
    data: { userId, tier: "beli", displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING" },
  });
}

export async function markPaid(id: string, userId: string, now = new Date()): Promise<void> {
  const p = await prisma.payment.findFirst({
    where: { id, userId, status: "PENDING", createdAt: { gt: liveSince(now) } },
  });
  if (!p) throw new Error("not_found");
  await prisma.payment.update({ where: { id }, data: { paidMarkedAt: now } });
}

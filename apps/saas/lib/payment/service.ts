import crypto from "crypto";
import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConfig, parsePrice } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { generateDynamicQris } from "@/lib/qris/dynamic";
import { AlreadyOwned, InvalidQuantity, InvalidShippingAddress, InvalidCydVariant, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

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
    data: { userId, productType: "BELI", displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING" },
  });
}

export async function createSlotCheckout(userId: string, quantity: number, now = new Date()): Promise<Payment> {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new InvalidQuantity();

  const existing = await prisma.payment.findFirst({
    where: { userId, productType: "SLOT_PURCHASE", quantity, status: "PENDING", createdAt: { gt: liveSince(now) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const unitPrice = parsePrice(await getConfig("price.slotPerUnit"));
  if (unitPrice === null || unitPrice <= 0) throw new PriceNotSet();
  const staticQ = (await getConfig("qris.static")).trim();
  if (!staticQ) throw new QrisNotSet();
  const buffer = Math.max(1000, parsePrice(await getConfig("price.discountBuffer")) ?? 1000);
  const price = unitPrice * quantity;
  if (price <= buffer) throw new PriceNotSet();

  const code = await allocUniqueCode(now);
  const amount = price - buffer + code;
  const qrPayload = generateDynamicQris(staticQ, amount);

  return prisma.payment.create({
    data: { userId, productType: "SLOT_PURCHASE", quantity, displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING" },
  });
}

export async function createOrReuseCydCheckout(
  userId: string,
  cydVariantId: string,
  quantity: number,
  shippingAddress: string,
  now = new Date()
): Promise<Payment> {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new InvalidQuantity();
  if (!shippingAddress.trim()) throw new InvalidShippingAddress();

  const variant = await prisma.cydVariant.findUnique({ where: { id: cydVariantId } });
  if (!variant || !variant.active) throw new InvalidCydVariant();

  const existing = await prisma.payment.findFirst({
    where: { userId, productType: "CYD_PURCHASE", cydVariantId, quantity, status: "PENDING", createdAt: { gt: liveSince(now) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (existing.shippingAddress !== shippingAddress) {
      return prisma.payment.update({ where: { id: existing.id }, data: { shippingAddress } });
    }
    return existing;
  }

  const staticQ = (await getConfig("qris.static")).trim();
  if (!staticQ) throw new QrisNotSet();
  const buffer = Math.max(1000, parsePrice(await getConfig("price.discountBuffer")) ?? 1000);
  const price = variant.price * quantity;
  if (price <= buffer) throw new PriceNotSet();

  const code = await allocUniqueCode(now);
  const amount = price - buffer + code;
  const qrPayload = generateDynamicQris(staticQ, amount);

  return prisma.payment.create({
    data: {
      userId, productType: "CYD_PURCHASE", cydVariantId, quantity, shippingAddress,
      displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING",
    },
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id },
      data: { status: "PAID", verifiedAt: now, verifiedBy: ownerEmail },
    });
    switch (p.productType) {
      case "BELI":
        await tx.entitlement.upsert({
          where: { userId: p.userId },
          create: { userId: p.userId, lifetimeOwned: true, lifetimePurchasedAt: now },
          update: { lifetimeOwned: true, lifetimePurchasedAt: now },
        });
        break;
      case "SLOT_PURCHASE": {
        if (!Number.isInteger(p.quantity) || p.quantity! <= 0) {
          throw new Error(`activate() SLOT_PURCHASE payment ${p.id} has invalid quantity: ${p.quantity}`);
        }
        await tx.slotGrant.create({
          data: { userId: p.userId, source: "SLOT_PURCHASE", paymentId: p.id, quantity: p.quantity! },
        });
        break;
      }
      // CYD_PURCHASE (sub-project 3) and SUBSCRIBE (sub-project 4) add their own case here.
      default:
        throw new Error(`activate() called for unsupported productType: ${p.productType}`);
    }
    return updated;
  });
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

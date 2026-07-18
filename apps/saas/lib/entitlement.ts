import { prisma } from "@/lib/db";
import type { Entitlement } from "@prisma/client";

export type Capability = "paidCore" | "cloud";

export interface EntitlementLike {
  lifetimeOwned: boolean;
  subStatus: string; // NONE | ACTIVE | EXPIRED
}

/** Kapabilitas turunan dari entitlement komposit (spec §6). */
export function capabilities(ent: EntitlementLike): { paidCore: boolean; cloud: boolean } {
  const active = ent.subStatus === "ACTIVE";
  return {
    paidCore: ent.lifetimeOwned || active,
    cloud: active,
  };
}

export function can(ent: EntitlementLike, cap: Capability): boolean {
  return capabilities(ent)[cap];
}

export class PlanError extends Error {
  status = 403;
  constructor(cap: Capability) {
    super(`Kapabilitas '${cap}' dibutuhkan`);
    this.name = "PlanError";
  }
}

/** Guard server untuk API berbayar (belum dipakai di 1a-1; siap 1b/1c). */
export function requirePlan(ent: EntitlementLike, cap: Capability): void {
  if (!can(ent, cap)) throw new PlanError(cap);
}

/** Ambil entitlement user; auto-create baris default aman bila belum ada. */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const existing = await prisma.entitlement.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.entitlement.create({ data: { userId } });
}

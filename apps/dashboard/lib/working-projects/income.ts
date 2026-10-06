// Pure helpers for a Working Project's income summary (harga jual / biaya / pendapatan
// akhir). No DB or server imports: the Orders tab uses resolveWpIncome in the browser.

export interface WpIncome {
  salePrice: number
  feesTotal: number
  netIncome: number
  /** 'manual' = derived from the invoice amount; the others come from the marketplace. */
  status: 'manual' | 'estimated' | 'settled'
  settledAt: Date | null
}

export type IncomeFields = {
  salePrice: number
  feesTotal: number
  netIncome: number
  incomeStatus: 'estimated' | 'settled'
  incomeSettledAt: Date | null
}

/** incomeStatus of a WP the marketplace had no income row for; rechecked rarely. */
export const INCOME_UNAVAILABLE = 'unavailable'

export function incomeFromShopeeEscrow(oi: { order_selling_price?: number; escrow_amount?: number }): IncomeFields | null {
  if (typeof oi.escrow_amount !== 'number') return null
  // Shopee has no single "total fees" field (commission, service, processing, AMS, shipping
  // difference...), so fees are the gap between the selling price and the payout.
  const salePrice = oi.order_selling_price ?? oi.escrow_amount
  return {
    salePrice,
    feesTotal: Math.max(0, salePrice - oi.escrow_amount),
    netIncome: oi.escrow_amount,
    // Approximation: the escrow payload has no release flag, so any generated escrow counts as
    // final. A later refund/return adjustment on a settled order is therefore not picked up.
    incomeStatus: 'settled',
    incomeSettledAt: null,
  }
}

type Money = { amount?: string } | undefined
const rupiah = (m: Money): number | null => {
  const n = Number(m?.amount)
  // The columns are Int: round so a fractional amount can't make the whole row's update throw.
  return m?.amount !== undefined && Number.isFinite(n) ? Math.round(n) : null
}

export function incomeFromTokopediaStatement(rec: {
  settlement_amount?: Money
  earning_amount?: Money
  fees?: Money
  settlement_status?: number
  settlement_time?: string
}): IncomeFields | null {
  const net = rupiah(rec.settlement_amount)
  const gross = rupiah(rec.earning_amount)
  const fees = rupiah(rec.fees)
  if (net === null || gross === null || fees === null) return null
  const settled = rec.settlement_status === 2
  const ms = Number(rec.settlement_time)
  return {
    salePrice: gross,
    feesTotal: Math.abs(fees), // Tokopedia reports fees as a negative number
    netIncome: net,
    incomeStatus: settled ? 'settled' : 'estimated',
    incomeSettledAt: settled && ms > 0 ? new Date(ms) : null,
  }
}

interface IncomeSource {
  source: string
  invoiceAmount: number
  salePrice?: number | null
  feesTotal?: number | null
  netIncome?: number | null
  incomeStatus?: string | null
  incomeSettledAt?: string | Date | null
}

/**
 * What to show for a WP. Manual WPs have no marketplace fees, so the invoice amount is
 * both the selling price and the income. Marketplace WPs show nothing until the income
 * sync has filled them.
 */
export function resolveWpIncome(wp: IncomeSource): WpIncome | null {
  if (wp.source === 'manual') {
    return { salePrice: wp.invoiceAmount, feesTotal: 0, netIncome: wp.invoiceAmount, status: 'manual', settledAt: null }
  }
  if (wp.salePrice == null || wp.feesTotal == null || wp.netIncome == null) return null
  return {
    salePrice: wp.salePrice,
    feesTotal: wp.feesTotal,
    netIncome: wp.netIncome,
    status: wp.incomeStatus === 'settled' ? 'settled' : 'estimated',
    settledAt: wp.incomeSettledAt ? new Date(wp.incomeSettledAt) : null,
  }
}

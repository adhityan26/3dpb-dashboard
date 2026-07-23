"use client"

import { useShopeeFeeAnalytics } from "@/lib/hooks/use-settings"
import { useKalkulatorRates } from "@/lib/hooks/use-kalkulator"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function pct(n: number) { return `${n.toFixed(1)}%` }

export function ShopeeFeeAnalyticsCard() {
  const { data, isLoading, isError, error } = useShopeeFeeAnalytics()
  const { data: rates } = useKalkulatorRates()
  const settingFeeRatePct = rates ? (1 - 1 / rates.adminEcommerce) * 100 : null

  return (
    <div className="rounded-[5px] p-5 space-y-4 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">📊 Analitik Biaya Shopee</div>
        <div className="text-xs mt-0.5 g-t4">
          Data real dari escrow Shopee — {data?.period ?? "30 hari terakhir"}
          {data?.fetchedAt && (
            <span className="ml-2">· diperbarui {new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-center py-6 g-t4">Mengambil data escrow Shopee...</div>
      )}

      {isError && (
        <div className="text-xs text-red-400 py-2">
          Gagal load: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {data && (
        <>
          {/* Fee rate comparison */}
          <div className="rounded-[5px] p-3 space-y-2"
               style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
            <div className="text-xs font-semibold g-accent uppercase tracking-wider">Fee Rate</div>
            <div className="flex items-center justify-between">
              <span className="text-xs g-t3">Real fee rate (dari escrow)</span>
              <span className="text-sm font-bold" style={{ color: "#f87171" }}>
                {pct(data.realFeeRatePct)}
              </span>
            </div>
            {settingFeeRatePct !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs g-t3">Setting adminEcommerce</span>
                <span className="text-sm font-semibold g-t2">{pct(settingFeeRatePct)}</span>
              </div>
            )}
            {settingFeeRatePct !== null && (
              <div className="flex items-center justify-between pt-1"
                   style={{ borderTop: "1px solid var(--g-inner-border)" }}>
                <span className="text-xs g-t4">Selisih</span>
                <span className="text-xs font-medium"
                      style={{ color: data.realFeeRatePct > settingFeeRatePct ? "#f87171" : "#34d399" }}>
                  {data.realFeeRatePct > settingFeeRatePct ? "+" : ""}
                  {pct(data.realFeeRatePct - settingFeeRatePct)}
                  {data.realFeeRatePct > settingFeeRatePct
                    ? " — setting terlalu rendah"
                    : " — setting sudah aman"}
                </span>
              </div>
            )}
          </div>

          {/* Aggregate totals */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total Omzet", value: fmt(data.totalOmzet) },
              { label: "Total Buyer Paid", value: fmt(data.totalBuyerPaid) },
              { label: "Total Diterima", value: fmt(data.totalReceived), highlight: true },
              { label: "Order Dianalisa", value: `${data.ordersAnalyzed} order` },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="rounded-[5px] px-3 py-2"
                   style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
                <div className="text-[10px] g-t4">{label}</div>
                <div className="text-sm font-semibold mt-0.5"
                     style={{ color: highlight ? "#34d399" : "var(--g-t1)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Fee breakdown */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">
              Breakdown Potongan
            </div>
            <div className="space-y-1">
              {[
                { label: "Komisi Shopee", value: data.totalCommission },
                { label: "Service Fee", value: data.totalServiceFee },
                { label: "Transaction Fee", value: data.totalTransactionFee },
                { label: "Ongkir (beban seller)", value: data.totalShippingFee },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="g-t3">{label}</span>
                  <span className="font-mono g-t2">{fmt(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

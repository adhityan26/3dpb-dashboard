export type AlertSeverity = "info" | "warning" | "high" | "critical"
export type AlertKind =
  | "order_pileup"
  | "stock_low"
  | "roas_drop"
  | "product_delist"

export interface AlertEvent {
  kind: AlertKind
  severity: AlertSeverity
  /** Stable identifier for dedup within a 24h window */
  alertKey: string
  title: string
  body: string
  /** Dedup window in hours. Defaults to 24. */
  dedupHours?: number
}

export interface RunnerResult {
  detected: number
  sent: number
  skipped: number
  failed: number
  events: Array<{
    alertKey: string
    kind: AlertKind
    sent: boolean
    reason?: string
  }>
  ranAt: string
}

import type { DiscordOption } from "./types"

export function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}

export function getOption(
  opts: DiscordOption[] | undefined,
  name: string,
): string | number | undefined {
  return opts?.find(o => o.name === name)?.value
}

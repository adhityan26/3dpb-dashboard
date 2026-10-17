// Argument parsing for scripts/split-combined-wps.ts, kept apart so it can be unit tested
// (the script itself imports prisma and runs on load).
export interface SplitCliArgs {
  apply: boolean
  limit?: number
  only?: string
  snapshotDir: string
  rollback: string[]
  forceEdited: boolean
}

export function parseSplitArgs(argv: string[]): SplitCliArgs {
  const a: SplitCliArgs = { apply: false, snapshotDir: './.split-snapshots', rollback: [], forceEdited: false }
  const valueOf = (i: number, flag: string): string => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} requires a value`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--apply') a.apply = true
    else if (v === '--force-edited') a.forceEdited = true
    else if (v === '--limit') { a.limit = Number(valueOf(i, v)); i++ }
    else if (v === '--only') { a.only = valueOf(i, v); i++ }
    else if (v === '--snapshot-dir') { a.snapshotDir = valueOf(i, v); i++ }
    else if (v === '--rollback') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) a.rollback.push(argv[++i])
      if (!a.rollback.length) throw new Error('--rollback requires at least one snapshot file')
    }
    else throw new Error(`unknown flag: ${v}`)
  }
  if (a.limit !== undefined && (!Number.isInteger(a.limit) || a.limit < 0)) throw new Error('--limit must be a non-negative integer')
  return a
}

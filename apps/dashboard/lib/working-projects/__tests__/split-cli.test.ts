import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseSplitArgs } from '../split-cli-args'
import { writeFileAtomic } from '../atomic-write'

describe('parseSplitArgs', () => {
  it('parses the known flags', () => {
    expect(parseSplitArgs(['--apply', '--limit', '5', '--only', '123', '--snapshot-dir', 'd', '--force-edited'])).toEqual({
      apply: true, limit: 5, only: '123', snapshotDir: 'd', rollback: [], forceEdited: true,
    })
    expect(parseSplitArgs(['--rollback', 'a.json', 'b.json', '--apply']).rollback).toEqual(['a.json', 'b.json'])
  })
  it('rejects --only / --limit / --snapshot-dir without a value, also as the last arg', () => {
    expect(() => parseSplitArgs(['--apply', '--only'])).toThrow('--only requires a value')
    expect(() => parseSplitArgs(['--only', '--apply'])).toThrow('--only requires a value')
    expect(() => parseSplitArgs(['--limit'])).toThrow('--limit requires a value')
    expect(() => parseSplitArgs(['--snapshot-dir'])).toThrow('--snapshot-dir requires a value')
  })
  it('rejects --rollback without files, unknown flags and a bad --limit', () => {
    expect(() => parseSplitArgs(['--rollback'])).toThrow('--rollback requires')
    expect(() => parseSplitArgs(['--nope'])).toThrow('unknown flag')
    expect(() => parseSplitArgs(['--limit', 'abc'])).toThrow('non-negative integer')
  })
})

describe('writeFileAtomic', () => {
  it('replaces the target and leaves no temp file behind', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'atomic-'))
    const f = path.join(dir, 'snap.json')
    await writeFile(f, 'old')
    await writeFileAtomic(f, 'new')
    expect(await readFile(f, 'utf8')).toBe('new')
    expect(await readdir(dir)).toEqual(['snap.json'])
  })
  it('keeps the old content and cleans up when the write fails', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'atomic-'))
    await expect(writeFileAtomic(path.join(dir, 'missing', 'x.json'), 'data')).rejects.toThrow()
    expect(await readdir(dir)).toEqual([])
  })
})

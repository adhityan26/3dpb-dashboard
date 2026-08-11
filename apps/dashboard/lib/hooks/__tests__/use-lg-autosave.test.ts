import { describe, it, expect, vi } from 'vitest'
import { createAutosaver } from '../use-lg-autosave'

describe('createAutosaver', () => {
  it('debounces rapid pushes into one save with the last value', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const a = createAutosaver(save, 1000)
    a.push({ v: 1 }); a.push({ v: 2 }); a.push({ v: 3 })
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ v: 3 })
    vi.useRealTimers()
  })
  it('status transitions idle -> saving -> saved', async () => {
    vi.useFakeTimers()
    const seen: string[] = []
    const a = createAutosaver(async () => {}, 100)
    a.onStatus(s => seen.push(s))
    a.push({})
    await vi.advanceTimersByTimeAsync(100)
    expect(seen).toEqual(['saving', 'saved'])
    vi.useRealTimers()
  })
  it('save rejection -> error status', async () => {
    vi.useFakeTimers()
    const seen: string[] = []
    const a = createAutosaver(async () => { throw new Error('x') }, 100)
    a.onStatus(s => seen.push(s))
    a.push({})
    await vi.advanceTimersByTimeAsync(100)
    expect(seen.at(-1)).toBe('error')
    vi.useRealTimers()
  })
  it('flush saves immediately without advancing timers', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const a = createAutosaver(save, 1000)
    a.push({ v: 1 })
    await a.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ v: 1 })
    vi.useRealTimers()
  })
})

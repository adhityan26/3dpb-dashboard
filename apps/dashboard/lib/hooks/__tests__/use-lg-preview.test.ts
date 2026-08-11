import { describe, it, expect, vi } from 'vitest'
import { createPreviewRunner } from '../use-lg-preview'

function blob() { return new Blob(["x"], { type: "image/png" }) }

describe('createPreviewRunner', () => {
  it('debounces and only fetches the last config', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValue(blob())
    const r = createPreviewRunner(fetcher, 500)
    r.request({ a: 1 }); r.request({ a: 2 })
    await vi.advanceTimersByTimeAsync(500)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toEqual({ a: 2 })
    vi.useRealTimers()
  })
  it('aborts in-flight request when a new one starts', async () => {
    vi.useFakeTimers()
    const aborted: boolean[] = []
    const fetcher = vi.fn().mockImplementation((_cfg, signal: AbortSignal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { aborted.push(true); reject(new DOMException('aborted', 'AbortError')) })
        setTimeout(() => resolve(blob()), 5000)
      }))
    const r = createPreviewRunner(fetcher, 100)
    r.request({ a: 1 })
    await vi.advanceTimersByTimeAsync(100)   // fetch 1 in flight
    r.request({ a: 2 })
    await vi.advanceTimersByTimeAsync(100)   // fetch 2 starts, fetch 1 aborted
    expect(aborted).toHaveLength(1)
    vi.useRealTimers()
  })
  it('drops stale responses (seq guard)', async () => {
    vi.useFakeTimers()
    const results: number[] = []
    let call = 0
    const fetcher = vi.fn().mockImplementation(() => {
      call++
      const delay = call === 1 ? 3000 : 100   // first slower than second
      return new Promise(resolve => setTimeout(() => resolve(blob()), delay))
    })
    const r = createPreviewRunner(fetcher, 0)
    r.onResult(({ seq }) => results.push(seq))
    r.request({ a: 1 })
    await vi.advanceTimersByTimeAsync(1)
    r.request({ a: 2 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(results).toEqual([2])   // only the latest lands
    vi.useRealTimers()
  })
})

// @vitest-environment jsdom
//
// Regression guard for the "editor rewrites config nobody touched" bug.
//
// LgCanvas2D commits config on pointerup. Before the fix, ANY press/release
// pair committed: a zero-movement click on an image corner handle wrote
// `mask_padding_pct` + `auto_fit_mask: false`, a click on the casing handles
// wrote `floor_half_size`, a click on the lamp wrote `light_x/light_y`, and
// the two body drags only skipped EXACTLY-zero movement — so the couple of
// pixels of travel a real mouse click always carries wrote `shadow_offset_x/y`
// (reproduced live against the dev server: a click with ~2px/-8px of travel
// saved offsets 2.2/8.8 mm on a 452px canvas with floor_half_size 250).
// Every one of those went straight into autosave.
import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, act, fireEvent } from "@testing-library/react"
import { LgCanvas2D } from "../LgCanvas2D"

beforeAll(() => {
  // jsdom has no ResizeObserver and no layout: stub the observer and give the
  // wrapper a real square rect so the component measures a non-zero size and
  // its px<->mm math has something to work with.
  class RO {
    constructor(private cb: () => void) {}
    observe() { this.cb() }
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error test polyfill
  globalThis.ResizeObserver = RO
  // jsdom has no PointerEvent, so fireEvent.pointer* would fall back to a
  // plain Event and drop clientX/clientY (every coordinate becomes NaN).
  class PE extends MouseEvent {}
  // @ts-expect-error test polyfill
  globalThis.PointerEvent = PE
  // @ts-expect-error test polyfill
  window.PointerEvent = PE
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 400, width: 400, height: 400, toJSON() {} } as DOMRect
  }
  // @ts-expect-error jsdom lacks pointer capture
  Element.prototype.setPointerCapture = () => {}
  // @ts-expect-error jsdom lacks pointer capture
  Element.prototype.releasePointerCapture = () => {}
})

const CONFIG = {
  shadow_offset_x: 0,
  shadow_offset_y: 0,
  auto_fit_mask: true,
  mask_padding_pct: 0,
  floor_half_size: 250,
  outer_radius: 100,
  light_x: 0,
  light_y: 0,
}

function renderCanvas() {
  const onConfigChange = vi.fn()
  const utils = render(
    <LgCanvas2D
      pngUrl="/preview.png"
      originalImageUrl="/silhouette.png"
      loading={false}
      config={{ ...CONFIG }}
      onConfigChange={onConfigChange}
    />,
  )
  return { onConfigChange, ...utils }
}

/** Press, optionally travel, release — the shape of a real gesture. */
function gesture(target: Element, root: Element, dx: number, dy: number) {
  // Each event gets its own act() so the drag state from the previous one is
  // committed before the next handler reads it (a single act batches them).
  act(() => { fireEvent.pointerDown(target, { clientX: 200, clientY: 200, pointerId: 1 }) })
  if (dx !== 0 || dy !== 0) {
    act(() => { fireEvent.pointerMove(root, { clientX: 200 + dx, clientY: 200 + dy, pointerId: 1 }) })
  }
  act(() => { fireEvent.pointerUp(root, { clientX: 200 + dx, clientY: 200 + dy, pointerId: 1 }) })
}

describe("LgCanvas2D gesture commits", () => {
  it("mounting alone never calls onConfigChange", () => {
    const { onConfigChange } = renderCanvas()
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  it.each([
    ["image body", "img"],
    ["image corner handle", "[data-testid=lg-image-handle-hit]"],
    ["casing handle", "[data-testid=lg-casing-handle-hit]"],
  ])("a click on the %s writes nothing (zero travel)", (_label, selector) => {
    const { onConfigChange, container } = renderCanvas()
    gesture(container.querySelector(selector)!, container.querySelector("img")!.parentElement!, 0, 0)
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  it.each([
    ["image body", "img"],
    ["image corner handle", "[data-testid=lg-image-handle-hit]"],
    ["casing handle", "[data-testid=lg-casing-handle-hit]"],
  ])("a click on the %s with sub-threshold tremor writes nothing", (_label, selector) => {
    const { onConfigChange, container } = renderCanvas()
    gesture(container.querySelector(selector)!, container.querySelector("img")!.parentElement!, 2, -1)
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  it("a real drag past the threshold still commits shadow_offset_x/y", () => {
    const { onConfigChange, container } = renderCanvas()
    gesture(container.querySelector("img")!, container.querySelector("img")!.parentElement!, 20, -40)
    expect(onConfigChange).toHaveBeenCalledTimes(1)
    const next = onConfigChange.mock.calls[0][0]
    expect(next.shadow_offset_x).toBeGreaterThan(0)
    expect(next.shadow_offset_y).toBeGreaterThan(0)
  })

  it("a real drag on an image corner handle still commits the resize", () => {
    const { onConfigChange, container } = renderCanvas()
    gesture(container.querySelector("[data-testid=lg-image-handle-hit]")!, container.querySelector("img")!.parentElement!, 30, 30)
    expect(onConfigChange).toHaveBeenCalledTimes(1)
    expect(onConfigChange.mock.calls[0][0].auto_fit_mask).toBe(false)
  })
})

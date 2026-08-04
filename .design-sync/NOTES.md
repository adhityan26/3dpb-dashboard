# design-sync notes — @3pb/ui

## Build setup
- No build script in `packages/ui` — synth-entry mode (`--entry packages/ui/src/index.ts` was tried first
  but resolveDistEntry treats the raw `exports['.']` path as a resolved entry, so it never actually
  triggers synth; `componentSrcMap` pinning all 6 components to their `src/*.tsx` paths is what actually
  makes them discoverable). If a real build is added later (tsup/tsc → `dist/`), drop `componentSrcMap`
  and re-sync — the `.d.ts`-driven path will give stronger prop contracts.
- `--node-modules apps/dashboard/node_modules` (react 19 resolves there; root `node_modules` is pnpm-strict
  and has no `react` symlink; `packages/ui/node_modules` doesn't exist).
- Node on this machine (`~/.nvm/versions/node/v22.21.1`) is an **x64 build running on arm64 Darwin** — esbuild
  needs `@esbuild/darwin-x64` installed explicitly in `.ds-sync/node_modules`, not the arm64 one npm picks by
  default when a different (arm64) npm/node happens to be on PATH. Always `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`
  before any `.ds-sync` npm/node command so the arch stays consistent.
- Playwright chromium was already cached at `~/Library/Caches/ms-playwright/chromium-1228` (macOS path, not
  the `~/.cache/ms-playwright` Linux path) — installed `playwright@1.61.0` + `playwright-core@1.61.0` (the
  version that pins revision 1228) to match without a fresh 200MB download. Run validate/capture with
  `PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"` set.

## CSS gap — `cfg.cssEntry` override
`packages/ui/src/glass.css` only defines the `.g-*`/`.glass-*` theme classes — it does NOT include Tailwind
utilities (`flex`, `px-4`, `rounded-[10px]`, etc.) that every component's `className` also depends on;
Tailwind is provided by the host app (`apps/dashboard`) at build time, which design-sync bundling doesn't do.
Without it, previews rendered with no padding/sizing/layout (`RENDER_BLANK` on 4/6 components).

**Fix applied:** created `packages/ui/src/design-sync-preview.css` — glass.css content verbatim + a minimal
hand-written subset of exactly the Tailwind utility classes these 6 components use (enumerated via
`grep -ohE 'className=...' src/*.tsx`). `cfg.cssEntry` points there instead of `src/glass.css`.

**Re-sync risk:** this file is NOT auto-generated — if a component's `className` list changes (new Tailwind
utility added, e.g. a new spacing/rounding value), `design-sync-preview.css` will silently miss it and that
class renders unstyled in the next re-sync's previews. Check new/changed `className` strings against the
utility subset in that file whenever a component changes, and add the missing rule.

## Known render warns
- None currently — all 6 components render cleanly with 0 `RENDER_BLANK`/`RENDER_THIN` after previews were authored.
- `GlassButton`'s `Disabled` cell looks nearly identical to `Default` — the component defines no explicit
  disabled style, so this is real (native browser default), not a preview defect.

## Preview scope
All 6 exported components authored (not floor cards): GlassButton, GlassCard, GlassInput, HexColorSwatch,
HexColorPicker, CalcSection (composes GlassCard + GlassInput).

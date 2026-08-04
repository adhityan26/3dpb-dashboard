# @3pb/ui conventions

**@3pb/ui** is a tiny "Glass" theme kit for 3DPB's internal dashboard (Next.js). It has no provider/root
wrapper to set up — every component is a plain, unstyled-by-default element that reads CSS custom
properties and a small set of utility classes. Just import and use.

## Styling idiom

This is a **hybrid** system: components read CSS custom properties (the theme) via a handful of named
classes, but layout/spacing on top of them is expected to come from **Tailwind utility classes** (the host
app ships Tailwind; this kit does not). When composing with these components, use ordinary Tailwind
classes (`flex`, `gap-3`, `px-4`, `rounded-[10px]`, `text-sm`, etc.) for layout — they are NOT part of this
kit's own CSS and won't be present unless the app's own Tailwind build processes them.

Theme classes this kit DOES ship (from `styles.css`'s import closure):
- `.g-card` / `.g-inner` — card and nested-panel backgrounds+borders
- `.g-t1` … `.g-t5` — text color tiers, t1 highest contrast → t5 decorative only (never body text)
- `.g-accent`, `.g-success`, `.g-warning`, `.g-error`, `.g-info` — semantic text colors
- `.g-btn-ghost` — ghost button background/border/text (used by `GlassButton`)
- `.glass-card` — heavier frosted-glass variant (blur + shadow), separate from `.g-card`
- `.glass-input` — text input styling (used by `GlassInput`)
- `.bg-glass-page` — full-page gradient background
- Dark mode: add class `.dark` to an ancestor — every token above has a `.dark` override.

Tokens are CSS custom properties on `:root`/`.dark`, e.g. `var(--g-accent)`, `var(--g-card-border)` — use
these directly in inline styles for anything the class list above doesn't cover (see `CalcSection`'s icon
badge background for an example: `color-mix(in srgb, var(--g-accent) 15%, transparent)`).

## Where the truth lives

Read `_ds/glass/styles.css` (and its `@import`) before styling anything — it's the complete, real
stylesheet. Read each component's `.d.ts` for its exact prop shape (most just spread native HTML
attributes, e.g. `GlassButton` takes all `ButtonHTMLAttributes<HTMLButtonElement>`).

## Example — composing a calculator section

```tsx
import { CalcSection, GlassInput, GlassButton } from '@3pb/ui'

<CalcSection title="Produksi (Cetak 3D)" subtitle="Bahan, waktu, dan tenaga kerja" icon="🖨️" subtotal="Rp29.370">
  <div className="flex flex-col gap-2">
    <GlassInput placeholder="Berat filament (gram)" defaultValue={85} />
    <GlassInput placeholder="Waktu cetak (jam)" defaultValue="3.5" />
  </div>
</CalcSection>
```

Note `CalcSection` composes `GlassCard` internally — never wrap it in another `GlassCard`.

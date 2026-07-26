import { describe, it, expect } from 'vitest'
import * as hooks from '../use-cyd-field-presets'

// NOTE: This test suite is a minimal smoke test, not a behavioral test.
// use-cyd-field-presets.ts exports React Query hooks (useQuery/useMutation) whose
// queryFn/mutationFn closures are not exported separately — they can only be invoked
// through React's hook-call machinery, which requires rendering inside a component
// tree (QueryClientProvider). This vitest config runs with `environment: 'node'` and
// this codebase has no @testing-library/react or jsdom dependency available (confirmed:
// not present in package.json, and Task 6 of this feature's implementation explicitly
// notes the same constraint). Without a DOM/render environment, `renderHook` is not
// available, so we cannot invoke these hooks or observe the fetch calls their
// queryFn/mutationFn closures make.
//
// This suite therefore only verifies the module's public shape: it imports without
// throwing, and each expected hook is exported as a function. If @testing-library/react
// + jsdom are added to this project later, this file should be replaced with real
// behavioral tests (mock global.fetch, renderHook, assert URL/method/body per hook).
describe('use-cyd-field-presets module shape', () => {
  it('exports useCydFieldPresets as a function', () => {
    expect(typeof hooks.useCydFieldPresets).toBe('function')
  })

  it('exports useCreateCydFieldPreset as a function', () => {
    expect(typeof hooks.useCreateCydFieldPreset).toBe('function')
  })

  it('exports useUpdateCydFieldPreset as a function', () => {
    expect(typeof hooks.useUpdateCydFieldPreset).toBe('function')
  })

  it('exports useDeleteCydFieldPreset as a function', () => {
    expect(typeof hooks.useDeleteCydFieldPreset).toBe('function')
  })
})

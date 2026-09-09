import { describe, it, expect } from 'vitest'
import * as hooks from '../use-working-projects'

// NOTE: minimal smoke test mirroring use-cyd-field-presets.test.ts — verifies module
// shape only. useWorkingProjects wraps react-query's useQuery whose queryFn closure
// can only be exercised via renderHook inside a QueryClientProvider; behavioral
// coverage of the data shape lives in WorkingProjectOrdersTab.test.tsx, which mocks
// this hook directly.
describe('use-working-projects module shape', () => {
  it('exports useWorkingProjects as a function', () => {
    expect(typeof hooks.useWorkingProjects).toBe('function')
  })
})

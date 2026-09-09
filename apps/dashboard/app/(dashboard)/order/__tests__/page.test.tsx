// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// order/page.tsx reads channel/tab via next/navigation's useSearchParams + useRouter.
// There's no AppRouterContext in this test environment, so mock the hooks to read
// straight off window.location (which `withParams` below rewrites per-test).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

import OrderPage from '../page'

function withParams(search: string) {
  Object.defineProperty(window, 'location', { value: new URL(`http://x/order${search}`), writable: true })
}

describe('OrderPage channel/tab routing', () => {
  it('defaults to the working-project channel with no query params', () => {
    withParams('')
    render(<OrderPage />)
    expect(screen.getByTestId('working-project-channel')).toBeInTheDocument()
  })

  it('renders the green-lantern-ring tab from ?channel=working-project&tab=green-lantern-ring', () => {
    withParams('?channel=working-project&tab=green-lantern-ring')
    render(<OrderPage />)
    expect(screen.getByTestId('wp-tab-green-lantern-ring')).toBeInTheDocument()
  })
})

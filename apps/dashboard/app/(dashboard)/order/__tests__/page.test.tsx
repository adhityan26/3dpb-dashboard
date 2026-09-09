// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// order/page.tsx reads channel/tab via next/navigation's useSearchParams + useRouter.
// There's no AppRouterContext in this test environment, so mock the hooks to read
// straight off window.location (which `withParams` below rewrites per-test).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

// Shopee row data — enough for OrderRow to render without hitting the network.
vi.mock('@/lib/hooks/use-orders', () => ({
  useOrders: () => ({
    data: {
      orders: [
        {
          orderSn: 'S1', shopeeStatus: 'READY_TO_SHIP', createTime: 0, updateTime: 0,
          totalAmount: 10000, currency: 'IDR', buyerUsername: 'budi',
          items: [{ productName: 'Vas Bunga', variantName: null, sku: null, qty: 1, unitPrice: 10000, imageUrl: null }],
          labelPrinted: false, labelPrintedAt: null, labelPrintedBy: null, isPreOrder: false,
          shipByDate: null, shippingCarrier: null,
        },
      ],
      kpi: { total: 1, orderBaru: 1, perluCetak: 0, sudahDiproses: 0 },
      fetchedAt: new Date().toISOString(),
    },
    isLoading: false, isError: false, error: null, refetch: vi.fn(), dataUpdatedAt: 0,
  }),
  useMarkLabel: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}))
vi.mock('@/lib/hooks/use-invoice', () => ({ useInvoiceList: () => ({ data: [] }) }))

// Tokopedia row data.
vi.mock('@/lib/hooks/use-tokopedia', () => ({
  useTokopediaSession: () => ({ data: { exists: true, expired: false } }),
  useTokopediaOrders: () => ({
    data: {
      totalCount: 1,
      orders: [
        {
          orderId: 'T1', statusCode: 110, statusLabel: 'Perlu Dikirim',
          products: [{ name: 'Topeng', variant: '', qty: 1, totalPrice: 10000, imageUrl: null }],
          courier: null, serviceType: null, shippingType: null, trackingNo: null,
          latestLogistic: null, grandTotal: 10000, subTotal: 10000, buyerNickname: 'ani',
          orderDate: null, latestRtsTime: null, payMethod: null, isPreOrder: false, note: null,
        },
      ],
    },
    isLoading: false, isError: false, error: null,
  }),
  useTokopediaOrder: () => ({ data: undefined }),
}))

import OrderPage from '../page'

function withParams(search: string) {
  Object.defineProperty(window, 'location', { value: new URL(`http://x/order${search}`), writable: true })
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <OrderPage />
    </QueryClientProvider>
  )
}

describe('OrderPage channel/tab routing', () => {
  it('defaults to the working-project channel with no query params', () => {
    withParams('')
    renderPage()
    expect(screen.getByTestId('working-project-channel')).toBeInTheDocument()
  })

  it('renders the green-lantern-ring tab from ?channel=working-project&tab=green-lantern-ring', () => {
    withParams('?channel=working-project&tab=green-lantern-ring')
    renderPage()
    expect(screen.getByTestId('wp-tab-green-lantern-ring')).toBeInTheDocument()
  })
})

describe('Buat Working Project row action', () => {
  it('shows a Buat Working Project action on each Shopee order row', () => {
    withParams('?channel=shopee')
    renderPage()
    expect(screen.getByText('📋 Buat Working Project')).toBeInTheDocument()
  })

  it('shows a Buat Working Project action on each Tokopedia order row', () => {
    withParams('?channel=tokopedia')
    renderPage()
    expect(screen.getByText('📋 Buat Working Project')).toBeInTheDocument()
  })
})

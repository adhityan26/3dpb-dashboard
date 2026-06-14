import { fetchAllKeycapOrders } from '@/lib/keycap/sanity-helpers'
import { KEYCAP_STATUS_LABELS } from '@/lib/keycap/types'
import type { KeycapStatus } from '@/lib/sanity/types'
import Link from 'next/link'

const STATUS_FILTER: { label: string; value: KeycapStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: '🆕 Pending', value: 'pending' },
  { label: '✅ Confirmed', value: 'confirmed' },
  { label: '🖨️ Printing', value: 'printing' },
  { label: '📦 Done', value: 'done' },
  { label: '❌ Cancelled', value: 'cancelled' },
]

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function KeycapOrdersPage({ searchParams }: Props) {
  const { status } = await searchParams
  const activeStatus = (status as KeycapStatus | 'all') ?? 'all'

  const allOrders = await fetchAllKeycapOrders()
  const orders =
    activeStatus === 'all'
      ? allOrders
      : allOrders.filter((o) => o.status === activeStatus)

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Keycap Orders</h1>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTER.map(({ label, value }) => (
          <Link
            key={value}
            href={value === 'all' ? '/keycap' : `/keycap?status=${value}`}
            className={[
              'rounded-full px-3 py-1 text-sm font-medium border',
              activeStatus === value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'text-gray-600 border-gray-300 hover:border-gray-500',
            ].join(' ')}
          >
            {label}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">No orders found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Config</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr key={order._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold">{order.orderNumber}</td>
                  <td className="px-4 py-3">
                    <div>{order.customerName}</div>
                    <div className="text-xs text-gray-400">{order.customerPhone}</div>
                  </td>
                  <td className="px-4 py-3">
                    {order.qty} key · {order.orientation}
                  </td>
                  <td className="px-4 py-3">
                    {KEYCAP_STATUS_LABELS[order.status] ?? order.status}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(order.submittedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/keycap/${order._id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Detail →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

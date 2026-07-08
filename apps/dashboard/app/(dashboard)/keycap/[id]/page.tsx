import { notFound } from 'next/navigation'
import { fetchKeycapOrderById, patchKeycapOrderStatus } from '@/lib/keycap/sanity-helpers'
import { KEYCAP_STATUS_LABELS } from '@/lib/keycap/types'
import type { KeycapStatus } from '@/lib/sanity/types'
import Link from 'next/link'

interface Props {
  params: Promise<{ id: string }>
}

const STATUSES: KeycapStatus[] = ['pending', 'confirmed', 'printing', 'done', 'cancelled']

export default async function KeycapOrderDetailPage({ params }: Props) {
  const { id } = await params
  const order = await fetchKeycapOrderById(id)
  if (!order) notFound()

  async function updateStatus(formData: FormData) {
    'use server'
    const status = formData.get('status') as KeycapStatus
    const statusNote = (formData.get('statusNote') as string) || null
    if (!STATUSES.includes(status)) return
    await patchKeycapOrderStatus(id, status, statusNote)
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/landing?section=keycap-orders" className="text-sm text-gray-400 hover:text-gray-700">← Orders</Link>
        <h1 className="text-xl font-semibold font-mono">{order.orderNumber}</h1>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
          {KEYCAP_STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      {/* Customer info */}
      <section className="rounded-lg border border-gray-200 p-4 space-y-2">
        <h2 className="font-semibold text-sm text-gray-500 uppercase">Customer</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-gray-500">Name</span><span>{order.customerName}</span>
          <span className="text-gray-500">Phone</span><span>{order.customerPhone}</span>
          <span className="text-gray-500">Submitted</span>
          <span>{new Date(order.submittedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</span>
        </div>
      </section>

      {/* Order config */}
      <section className="rounded-lg border border-gray-200 p-4 space-y-3">
        <h2 className="font-semibold text-sm text-gray-500 uppercase">Configuration</h2>
        <div className="text-sm space-y-1">
          <div><span className="text-gray-500 w-24 inline-block">Qty</span>{order.qty}</div>
          <div><span className="text-gray-500 w-24 inline-block">Orientation</span>{order.orientation}</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-24">Body Color</span>
            <span
              className="inline-block w-5 h-5 rounded-full border border-gray-300"
              style={{ background: order.bodyColor.hex }}
            />
            <span>{order.bodyColor.name} ({order.bodyColor.hex})</span>
          </div>
        </div>

        {/* Keys table */}
        <div className="overflow-x-auto rounded border border-gray-100 mt-3">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Char</th>
                <th className="px-3 py-2 text-left">Font</th>
                <th className="px-3 py-2 text-left">Base</th>
                <th className="px-3 py-2 text-left">Text</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.keys.map((k) => (
                <tr key={k._key}>
                  <td className="px-3 py-2">{k.position}</td>
                  <td className="px-3 py-2 font-mono font-bold text-base">{k.char}</td>
                  <td className="px-3 py-2">{k.font}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full border border-gray-300 inline-block" style={{ background: k.baseColor.hex }} />
                      {k.baseColor.name}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full border border-gray-300 inline-block" style={{ background: k.textColor.hex }} />
                      {k.textColor.name}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Admin: status update */}
      <section className="rounded-lg border border-gray-200 p-4 space-y-3">
        <h2 className="font-semibold text-sm text-gray-500 uppercase">Admin</h2>
        <form action={updateStatus} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Status</label>
            <select name="status" defaultValue={order.status}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm">
              {STATUSES.map((s) => (
                <option key={s} value={s}>{KEYCAP_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Status Note (optional)</label>
            <input type="text" name="statusNote" defaultValue={order.statusNote ?? ''}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          {order.adminNotes && (
            <div className="rounded bg-yellow-50 border border-yellow-200 p-2 text-xs text-yellow-800">
              <strong>Admin notes:</strong> {order.adminNotes}
            </div>
          )}
          <button type="submit"
            className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700">
            Update Status
          </button>
        </form>
      </section>
    </div>
  )
}

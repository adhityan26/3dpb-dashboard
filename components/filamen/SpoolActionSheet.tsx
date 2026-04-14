"use client"

import type { SpoolData } from "@/lib/filamen/types"

interface SpoolActionSheetProps {
  spool: SpoolData
  onEdit: (spool: SpoolData) => void
  onPrint: (spool: SpoolData) => void
  onScanNfc: () => void  // opens scan modal; user scans tag → NfcLinkModal handles the link
  onClose: () => void
}

export function SpoolActionSheet({ spool, onEdit, onPrint, onScanNfc, onClose }: SpoolActionSheetProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl pb-safe">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <div
            className="w-8 h-8 rounded-full border-2 border-gray-200 dark:border-slate-600 flex-shrink-0"
            style={{ backgroundColor: spool.colorHex }}
          />
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-slate-100">
              {spool.brand} {spool.colorName}
            </div>
            <div className="text-xs text-gray-400 dark:text-slate-500">{spool.material}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 space-y-2">
          <button
            onClick={() => { onEdit(spool); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 text-left transition-colors"
          >
            <span className="text-lg">✏️</span>
            <span className="text-sm font-medium text-gray-800 dark:text-slate-100">Edit info spool</span>
          </button>
          <button
            onClick={() => { onPrint(spool); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 text-left transition-colors"
          >
            <span className="text-lg">🏷</span>
            <span className="text-sm font-medium text-gray-800 dark:text-slate-100">Print stiker barcode</span>
          </button>
          <button
            onClick={() => { onScanNfc(); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 text-left transition-colors"
          >
            <span className="text-lg">📡</span>
            <span className="text-sm font-medium text-gray-800 dark:text-slate-100">Link NFC tag</span>
          </button>
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center px-4 py-3 rounded-xl text-sm text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </>
  )
}

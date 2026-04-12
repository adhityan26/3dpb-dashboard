'use client'

import { useState } from 'react'
import { SpoolTab } from './SpoolTab'
import { AmsTab } from './AmsTab'

type FilamenSubTab = 'spool' | 'ams'

export function FilamenTab() {
  const [active, setActive] = useState<FilamenSubTab>('spool')

  return (
    <div>
      {/* Sub-sub-tab nav */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActive('spool')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === 'spool'
              ? 'border-[#EE4D2D] text-[#EE4D2D]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Spool
        </button>
        <button
          onClick={() => setActive('ams')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === 'ams'
              ? 'border-[#EE4D2D] text-[#EE4D2D]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Urutan AMS
        </button>
      </div>

      {active === 'spool' ? <SpoolTab /> : <AmsTab />}
    </div>
  )
}

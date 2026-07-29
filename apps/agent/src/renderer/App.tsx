import { useEffect, useState } from 'react'
import { ActivationScreen } from './screens/ActivationScreen'
import { PairingScreen } from './screens/PairingScreen'
import type { SaasDevice } from '../main/saas-client'

export default function App() {
  const [activated, setActivated] = useState(false)
  const [devices, setDevices] = useState<SaasDevice[]>([])
  const [allPaired, setAllPaired] = useState(false)

  useEffect(() => {
    if (!activated) return
    let cancelled = false
    window.agentApi.sync().then((result) => {
      if (!cancelled && result.ok) setDevices(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [activated])

  if (!activated) {
    return <ActivationScreen onActivated={() => setActivated(true)} />
  }

  if (!allPaired) {
    return <PairingScreen devices={devices} onAllPaired={() => setAllPaired(true)} />
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      Semua device sudah dipasangkan — lanjut dashboard (Task 13)
    </div>
  )
}

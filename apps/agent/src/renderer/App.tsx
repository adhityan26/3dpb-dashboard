import { useState } from 'react'
import { ActivationScreen } from './screens/ActivationScreen'
import { PairingScreen } from './screens/PairingScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import type { SaasDevice } from '../main/saas-client'

type Step = 'activation' | 'pairing' | 'dashboard'

export default function App() {
  const [step, setStep] = useState<Step>('activation')
  const [devices, setDevices] = useState<SaasDevice[]>([])

  if (step === 'activation') {
    return (
      <ActivationScreen
        onActivated={(activatedDevices) => {
          // `activatedDevices` datang langsung dari hasil sukses `agent:activate` (yang di
          // baliknya sudah `fetchDevices` — lihat ipc.ts) — bukan dari fetch kedua yang
          // terpisah setelah aktivasi. ActivationScreen HANYA memanggil callback ini saat
          // result.ok === true (lihat handleSubmit), jadi tak ada jalur di sini yang bisa
          // menerima daftar device "gagal" secara diam-diam (gap B3 review Task 12).
          setDevices(activatedDevices)
          setStep('pairing')
        }}
      />
    )
  }
  if (step === 'pairing') {
    return <PairingScreen devices={devices} onAllPaired={() => setStep('dashboard')} />
  }
  return <DashboardScreen />
}

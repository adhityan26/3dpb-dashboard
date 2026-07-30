import { useEffect, useState } from 'react'
import { AgentShell } from './AgentShell'
import { ActivationScreen } from './screens/ActivationScreen'
import { PairingScreen } from './screens/PairingScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import type { SaasDevice } from '../main/saas-client'

type Step = 'loading' | 'activation' | 'pairing' | 'dashboard'

export default function App() {
  const [step, setStep] = useState<Step>('loading')
  const [devices, setDevices] = useState<SaasDevice[]>([])
  const [initialPairedShortCodes, setInitialPairedShortCodes] = useState<string[]>([])
  // true HANYA untuk transisi "pairing baru selesai" -> Dashboard. Saat itu main process
  // belum punya Engine sama sekali (bootstrap() jalan sebelum device dipasangkan), jadi
  // Dashboard harus memicu agent:sync sendiri; kalau tidak, user pendatang baru mendarat di
  // dashboard kosong tanpa penjelasan dan CYD tak pernah menerima layout-nya.
  const [syncAfterPairing, setSyncAfterPairing] = useState(false)

  // Sekali di awal: tanya main process apa yang SUDAH tersimpan (token + device mana yang
  // sudah dipasangkan) lewat agent:get-activation-state, biar user relaunch app tak perlu
  // ulang paste token + isi ulang access code semua printer tiap buka (Task 13 review
  // Finding 2). Tanpa token -> mulai dari aktivasi seperti biasa. Ada token & SEMUA device
  // yang diketahui sudah dipasangkan (termasuk kasus 0 device -- vacuously true) -> langsung
  // dashboard. Ada token tapi belum semua dipasangkan -> pairing, pre-seed status paired-nya.
  useEffect(() => {
    let cancelled = false
    window.agentApi
      .getActivationState()
      .then((state) => {
        if (cancelled) return
        if (!state.hasToken) {
          setStep('activation')
          return
        }
        setDevices(state.devices)
        setInitialPairedShortCodes(state.pairedShortCodes)
        const allKnownDevicesPaired = state.devices.every((d) => state.pairedShortCodes.includes(d.shortCode))
        setStep(allKnownDevicesPaired ? 'dashboard' : 'pairing')
      })
      .catch((err) => {
        console.error('[app] gagal ambil activation state, mulai dari layar aktivasi', err)
        if (!cancelled) setStep('activation')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (step === 'loading') {
    return (
      <AgentShell>
        <p className="g-t2 text-sm">Memuat...</p>
      </AgentShell>
    )
  }

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
          setInitialPairedShortCodes([]) // aktivasi baru -- belum ada device yang dipasangkan
          setStep('pairing')
        }}
      />
    )
  }
  if (step === 'pairing') {
    return (
      <PairingScreen
        devices={devices}
        initialPairedShortCodes={initialPairedShortCodes}
        onAllPaired={() => {
          setSyncAfterPairing(true)
          setStep('dashboard')
        }}
      />
    )
  }
  return <DashboardScreen initialSync={syncAfterPairing} />
}

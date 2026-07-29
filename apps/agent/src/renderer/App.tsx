import { useState } from 'react'
import { ActivationScreen } from './screens/ActivationScreen'

export default function App() {
  const [activated, setActivated] = useState(false)

  if (!activated) {
    return <ActivationScreen onActivated={() => setActivated(true)} />
  }

  return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Aktivasi sukses — lanjut pairing (Task 12)</div>
}

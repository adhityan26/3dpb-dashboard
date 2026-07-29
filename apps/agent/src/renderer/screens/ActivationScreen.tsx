import { useState } from "react";

export function ActivationScreen({ onActivated }: { onActivated: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await window.agentApi.activate(token);
      if (!result.ok) {
        if (result.kind === "invalid_token") {
          setError("Token tidak valid — generate ulang token dari halaman Settings web Slizebiz.");
        } else if (result.kind === "entitlement_expired") {
          setError("Akses Pro kamu sudah berakhir — perbarui langganan buat lanjut monitoring.");
        } else {
          setError("Gagal konek ke server Slizebiz. Cek koneksi internet, lalu coba lagi.");
        }
        return;
      }
      onActivated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Aktivasi Agent</h1>
      <label htmlFor="token-input">Token Agent</label>
      <input
        id="token-input"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={submitting}
      />
      <button onClick={handleSubmit} disabled={submitting}>
        Aktifkan
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

import { useState } from "react";
import type { SaasDevice } from "../../main/saas-client";
import { AgentShell } from "../AgentShell";
import { GlassButton, GlassInput } from "@3pb/ui";

export function ActivationScreen({ onActivated }: { onActivated: (devices: SaasDevice[]) => void }) {
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
        } else if (result.kind === "wrong_server") {
          setError("Server yang dituju bukan app Slizebiz (balas halaman web, bukan data) — build Agent ini salah alamat server, hubungi 3D Printing Bandung buat installer yang benar.");
        } else {
          setError("Gagal konek ke server Slizebiz. Cek koneksi internet, lalu coba lagi.");
        }
        return;
      }
      onActivated(result.data);
    } catch (err) {
      // Tanpa catch, IPC yang reject (main process belum siap / handler throw) cuma bikin
      // tombol aktif lagi tanpa pesan apa pun — user tak tahu harus apa. Konsisten dengan
      // pola savePairing() di PairingScreen.
      console.error("[activation] agent:activate gagal", err);
      setError("Gagal menjalankan aktivasi. Tutup lalu buka lagi aplikasinya, kemudian coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AgentShell>
      <h1 className="g-t1 text-lg font-semibold mb-4">Aktivasi Agent</h1>
      <label htmlFor="token-input" className="g-t2 text-sm block mb-1.5">
        Token Agent
      </label>
      <div className="flex gap-2">
        <GlassInput
          id="token-input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={submitting}
          className="flex-1"
        />
        <GlassButton onClick={handleSubmit} disabled={submitting}>
          Aktifkan
        </GlassButton>
      </div>
      {error && (
        <p role="alert" className="g-error text-sm mt-3">
          {error}
        </p>
      )}
    </AgentShell>
  );
}

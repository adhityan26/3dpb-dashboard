"use client";
import { useEffect, useState } from "react";

type TokenMeta = { id: string; createdAt: string; revokedAt: string | null; lastUsedAt: string | null };

export function AgentTokenSection() {
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  function refresh() {
    fetch("/api/agent-tokens").then((r) => r.json()).then(setTokens);
  }

  useEffect(() => refresh(), []);

  async function handleGenerate() {
    const res = await fetch("/api/agent-tokens", { method: "POST" });
    const body = await res.json();
    setFreshToken(body.token);
    refresh();
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/agent-tokens/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="g-card p-4">
      <h3 className="text-[14px] font-semibold mb-2">Agent Token</h3>
      <p className="text-[12px] g-t4 mb-3">Token buat Agent (aplikasi di komputermu) autentikasi ke server.</p>

      {freshToken && (
        <div className="mb-3 p-2 rounded-md border border-amber-500/40 bg-amber-500/5">
          <p className="text-[11px] mb-1">Token cuma tampil sekali, simpan baik-baik:</p>
          <code className="text-[12px] break-all">{freshToken}</code>
        </div>
      )}

      <button type="button" onClick={handleGenerate} className="text-[12px] px-3 py-1.5 rounded-md mb-3" style={{ background: "var(--g-accent)", color: "#fff" }}>
        Generate token baru
      </button>

      <ul className="space-y-1">
        {tokens.map((t) => (
          <li key={t.id} className="text-[12px] flex items-center justify-between">
            <span>{t.id.slice(0, 8)}… {t.revokedAt ? "(revoked)" : ""}</span>
            {!t.revokedAt && (
              <button type="button" onClick={() => handleRevoke(t.id)} className="text-[11px] text-red-500">
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

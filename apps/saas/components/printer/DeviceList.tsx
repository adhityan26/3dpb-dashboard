"use client";
import { useEffect, useState } from "react";

type Device = { id: string; label: string; printerType: string };

export function DeviceList({ paidCore }: { paidCore: boolean }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(paidCore);

  useEffect(() => {
    if (!paidCore) return;
    fetch("/api/devices")
      .then((r) => r.json())
      .then(setDevices)
      .finally(() => setLoading(false));
  }, [paidCore]);

  if (!paidCore) {
    return (
      <div className="g-card p-6 text-center">
        <p className="text-[13px] g-t4">🔒 Fitur monitoring printer perlu Pro. Buka dengan Pro untuk daftarkan printer & atur layout CYD.</p>
      </div>
    );
  }

  async function handleAdd() {
    setError(null);
    const label = `Printer ${devices.length + 1}`;
    const res = await fetch("/api/devices", {
      method: "POST",
      body: JSON.stringify({ label, printerType: "bambu" }),
    });
    if (!res.ok) {
      const body = await res.json();
      if (body.error === "slot_limit_exceeded") {
        setError(`Batas ${body.limit} printer sudah tercapai. Tambah slot lewat Subscribe/add-on.`);
      } else {
        setError("Gagal menambah printer.");
      }
      return;
    }
    const created = await res.json();
    setDevices((prev) => [...prev, created]);
  }

  if (loading) return <p className="text-[12px] g-t4">Memuat...</p>;

  return (
    <div className="g-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold">Printer ({devices.length})</h3>
        <button type="button" onClick={handleAdd} className="text-[12px] px-3 py-1.5 rounded-md" style={{ background: "var(--g-accent)", color: "#fff" }}>
          + Tambah
        </button>
      </div>
      {error && <p className="text-[12px] text-red-500 mb-2">{error}</p>}
      <ul className="space-y-2">
        {devices.map((d) => (
          <li key={d.id} className="text-[13px] flex items-center justify-between">
            <span>{d.label}</span>
            <span className="g-t4 text-[11px]">{d.printerType}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

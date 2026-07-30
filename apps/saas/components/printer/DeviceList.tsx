"use client";
import { useEffect, useState } from "react";
import { PRINTER_TYPES, PRINTER_TYPE_LABELS, PRINTER_MODEL_SUGGESTIONS, type PrinterType } from "@/lib/devices/printer-types";
import { LAYOUT_LIMITS } from "@3pb/cyd-layout-schema";

type Device = { id: string; label: string; printerType: string; model: string | null };

export function DeviceList({ paidCore }: { paidCore: boolean }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [printerType, setPrinterType] = useState<PrinterType>(PRINTER_TYPES[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [model, setModel] = useState("");
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(paidCore);

  useEffect(() => {
    if (!paidCore) return;
    // GET balas { devices, limit } (bukan array telanjang) — `limit` dipakai buat "X/Y slot terpakai".
    fetch("/api/devices")
      .then((r) => r.json())
      .then((body) => {
        setDevices(Array.isArray(body?.devices) ? body.devices : []);
        setLimit(typeof body?.limit === "number" ? body.limit : null);
      })
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
      body: JSON.stringify({ label, printerType, model }),
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
    setModel(""); // reset input model form-tambah -- tanpa ini nilai lama nyangkut buat device berikutnya (final-review Fix 4)
  }

  function startRename(device: Device) {
    setEditingId(device.id);
    setDraftLabel(device.label);
  }

  async function saveRename(id: string) {
    const label = draftLabel.trim();
    setEditingId(null);
    const current = devices.find((d) => d.id === id);
    if (!label || label === current?.label) return; // tak berubah → jangan buang request
    setError(null);
    const res = await fetch(`/api/devices/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
    if (!res.ok) {
      setError("Gagal mengubah nama printer.");
      return;
    }
    const updated = await res.json();
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, label: updated?.label ?? label } : d)));
  }

  function startEditModel(device: Device) {
    setEditingModelId(device.id);
    setDraftModel(device.model ?? "");
  }

  async function saveModel(id: string) {
    const value = draftModel.trim();
    setEditingModelId(null);
    const current = devices.find((d) => d.id === id);
    if (value === (current?.model ?? "")) return; // tak berubah -> jangan buang request
    setError(null);
    const res = await fetch(`/api/devices/${id}`, { method: "PATCH", body: JSON.stringify({ model: value }) });
    if (!res.ok) {
      setError("Gagal mengubah model printer.");
      return;
    }
    const updated = await res.json();
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, model: updated?.model ?? (value || null) } : d)));
  }

  async function handleDelete(device: Device) {
    // Konfirmasi ringan (pola yang sama dipakai RiwayatList) — hapus device juga membuang cell
    // layout CYD yang mereferensikannya dan tak bisa dibatalkan.
    if (!window.confirm(`Hapus "${device.label}"? Cell layout CYD yang memakainya ikut hilang dan tak bisa dibatalkan.`)) return;
    setError(null);
    // DELETE balas 204 tanpa body — jangan panggil res.json() di jalur sukses.
    const res = await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Gagal menghapus printer.");
      return;
    }
    setDevices((prev) => prev.filter((d) => d.id !== device.id));
  }

  if (loading) return <p className="text-[12px] g-t4">Memuat...</p>;

  return (
    <div className="g-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-[14px] font-semibold">Printer ({devices.length})</h3>
          {limit !== null && (
            <p className="text-[11px] g-t4">
              {devices.length}/{limit} slot terpakai
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Tipe printer"
            value={printerType}
            onChange={(e) => setPrinterType(e.target.value as PrinterType)}
            className="g-inner text-[12px] px-2 py-1.5 rounded-md"
          >
            {PRINTER_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRINTER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <div className="flex flex-col">
            <input
              aria-label="Model printer"
              list="model-suggestions"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model (opsional)"
              className="g-inner text-[12px] px-2 py-1.5 rounded-md w-28"
            />
            {model.length > LAYOUT_LIMITS.maxPrinterModelLength && (
              <span className="mt-1 block text-[10px] leading-relaxed text-red-500">
                Maks {LAYOUT_LIMITS.maxPrinterModelLength} karakter (sekarang {model.length}) — simpan akan ditolak.
              </span>
            )}
          </div>
          <datalist id="model-suggestions">
            {PRINTER_MODEL_SUGGESTIONS[printerType].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button type="button" onClick={handleAdd} className="text-[12px] px-3 py-1.5 rounded-md" style={{ background: "var(--g-accent)", color: "#fff" }}>
            + Tambah
          </button>
        </div>
      </div>
      {error && <p className="text-[12px] text-red-500 mb-2">{error}</p>}
      <ul className="space-y-2">
        {devices.map((d) => (
          <li key={d.id} className="text-[13px] flex items-center justify-between gap-2">
            {editingId === d.id ? (
              <input
                aria-label={`Nama printer ${d.label}`}
                autoFocus
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onBlur={() => saveRename(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename(d.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="g-inner text-[13px] px-2 py-1 rounded-md flex-1 min-w-0"
              />
            ) : (
              <span className="flex-1 min-w-0 truncate">{d.label}</span>
            )}
            <span className="g-t4 text-[11px]">{d.printerType}</span>
            {editingModelId === d.id ? (
              <div className="flex flex-col">
                <input
                  aria-label={`Model printer ${d.label}`}
                  autoFocus
                  value={draftModel}
                  onChange={(e) => setDraftModel(e.target.value)}
                  onBlur={() => saveModel(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveModel(d.id);
                    if (e.key === "Escape") setEditingModelId(null);
                  }}
                  placeholder="mis. P1S"
                  className="g-inner text-[11px] px-1 py-0.5 rounded-md w-24"
                />
                {draftModel.length > LAYOUT_LIMITS.maxPrinterModelLength && (
                  <span className="mt-1 block text-[10px] leading-relaxed text-red-500">
                    Maks {LAYOUT_LIMITS.maxPrinterModelLength} karakter (sekarang {draftModel.length}) — simpan akan ditolak.
                  </span>
                )}
              </div>
            ) : d.model ? (
              <button type="button" onClick={() => startEditModel(d)} className="g-t4 text-[11px] underline" aria-label={`Ubah model ${d.label}`}>
                {d.model}
              </button>
            ) : (
              <button type="button" onClick={() => startEditModel(d)} className="text-[11px] text-amber-500 underline" aria-label={`Isi model ${d.label}`}>
                Model belum diisi
              </button>
            )}
            <button type="button" onClick={() => startRename(d)} className="g-t4 text-[11px] underline" aria-label={`Ubah nama ${d.label}`}>
              Ubah nama
            </button>
            <button type="button" onClick={() => handleDelete(d)} className="text-[11px] text-red-500 underline" aria-label={`Hapus ${d.label}`}>
              Hapus
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

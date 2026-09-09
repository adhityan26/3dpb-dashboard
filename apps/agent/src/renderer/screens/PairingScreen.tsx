import { useEffect, useRef, useState } from "react";
import type { SaasDevice, DiscoveredBambuPrinter, DiscoveredMoonrakerPrinter } from "@3pb/agent-core";
import { AgentShell } from "../AgentShell";
import { GlassButton, GlassCard, GlassInput } from "@3pb/ui";
import { suggestModelFromSsdp, matchDeviceByName } from "@3pb/agent-core";
import { LAYOUT_LIMITS } from "@3pb/cyd-layout-schema";

// Kartu mana yang harus menampilkan form pairing inline -- "device" = baris di kolom Device
// Terdaftar (key: shortCode device itu sendiri, sudah ada di PairingTarget.shortCode);
// "bambu"/"moonraker" = kartu hasil scan (key: serial/ip PRINTER yang di-scan, beda dari
// shortCode device TARGET-nya, karena satu kartu hasil scan bisa dipasangkan ke device
// manapun lewat dropdown).
type PairingSource = { kind: "device" } | { kind: "bambu"; key: string } | { kind: "moonraker"; key: string };

interface PairingTarget {
  shortCode: string;
  ip: string;
  serial: string;
  model: string;
  isManual: boolean;
  source: PairingSource;
}

export function PairingScreen({
  devices,
  onAllPaired,
  initialPairedShortCodes = [],
}: {
  devices: SaasDevice[];
  onAllPaired: () => void;
  // Device yang SUDAH dipasangkan di sesi/launch SEBELUMNYA (secret-nya sudah ada di
  // credential-store) — dioper App.tsx dari `agent:get-activation-state` biar user relaunch
  // tak perlu ulang isi access code buat device yang sudah beres (Task 13 review Finding 2).
  initialPairedShortCodes?: string[];
}) {
  const [scanning, setScanning] = useState(false);
  const [bambuPrinters, setBambuPrinters] = useState<DiscoveredBambuPrinter[]>([]);
  const [moonrakerPrinters, setMoonrakerPrinters] = useState<DiscoveredMoonrakerPrinter[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingTarget | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [pairError, setPairError] = useState<string | null>(null);
  const [modelWarning, setModelWarning] = useState<string | null>(null);
  // shortCode device yang sudah sukses dipasangkan (sesi ini ATAU launch sebelumnya, lewat
  // initialPairedShortCodes) — dipakai supaya onAllPaired() hanya terpanggil sekali SEMUA
  // device terdaftar sudah dipasangkan (bukan setelah device pertama, lihat Task 12 review
  // gap B1).
  const [pairedCodes, setPairedCodes] = useState<Set<string>>(() => new Set(initialPairedShortCodes));
  // Device yang lagi dipilih di dropdown tiap kartu hasil scan, key = serial (Bambu) / ip
  // (Moonraker) printer -- dipisah dari `pairing` karena ini cuma pilihan UI sebelum tombol
  // "Pasangkan" diklik, bukan sesi pairing yang sedang berjalan.
  const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLDivElement>(null);

  // Window Agent cuma 900x670 -- kalau kolom yang lagi dibuka formnya ada di bagian bawah
  // daftar yang panjang, form bisa ke-render di luar viewport tanpa indikasi apa pun buat
  // scroll (dilaporkan langsung, dikonfirmasi lewat DevTools element-picker: klik memang
  // mendarat di tombol yang benar, bukan overlay -- cuma form-nya di luar layar). Form sekarang
  // inline di bawah kartu yang diklik (bukan lagi di paling bawah halaman), tapi safety-net ini
  // tetap dipertahankan buat kartu yang posisinya jauh di bawah.
  useEffect(() => {
    if (pairing) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [pairing]);

  async function handleScan() {
    setScanning(true);
    setScanError(null);
    try {
      const result = await window.agentApi.scanLan();
      if (result.bambu.ok) {
        setBambuPrinters(result.bambu.printers);
      } else {
        setBambuPrinters([]);
        setScanError("Port SSDP Bambu sedang dipakai — tutup BambuStudio dan coba lagi.");
      }
      setMoonrakerPrinters(result.moonraker);
    } finally {
      setScanning(false);
    }
  }

  function startPairing(shortCode: string, ip: string, serial: string, suggestedModel: string, source: PairingSource) {
    // accessCode SENGAJA tidak pernah di-prefill dari hasil scan (tidak ada di paket SSDP
    // maupun mDNS) — user selalu wajib mengetik manual sesuai desain keamanan spec.
    setPairing({ shortCode, ip, serial, model: suggestedModel, isManual: false, source });
    setAccessCode("");
    // Warning dari device SEBELUMNYA (kalau ada) tak relevan lagi buat form device baru ini
    // -- tanpa ini, peringatan model lama nyangkut kelihatan sementara user isi device
    // berikutnya (final-review Fix 3).
    setModelWarning(null);
  }

  function startManualPairing(shortCode: string) {
    setPairing({ shortCode, ip: "", serial: "", model: "", isManual: true, source: { kind: "device" } });
    setAccessCode("");
    setModelWarning(null);
  }

  async function savePairing() {
    if (!pairing) return;
    setPairError(null);
    setModelWarning(null);
    try {
      await window.agentApi.pairDevice(pairing.shortCode, {
        ip: pairing.ip,
        serial: pairing.serial,
        accessCode,
      });
    } catch (err) {
      // IPC rejection (mis. gagal tulis credential-store) TIDAK boleh diam-diam bikin UI
      // beku — device juga TIDAK ditandai "Terpasang" biar user tahu harus coba lagi.
      console.error("[pairing] gagal simpan pairing", err);
      setPairError("Gagal simpan pairing — coba lagi.");
      return;
    }

    // Model diusulkan balik ke SaaS best-effort SETELAH secret lokal tersimpan -- kegagalan di
    // sini TIDAK membatalkan pairing (secret sudah aman), cuma tampil sebagai peringatan ringan
    // (spec §6). Device di SaaS yang model-nya sudah sama tak perlu di-PATCH ulang.
    const modelTrimmed = pairing.model.trim();
    const currentDevice = devices.find((d) => d.shortCode === pairing.shortCode);
    if (modelTrimmed && modelTrimmed !== (currentDevice?.model ?? "")) {
      const result = await window.agentApi.updateDeviceModel(pairing.shortCode, modelTrimmed);
      if (!result.ok) {
        // kind:"invalid_model" berarti SaaS menolak karena panjangnya melebihi batas firmware
        // (LAYOUT_LIMITS.maxPrinterModelLength) -- "coba lagi lewat web" menyesatkan di sini
        // karena mengulang input yang sama lewat web akan ditolak juga (final-review Fix 2b).
        setModelWarning(
          result.kind === "invalid_model"
            ? `Model terlalu panjang (maks ${LAYOUT_LIMITS.maxPrinterModelLength} karakter) — belum tersimpan ke akun.`
            : "Model belum tersimpan ke akun — bisa diisi lewat web.",
        );
      }
    }

    // Hitung set berikutnya di luar functional updater setState — memanggil onAllPaired()
    // (yang men-trigger setState di App, komponen LAIN) dari dalam updater React bisa terjadi
    // saat React sedang render, dan React larang "setState komponen lain saat render komponen
    // ini" (warning). Menghitung `next` di sini (closure biasa, bukan updater) lalu memanggil
    // onAllPaired() sebagai efek samping event handler biasa itu aman.
    const next = new Set(pairedCodes);
    next.add(pairing.shortCode);
    setPairing(null);
    setAccessCode("");
    setPairedCodes(next);
    // onAllPaired() hanya dipanggil kalau SEMUA device di prop `devices` sudah ada di `next`
    // — dengan 1 device (kasus test lama) ini selalu true setelah pairing pertama, jadi
    // perilaku lama tetap sama.
    if (devices.every((d) => next.has(d.shortCode))) onAllPaired();
  }

  // Kebalikan pairing -- buat kasus salah pasang (mis. printer Mars ke-pair ke slot device
  // Mercury): hapus secret device ini biar statusnya balik "belum dipasangkan" dan user bisa
  // isi ulang IP/serial/access code yang benar lewat "Isi manual"/hasil scan seperti biasa.
  async function forgetDevice(shortCode: string) {
    setPairError(null);
    try {
      await window.agentApi.forgetDevice(shortCode);
    } catch (err) {
      console.error("[pairing] gagal lupakan device", err);
      setPairError("Gagal lupakan device — coba lagi.");
      return;
    }
    setPairedCodes((prev) => {
      const next = new Set(prev);
      next.delete(shortCode);
      return next;
    });
    // Form pairing yang lagi kebuka mungkin punya shortCode yang sama (user klik Edit lalu
    // Lupakan tanpa Simpan) -- tutup biar tak nyangkut ngedit device yang secret-nya sudah
    // dihapus.
    setPairing((current) => (current?.shortCode === shortCode ? null : current));
  }

  const unpairedDevices = devices.filter((d) => !pairedCodes.has(d.shortCode));

  // Device yang lagi aktif di dropdown kartu hasil scan `key` (serial Bambu / ip Moonraker):
  // pilihan eksplisit user > rekomendasi nama-cocok > device pertama yang belum dipasangkan.
  function effectiveTarget(key: string, recommended: string | null): string {
    return selectedTargets[key] ?? recommended ?? unpairedDevices[0]?.shortCode ?? "";
  }

  // Dirender inline persis di bawah kartu yang memicunya (baris device / kartu hasil scan) --
  // BUKAN lagi satu blok terpisah di paling bawah halaman. Hanya SATU pemanggilan yang pernah
  // menghasilkan JSX non-null di satu waktu (source di `pairing` cuma cocok dengan tepat satu
  // kartu), jadi id-id di dalamnya (mis. "access-code") tak pernah dobel di DOM.
  function renderPairingForm() {
    if (!pairing) return null;
    // Serial + Access Code cuma relevan buat Bambu (BambuMqttConnector butuh keduanya buat
    // konek MQTT). Moonraker/Klipper cuma pakai IP -- serial dikirim kosong & accessCode
    // diabaikan connector-nya, jadi tak perlu bikin user isi field yang percuma (dan gampang
    // salah paham harus diisi). printerType berasal dari registrasi device di SaaS, dicari
    // dari `devices` (prop), bukan dari pilihan di form ini.
    const isBambu = devices.find((d) => d.shortCode === pairing.shortCode)?.printerType === "bambu";
    return (
      <div ref={formRef} className="mt-3">
        <GlassCard className="p-3 w-full">
          {pairing.isManual && (
            <>
              <label htmlFor="manual-ip" className="g-t2 text-sm block mb-1">
                IP
              </label>
              <GlassInput
                id="manual-ip"
                value={pairing.ip}
                onChange={(e) => setPairing({ ...pairing, ip: e.target.value })}
                className="w-full mb-2"
              />
              {isBambu && (
                <>
                  <label htmlFor="manual-serial" className="g-t2 text-sm block mb-1">
                    Serial
                  </label>
                  <GlassInput
                    id="manual-serial"
                    value={pairing.serial}
                    onChange={(e) => setPairing({ ...pairing, serial: e.target.value })}
                    className="w-full mb-2"
                  />
                </>
              )}
            </>
          )}
          <label htmlFor="model" className="g-t2 text-sm block mb-1">
            Model
          </label>
          <GlassInput
            id="model"
            value={pairing.model}
            onChange={(e) => setPairing({ ...pairing, model: e.target.value })}
            placeholder="mis. P1S"
            className="w-full mb-1"
          />
          {pairing.model.length > LAYOUT_LIMITS.maxPrinterModelLength && (
            <p className="g-warning text-xs mb-2">
              Maks {LAYOUT_LIMITS.maxPrinterModelLength} karakter (sekarang {pairing.model.length}) — simpan akan ditolak.
            </p>
          )}
          {isBambu && (
            <>
              <label htmlFor="access-code" className="g-t2 text-sm block mb-1">
                Access Code
              </label>
              <GlassInput
                id="access-code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full mb-3"
              />
            </>
          )}
          <GlassButton onClick={savePairing}>Simpan Pairing</GlassButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <AgentShell maxWidth="max-w-3xl">
      <h1 className="g-t1 text-lg font-semibold mb-4">Pairing Device</h1>
      <div className="mb-4 flex justify-end">
        {/* Selalu tampil (bukan cuma pas devices kosong) -- user bisa lanjut ke dashboard
            kapan saja, baik dia belum sempat pairing device manapun (akun 0-device, Task 13
            review Finding 3) maupun sengaja mau pairing sisanya belakangan. Dibuat visual
            lebih kecil/redup dari tombol lain (bukan komponen "secondary" terpisah -- @3pb/ui
            cuma py satu varian GlassButton) biar tidak terlihat seperti aksi utama. */}
        <GlassButton onClick={onAllPaired} className="text-xs opacity-70">
          Lanjut ke Dashboard
        </GlassButton>
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <h3 className="g-t2 text-xs font-semibold uppercase tracking-wide mb-2">Device Terdaftar</h3>
          <div className="space-y-2 mb-3">
            {devices.map((d) => {
              const isPaired = pairedCodes.has(d.shortCode);
              const showFormHere = pairing?.source.kind === "device" && pairing.shortCode === d.shortCode;
              return (
                <GlassCard key={d.shortCode} className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="g-t1 text-sm">{d.label}</span>
                    {isPaired ? (
                      <div className="flex items-center gap-2">
                        <span className="g-success text-sm">Terpasang ✓</span>
                        {/* Edit: buka ulang form kosong (bukan prefill) -- access code tak pernah
                            dikirim balik ke renderer demi keamanan, konsisten dengan pairing baru.
                            Skenario nyata: user salah ketik access code atau printer fisik ke-pair
                            ke slot device yang salah. */}
                        <GlassButton onClick={() => startManualPairing(d.shortCode)} className="text-xs">
                          Edit
                        </GlassButton>
                        <GlassButton onClick={() => forgetDevice(d.shortCode)} className="text-xs">
                          Lupakan
                        </GlassButton>
                      </div>
                    ) : (
                      <GlassButton onClick={() => startManualPairing(d.shortCode)} className="text-xs">
                        Isi manual
                      </GlassButton>
                    )}
                  </div>
                  {showFormHere && renderPairingForm()}
                </GlassCard>
              );
            })}
          </div>
          <GlassButton onClick={handleScan} disabled={scanning}>
            {scanning ? "Memindai..." : "Scan LAN"}
          </GlassButton>
          {scanError && (
            <p role="alert" className="g-warning text-sm mt-2">
              {scanError}
            </p>
          )}
        </div>
        <div className="flex-1">
          <h3 className="g-t2 text-xs font-semibold uppercase tracking-wide mb-2">Hasil Scan Bambu</h3>
          <div className="space-y-2">
            {bambuPrinters.map((p) => {
              // Rekomendasi SAJA (spec §6) -- dihitung terhadap unpairedDevices (bukan `devices`)
              // karena device yang sudah dipasangkan tak lagi punya opsi di dropdown buat
              // ditandai; user tetap bebas pilih device manapun.
              const recommendedShortCode = matchDeviceByName(p.name, unpairedDevices);
              const target = effectiveTarget(p.serial, recommendedShortCode);
              const showFormHere = pairing?.source.kind === "bambu" && pairing.source.key === p.serial;
              return (
                <GlassCard key={p.serial} className="p-3">
                  <span className="g-t1 text-sm">
                    {p.ip} ({p.name})
                  </span>
                  {/* Dropdown, bukan satu tombol per device belum-dipasangkan -- kalau device
                      belum-dipasangkan banyak, deretan tombol "Pasangkan ke ..." jadi sangat
                      panjang per kartu hasil scan. */}
                  {unpairedDevices.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <select
                        aria-label={`Pilih device untuk ${p.name}`}
                        className="glass-input rounded-[5px] px-2 h-9 text-xs flex-1"
                        value={target}
                        onChange={(e) => setSelectedTargets((prev) => ({ ...prev, [p.serial]: e.target.value }))}
                      >
                        {unpairedDevices.map((d) => (
                          <option key={d.shortCode} value={d.shortCode}>
                            {d.label}
                            {d.shortCode === recommendedShortCode ? " (disarankan)" : ""}
                          </option>
                        ))}
                      </select>
                      <GlassButton
                        onClick={() =>
                          startPairing(target, p.ip, p.serial, suggestModelFromSsdp(p.model) ?? "", {
                            kind: "bambu",
                            key: p.serial,
                          })
                        }
                        className="text-xs"
                      >
                        Pasangkan
                      </GlassButton>
                    </div>
                  )}
                  {showFormHere && renderPairingForm()}
                </GlassCard>
              );
            })}
          </div>
        </div>
        <div className="flex-1">
          {/* "Klipper" (bukan "Moonraker" mentah) -- pola sama dengan apps/saas
              (lib/devices/printer-types.ts PRINTER_TYPE_LABELS.moonraker): "moonraker" itu nama
              API server-nya Klipper, bukan istilah yang dikenal user awam. Tak bisa dipersempit
              ke satu merek (mis. "Snapmaker") karena scan mDNS ini genuinely nemu banyak merek +
              build custom/DIY sekaligus -- beda dari kolom Bambu yang connector-nya memang cuma
              satu merek. */}
          <h3 className="g-t2 text-xs font-semibold uppercase tracking-wide mb-2">Hasil Scan Klipper (Snapmaker, Voron, Creality, dll.)</h3>
          <div className="space-y-2">
            {moonrakerPrinters.map((p) => {
              const target = effectiveTarget(p.ip, null);
              const showFormHere = pairing?.source.kind === "moonraker" && pairing.source.key === p.ip;
              return (
                <GlassCard key={p.ip} className="p-3">
                  <span className="g-t1 text-sm">
                    {p.ip} ({p.name})
                  </span>
                  {unpairedDevices.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {/* Moonraker (Klipper) tak punya konsep serial/access-code seperti Bambu --
                          connector-nya (packages/printer-monitor-core/src/connectors/moonraker.ts)
                          cuma pakai `device.ip`, jadi serial dikirim kosong; `accessCode` tetap
                          diminta manual di form pairing yang sama demi konsistensi bentuk
                          DeviceSecret (Task 2), meski Moonraker tak memvalidasinya. */}
                      <select
                        aria-label={`Pilih device untuk ${p.name}`}
                        className="glass-input rounded-[5px] px-2 h-9 text-xs flex-1"
                        value={target}
                        onChange={(e) => setSelectedTargets((prev) => ({ ...prev, [p.ip]: e.target.value }))}
                      >
                        {unpairedDevices.map((d) => (
                          <option key={d.shortCode} value={d.shortCode}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <GlassButton
                        onClick={() => startPairing(target, p.ip, "", "", { kind: "moonraker", key: p.ip })}
                        className="text-xs"
                      >
                        Pasangkan
                      </GlassButton>
                    </div>
                  )}
                  {showFormHere && renderPairingForm()}
                </GlassCard>
              );
            })}
          </div>
        </div>
      </div>
      {/* modelWarning: savePairing() men-set pairing kembali ke null setelah sukses (form
          ditutup, device pindah ke status "Terpasang"), jadi peringatan model non-blocking ini
          harus tetap terlihat SESUDAH form hilang. pairError: forgetDevice() bisa gagal SAAT
          form pairing sedang TERTUTUP sama sekali (tombol "Lupakan" ada di baris device, bukan
          di dalam form) -- keduanya level halaman, bukan diikat ke satu kartu tertentu. */}
      {pairError && (
        <p role="alert" className="g-error text-sm mt-2">
          {pairError}
        </p>
      )}
      {modelWarning && (
        <p role="alert" className="g-warning text-sm mt-2">
          {modelWarning}
        </p>
      )}
    </AgentShell>
  );
}

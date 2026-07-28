"use client";

import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";

/**
 * Sumber data palette = `Device` SaaS (prop dari server component), BUKAN fetch
 * `/api/cyd-layout/printers` seperti versi dashboard: identitas printer di layout SaaS adalah
 * `device.shortCode` (dipakai firmware & divalidasi ulang di PUT /api/cyd-layout), bukan
 * `printer.slug` internal. `id`/`printerType` opsional supaya row Device utuh maupun bentuk
 * ringkasnya sama-sama bisa dioper.
 */
export type PaletteDevice = {
  id?: string;
  shortCode: string;
  label: string;
  printerType?: string;
};

/**
 * Preview statis: dipakai kartu asli di palette DAN oleh `<DragOverlay>` di LayoutEditor.
 * DragOverlay merender di portal (di luar pohon useDraggable) jadi komponennya harus lepas
 * dari hook drag — sama alasannya dengan `PrinterCardPreview` di dashboard.
 */
export function DeviceCardPreview({ device }: { device: PaletteDevice }) {
  return (
    <div
      className="g-inner w-[168px] rounded-xl px-2.5 py-2 backdrop-blur-sm"
      style={{
        boxShadow: "0 14px 32px rgba(0,0,0,0.35), 0 0 0 1.5px rgba(99,102,241,0.55)",
        transform: "scale(1.05) rotate(1.5deg)",
        cursor: "grabbing",
      }}
    >
      <span className="g-t1 block truncate text-xs font-medium">🖨️ {device.label}</span>
      <span className="g-t4 font-mono text-[10px]">{device.shortCode}</span>
    </div>
  );
}

const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { type: "spring" as const, stiffness: 420, damping: 30 } },
};

function DraggableDeviceCard({ device, disabled }: { device: PaletteDevice; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${device.shortCode}`,
    data: { type: "device", shortCode: device.shortCode, device },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : { ...listeners, ...attributes })}
      className="touch-none select-none"
      style={{ cursor: disabled ? "not-allowed" : isDragging ? "grabbing" : "grab" }}
    >
      <motion.div
        variants={itemVariants}
        animate={{ opacity: isDragging ? 0.35 : 1 }}
        whileHover={disabled || isDragging ? undefined : { y: -2, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 480, damping: 30 }}
        className={`g-inner rounded-xl px-2.5 py-2 backdrop-blur-sm transition-colors ${
          disabled ? "opacity-40 saturate-50" : "hover:border-indigo-400/40"
        }`}
        title={disabled ? "Sudah dipakai di halaman ini" : "Tarik ke grid"}
      >
        <span className="g-t1 block truncate text-xs font-medium">🖨️ {device.label}</span>
        <span className="g-t4 font-mono text-[10px]">{device.shortCode}</span>
      </motion.div>
    </div>
  );
}

export function PrinterPalette({
  devices,
  usedShortCodesOnActivePage,
}: {
  devices: PaletteDevice[];
  usedShortCodesOnActivePage: string[];
}) {
  return (
    <div className="w-44 flex-shrink-0">
      <div className="g-card rounded-2xl p-3 backdrop-blur-[12px]">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="g-t3 text-[10px] font-semibold uppercase tracking-[0.14em]">Printer</span>
          {devices.length > 0 && (
            <span className="rounded-full bg-indigo-500/12 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-500 dark:text-indigo-300">
              {devices.length}
            </span>
          )}
        </div>

        {devices.length === 0 && (
          <div className="rounded-xl border border-dashed px-2 py-4 text-center" style={{ borderColor: "var(--g-dashed)" }}>
            <div className="mb-1.5 text-xl">🖨️</div>
            <p className="g-t3 text-[11px] leading-relaxed">Belum ada printer. Tambah dulu lewat daftar printer di atas.</p>
          </div>
        )}

        {devices.length > 0 && (
          <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-2">
            {devices.map((d) => (
              <DraggableDeviceCard key={d.shortCode} device={d} disabled={usedShortCodesOnActivePage.includes(d.shortCode)} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

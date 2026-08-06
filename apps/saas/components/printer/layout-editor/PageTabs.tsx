"use client";

import { useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { LAYOUT_LIMITS, type LayoutPageOut } from "@3pb/cyd-layout-schema";

function SortableTab({
  page,
  isActive,
  onSelect,
  onRemove,
  canRemove,
  isEditing,
  draftId,
  renameError,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
}: {
  page: LayoutPageOut;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  canRemove: boolean;
  isEditing: boolean;
  draftId: string;
  renameError: string | null;
  onStartRename: () => void;
  onDraftChange: (value: string) => void;
  onCommitRename: (viaBlur: boolean) => void;
  onCancelRename: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  // `touch-none` WAJIB di elemen ber-ref useSortable/useDraggable: tanpa `touch-action: none`,
  // browser mobile meng-klaim gesture sentuh buat scroll dan drag tak pernah jalan (app ini PWA
  // yang memang dipakai di HP). Jangan ditambahkan ke elemen non-draggable — malah mematikan
  // scroll normal di sekitarnya.
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.85 : 1, zIndex: isDragging ? 30 : undefined }}
      onClick={isEditing ? undefined : onSelect}
      className={`relative flex touch-none cursor-pointer select-none items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        isActive ? "text-white" : "text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white"
      }`}
    >
      {isActive && !isEditing && (
        <motion.div
          layoutId="cyd-page-tab-blob"
          className="absolute inset-0 rounded-full"
          style={{
            background: "linear-gradient(135deg, #5055e8, #818cf8)",
            boxShadow: "0 4px 14px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      {isEditing ? (
        <input
          aria-label={`Nama halaman ${page.id}`}
          autoFocus
          value={draftId}
          onChange={(e) => onDraftChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={() => onCommitRename(true)}
          onKeyDown={(e) => {
            // WAJIB baris pertama, sebelum cek key apa pun: div pembungkus punya {...listeners}
            // dnd-kit (termasuk KeyboardSensor -- Space/panah/Enter jadi tombol drag-nya). Tanpa
            // stopPropagation ini, event bubble ke listeners dan: Space saat mengetik di-preventDefault
            // duluan oleh KeyboardSensor (spasi tak pernah masuk value input), dan Enter/panah bisa
            // memicu sesi drag keyboard yang nyangkut/membajak input setelahnya.
            e.stopPropagation();
            if (e.key === "Enter") onCommitRename(false);
            if (e.key === "Escape") onCancelRename();
          }}
          className="relative z-10 w-24 rounded-md bg-white/90 px-1.5 py-0.5 text-[13px] text-gray-900 outline-none dark:bg-slate-800 dark:text-white"
        />
      ) : (
        <span className="relative z-10 font-medium">{page.id}</span>
      )}
      {!isEditing && (
        <motion.span
          whileHover={{ scale: 1.25 }}
          whileTap={{ scale: 0.85 }}
          onClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          title={`Ganti nama halaman ${page.id}`}
          className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none opacity-60 transition-colors hover:opacity-100 ${
            isActive ? "hover:bg-white/25" : "hover:bg-indigo-500/15 hover:text-indigo-500"
          }`}
        >
          ✎
        </motion.span>
      )}
      {canRemove && !isEditing && (
        <motion.span
          whileHover={{ scale: 1.25 }}
          whileTap={{ scale: 0.85 }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Hapus halaman"
          className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none opacity-60 transition-colors hover:opacity-100 ${
            isActive ? "hover:bg-white/25" : "hover:bg-red-500/15 hover:text-red-500"
          }`}
        >
          ✕
        </motion.span>
      )}
      {isEditing && renameError && (
        <span className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-md bg-red-500/90 px-2 py-0.5 text-[10px] text-white">
          {renameError}
        </span>
      )}
    </div>
  );
}

export function PageTabs({
  pages,
  activeIndex,
  onSelect,
  onAdd,
  onRemove,
  onReorder,
  onRename,
}: {
  pages: LayoutPageOut[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onReorder: (newPages: LayoutPageOut[]) => void;
  onRename: (index: number, newId: string) => void;
}) {
  // distance:4 supaya klik-biasa tetap bisa dibedakan dari drag -- tanpa ini PointerSensor mulai
  // drag pada gerakan sekecil apa pun dan menelan onClick (pola sama LayoutEditor.tsx:95, lupa
  // diterapkan juga di sensor PageTabs.tsx sendiri -- 2 DndContext terpisah, 2 sensor terpisah).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  // Batas firmware (LAYOUT_LIMITS.maxPages) — tombol "+" mati kalau sudah mentok, biar user tak
  // menabrak 400 dari server.
  const canAdd = pages.length < LAYOUT_LIMITS.maxPages;

  // Dikunci ke page.id, BUKAN index array: kalau pages reorder (drag) atau berubah jumlah selagi
  // sebuah rename sedang berlangsung (input masih fokus, belum commit), index yang sama bisa
  // menunjuk halaman yang beda sama sekali di saat commit -- rename bisa "nyasar" ke halaman lain.
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  function startRename(id: string) {
    setEditingPageId(id);
    setDraftId(id);
    setRenameError(null);
  }

  function cancelRename() {
    setEditingPageId(null);
    setRenameError(null);
  }

  // Batas panjang id (LAYOUT_LIMITS.maxPageIdLength) SUDAH tercek di findLayoutProblem() saat
  // Simpan -- tak diduplikasi di sini. Hanya 2 pemeriksaan breaking-langsung: kosong & duplikat
  // (keunikan page.id dulu dijamin struktural oleh nextPageNumberRef di LayoutEditor.tsx, tapi
  // begitu rename bebas diizinkan jaminan itu hilang -- id dobel akan merusak SortableContext
  // items={pages.map(p=>p.id)} dan React key={p.id}).
  function commitRename(pageId: string, viaBlur: boolean) {
    const trimmed = draftId.trim();
    // Resolve index SAAT commit, bukan dari closure lama -- pages bisa sudah berubah (reorder,
    // hapus) sejak rename dimulai.
    const index = pages.findIndex((p) => p.id === pageId);
    if (index === -1) {
      // Halaman yang sedang diedit sudah tak ada lagi (mis. dihapus selagi edit) -- batalkan diam-diam.
      setEditingPageId(null);
      setRenameError(null);
      return;
    }
    if (trimmed === pageId || !trimmed) {
      setEditingPageId(null);
      setRenameError(null);
      return;
    }
    const isDuplicate = pages.some((p) => p.id !== pageId && p.id === trimmed);
    if (isDuplicate) {
      if (viaBlur) {
        // Blur (klik di luar) -- jangan maksa fokus balik, revert diam-diam.
        setEditingPageId(null);
        setRenameError(null);
        return;
      }
      // Enter -- tetap di mode edit, biar user coba nama lain.
      setRenameError("Nama halaman sudah dipakai");
      return;
    }
    onRename(index, trimmed);
    setEditingPageId(null);
    setRenameError(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    onReorder(arrayMove(pages, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="g-card inline-flex flex-wrap items-center gap-1 rounded-full p-1 backdrop-blur-[12px]">
          <SortableContext items={pages.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
            {pages.map((p, i) => (
              <SortableTab
                key={p.id}
                page={p}
                isActive={i === activeIndex}
                onSelect={() => onSelect(i)}
                onRemove={() => onRemove(i)}
                canRemove={pages.length > 1}
                isEditing={editingPageId === p.id}
                draftId={draftId}
                renameError={editingPageId === p.id ? renameError : null}
                onStartRename={() => startRename(p.id)}
                onDraftChange={setDraftId}
                onCommitRename={(viaBlur) => commitRename(p.id, viaBlur)}
                onCancelRename={cancelRename}
              />
            ))}
          </SortableContext>
        </div>
        <motion.button
          type="button"
          whileHover={canAdd ? { scale: 1.04 } : undefined}
          whileTap={canAdd ? { scale: 0.95 } : undefined}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          onClick={onAdd}
          disabled={!canAdd}
          title={canAdd ? "Tambah halaman" : `Maksimal ${LAYOUT_LIMITS.maxPages} halaman`}
          className="rounded-full border border-dashed border-gray-400/60 px-3.5 py-1.5 text-sm text-gray-500 transition-colors hover:border-indigo-400/70 hover:bg-indigo-500/5 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-400/60 disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:border-slate-600 dark:text-slate-400 dark:hover:border-indigo-400/60 dark:hover:text-indigo-300"
        >
          + Halaman
        </motion.button>
      </div>
    </DndContext>
  );
}

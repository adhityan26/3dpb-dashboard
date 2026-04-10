"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface UserFormData {
  email: string
  name: string
  password: string
  role: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (data: UserFormData) => void
  isPending: boolean
  error: string | null
}

const ROLES = [
  { value: "ADMIN", label: "Admin (akses Order & Stok)" },
  { value: "TEST_USER", label: "Test User (read-only, untuk Shopee review)" },
]

export function UserFormModal({
  open,
  onClose,
  onSubmit,
  isPending,
  error,
}: Props) {
  const [form, setForm] = useState<UserFormData>({
    email: "",
    name: "",
    password: "",
    role: "ADMIN",
  })

  if (!open) return null

  function handleSubmit() {
    onSubmit(form)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-5 border-b">
          <h2 className="font-semibold">Tambah User Baru</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Nama</Label>
            <Input
              id="new-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Password (min 8 karakter)</Label>
            <Input
              id="new-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-role">Role</Label>
            <select
              id="new-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
          >
            {isPending ? "Menyimpan..." : "Buat User"}
          </Button>
        </div>
      </div>
    </div>
  )
}

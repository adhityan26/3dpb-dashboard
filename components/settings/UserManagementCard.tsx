"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  useUsers,
  useCreateUser,
  useDeleteUser,
  useUpdateUserRole,
  useResetPassword,
} from "@/lib/hooks/use-users"
import { UserFormModal, type UserFormData } from "./UserFormModal"

const ROLE_COLOR: Record<string, string> = {
  OWNER: "bg-purple-100 text-purple-800",
  ADMIN: "bg-blue-100 text-blue-800",
  TEST_USER: "bg-gray-100 text-gray-700",
}

export function UserManagementCard() {
  const { data: session } = useSession()
  const { data, isLoading } = useUsers()
  const createUser = useCreateUser()
  const deleteUser = useDeleteUser()
  const updateRole = useUpdateUserRole()
  const resetPw = useResetPassword()
  const [showModal, setShowModal] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function handleCreate(form: UserFormData) {
    setCreateError(null)
    createUser.mutate(form, {
      onSuccess: () => {
        setShowModal(false)
      },
      onError: (err) => setCreateError(err.message),
    })
  }

  function handleDelete(userId: string, email: string) {
    if (!confirm(`Hapus user ${email}?`)) return
    deleteUser.mutate(userId, {
      onError: (err) => alert(`❌ ${err.message}`),
    })
  }

  function handleResetPassword(userId: string, email: string) {
    const newPw = prompt(`Password baru untuk ${email} (min 8 karakter):`)
    if (!newPw) return
    resetPw.mutate(
      { userId, password: newPw },
      {
        onSuccess: () => alert("✅ Password berhasil di-reset"),
        onError: (err) => alert(`❌ ${err.message}`),
      },
    )
  }

  function handleRoleChange(userId: string, role: string) {
    updateRole.mutate(
      { userId, role },
      {
        onError: (err) => alert(`❌ ${err.message}`),
      },
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">👥 Manajemen User</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setCreateError(null)
              setShowModal(true)
            }}
            className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
          >
            + Tambah User
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="text-sm text-gray-400">Memuat user...</div>
          )}
          {data && (
            <div className="space-y-2">
              {data.users.map((u) => {
                const isSelf = session?.user?.id === u.id
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {u.name}
                        </span>
                        <Badge className={ROLE_COLOR[u.role] ?? ""}>
                          {u.role}
                        </Badge>
                        {isSelf && (
                          <span className="text-xs text-gray-400">(kamu)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {u.email}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {!isSelf && (
                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(u.id, e.target.value)
                          }
                          className="h-8 px-2 rounded border border-input bg-transparent text-xs"
                        >
                          <option value="OWNER">OWNER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="TEST_USER">TEST_USER</option>
                        </select>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleResetPassword(u.id, u.email)}
                      >
                        Reset PW
                      </Button>
                      {!isSelf && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(u.id, u.email)}
                          disabled={deleteUser.isPending}
                        >
                          Hapus
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <UserFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreate}
        isPending={createUser.isPending}
        error={createError}
      />
    </>
  )
}

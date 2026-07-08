"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { UserSummary } from "@/lib/users/service"

const USERS_KEY = ["users"] as const

async function fetchUsers(): Promise<{ users: UserSummary[] }> {
  const res = await fetch("/api/users")
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: fetchUsers,
  })
}

interface CreateUserVars {
  email: string
  name: string
  password: string
  role: string
}

async function createUser(vars: CreateUserVars): Promise<void> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

async function updateUserRole(vars: {
  userId: string
  role: string
}): Promise<void> {
  const res = await fetch(`/api/users/${vars.userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: vars.role }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateUserRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

async function deleteUserReq(userId: string): Promise<void> {
  const res = await fetch(`/api/users/${userId}`, { method: "DELETE" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteUserReq,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

async function resetPassword(vars: {
  userId: string
  password: string
}): Promise<void> {
  const res = await fetch(`/api/users/${vars.userId}/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: vars.password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useResetPassword() {
  return useMutation({
    mutationFn: resetPassword,
  })
}

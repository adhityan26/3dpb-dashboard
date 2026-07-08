import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

export type UserRole = "OWNER" | "ADMIN" | "TEST_USER"

export interface UserSummary {
  id: string
  email: string
  name: string
  role: string
  createdAt: string
}

function isValidRole(role: string): role is UserRole {
  return role === "OWNER" || role === "ADMIN" || role === "TEST_USER"
}

export async function listUsers(): Promise<UserSummary[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  })
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }))
}

export async function createUser(params: {
  email: string
  name: string
  password: string
  role: string
}): Promise<UserSummary> {
  if (!isValidRole(params.role)) {
    throw new Error(`Invalid role: ${params.role}`)
  }
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
  })
  if (existing) {
    throw new Error("Email sudah terdaftar")
  }
  const hashed = await bcrypt.hash(params.password, 10)
  const user = await prisma.user.create({
    data: {
      email: params.email,
      name: params.name,
      password: hashed,
      role: params.role,
    },
  })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function updateUserRole(
  userId: string,
  newRole: string,
): Promise<void> {
  if (!isValidRole(newRole)) {
    throw new Error(`Invalid role: ${newRole}`)
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error("User not found")
  if (user.role === "OWNER" && newRole !== "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER" } })
    if (ownerCount <= 1) {
      throw new Error("Tidak bisa demote Owner terakhir")
    }
  }
  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  })
}

export async function deleteUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error("User not found")
  if (user.role === "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER" } })
    if (ownerCount <= 1) {
      throw new Error("Tidak bisa hapus Owner terakhir")
    }
  }
  await prisma.user.delete({ where: { id: userId } })
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error("Password minimal 8 karakter")
  }
  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  })
}

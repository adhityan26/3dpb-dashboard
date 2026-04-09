import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

async function main() {
  const email = process.env.SEED_EMAIL ?? "owner@3dprintingbandung.com"
  const password = process.env.SEED_PASSWORD ?? "changeme123"
  const name = process.env.SEED_NAME ?? "Owner"

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`User ${email} already exists — skip.`)
    return
  }

  const hashed = await bcrypt.hash(password, 10)
  await prisma.user.create({
    data: { email, password: hashed, name, role: "OWNER" },
  })

  console.log(`✔ Owner user created: ${email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

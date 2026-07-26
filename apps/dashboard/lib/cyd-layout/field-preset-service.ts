import { prisma } from '@/lib/db'
import { validateFieldRows } from './build-config'
import { LAYOUT_LIMITS, type FieldRow } from './types'

export interface CydFieldPresetData {
  id: string
  name: string
  fields: FieldRow[]
}

function parseFields(fieldsJson: string): FieldRow[] {
  try {
    const parsed = JSON.parse(fieldsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toData(row: { id: string; name: string; fieldsJson: string }): CydFieldPresetData {
  return { id: row.id, name: row.name, fields: parseFields(row.fieldsJson) }
}

function assertValidFields(fields: FieldRow[]): void {
  const err = validateFieldRows(fields, LAYOUT_LIMITS.maxRowsPerFieldsPageDefault, 'fields')
  if (err) throw new Error(err)
}

async function notFoundOr<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025') {
      throw new Error('NOT_FOUND')
    }
    throw err
  }
}

export async function listFieldPresets(): Promise<CydFieldPresetData[]> {
  const rows = await prisma.cydFieldPreset.findMany({ orderBy: { createdAt: 'asc' } })
  return rows.map(toData)
}

export async function createFieldPreset(input: { name: string; fields: FieldRow[] }): Promise<CydFieldPresetData> {
  const name = input.name.trim()
  if (!name) throw new Error('NAME_REQUIRED')
  assertValidFields(input.fields)
  const row = await prisma.cydFieldPreset.create({
    data: { name, fieldsJson: JSON.stringify(input.fields) },
  })
  return toData(row)
}

export async function updateFieldPreset(id: string, input: { name?: string; fields?: FieldRow[] }): Promise<CydFieldPresetData> {
  const data: { name?: string; fieldsJson?: string } = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('NAME_REQUIRED')
    data.name = name
  }
  if (input.fields !== undefined) {
    assertValidFields(input.fields)
    data.fieldsJson = JSON.stringify(input.fields)
  }
  const row = await notFoundOr(() => prisma.cydFieldPreset.update({ where: { id }, data }))
  return toData(row)
}

export async function deleteFieldPreset(id: string): Promise<void> {
  await notFoundOr(() => prisma.cydFieldPreset.delete({ where: { id } }))
}

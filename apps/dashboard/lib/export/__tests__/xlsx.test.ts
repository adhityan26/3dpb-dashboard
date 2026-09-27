import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { buildXlsxWorkbook } from "../xlsx"

describe("buildXlsxWorkbook", () => {
  it("puts the rows' own keys as the header row, in order", () => {
    const wb = buildXlsxWorkbook("Sheet1", [
      { Customer: "Budi", Produk: "Cincin", Nominal: 150000 },
      { Customer: "Ani", Produk: "Topeng", Nominal: 200000 },
    ])
    expect(wb.SheetNames).toEqual(["Sheet1"])
    const sheet = wb.Sheets["Sheet1"]
    const rows = XLSX.utils.sheet_to_json(sheet)
    expect(rows).toEqual([
      { Customer: "Budi", Produk: "Cincin", Nominal: 150000 },
      { Customer: "Ani", Produk: "Topeng", Nominal: 200000 },
    ])
  })

  it("produces an empty sheet (no header) for zero rows", () => {
    const wb = buildXlsxWorkbook("Sheet1", [])
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"])
    expect(rows).toEqual([])
  })
})

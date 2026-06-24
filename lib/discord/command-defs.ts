// Discord application command option types
const SUB = 1, STRING = 3, INT = 4, NUMBER = 10

export const COMMAND_DEFS = [
  {
    name: "invoice",
    description: "Kelola invoice",
    options: [
      {
        type: SUB, name: "buat", description: "Buat invoice baru",
        options: [
          { type: STRING, name: "buyer", description: "Nama pembeli", required: true },
          { type: STRING, name: "items", description: "nama|qty|harga; nama|qty|harga", required: true },
          { type: INT, name: "ongkir", description: "Ongkir (opsional)", required: false },
        ],
      },
      {
        type: SUB, name: "status", description: "Cek status invoice",
        options: [
          { type: STRING, name: "nomor", description: "Nomor invoice (mis. INV-20260616-001)", required: true },
        ],
      },
    ],
  },
  {
    name: "shopee",
    description: "Shopee",
    options: [
      {
        type: SUB, name: "order", description: "Cari order Shopee by order SN",
        options: [
          { type: STRING, name: "sn", description: "Order SN", required: true },
        ],
      },
    ],
  },
  {
    name: "kalkulator",
    description: "Hitung harga cepat 1-plate",
    options: [
      { type: NUMBER, name: "gramasi", description: "Gramasi (gram)", required: true },
      { type: NUMBER, name: "jam", description: "Durasi print (jam)", required: true },
      { type: STRING, name: "tipe", description: "Tipe material", required: false,
        choices: [{ name: "FDM", value: "FDM" }, { name: "SLA", value: "SLA" }] },
      { type: STRING, name: "tier", description: "Margin tier", required: false,
        choices: [{ name: "A", value: "A" }, { name: "B", value: "B" }, { name: "C", value: "C" }] },
    ],
  },
  {
    name: "produk",
    description: "Produk Shopee",
    options: [
      {
        type: SUB, name: "cari", description: "Cari produk",
        options: [{ type: STRING, name: "kata", description: "Kata kunci", required: true }],
      },
    ],
  },
  {
    name: "order",
    description: "Order Shopee",
    options: [
      { type: SUB, name: "perlu-cetak", description: "Order siap/perlu cetak label" },
    ],
  },
  {
    name: "stok",
    description: "Stok",
    options: [
      {
        type: SUB, name: "filament", description: "Cek stok filament/spool",
        options: [{ type: STRING, name: "brand", description: "Filter brand (opsional)", required: false }],
      },
    ],
  },
]

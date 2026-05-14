
---
## Katalog & Produk

### Quotation / Invoice dari halaman Katalog
- Pilih produk dari halaman Katalog (multi-select)
- Generate quotation untuk beberapa produk sekaligus
- Bisa jadi Invoice (dengan nomor invoice, tanggal, due date)
- Payment tracking (lunas/belum/DP)
- Buyer dipilih dari daftar kontak atau input baru

### Upload Gambar Katalog
- Field `imageUrl` di ProdukInternal
- Upload dari KatalogCard / KatalogForm (mirip upload foto Shopee)
- Tampil di KatalogCard sebagai thumbnail
- Dipakai untuk katalog digital & landing page

### History Pembuatan (Production History)
- Table `PrintHistory`: produkInternalId, tanggal, qty, catatan, kalkulasiId
- Bisa input manual "cetak sekian pcs tanggal sekian"
- Tampil di detail KatalogCard
- Aggregate: total pcs per produk, last printed date

### Landing Page Produk
- Public page yang menampilkan produk-produk yang sudah pernah dibuat
- Data dari Katalog + production history
- Gambar dari `imageUrl`
- Harga dari linked kalkulasi (shopeeA / offlineA)
- Bisa embed di bio link / Linktree

---
## Image Storage Migration Path

### Phase 1 (sekarang): Local Filesystem
- `/app/data/images/katalog/[id].jpg`
- Serve via `/api/images/katalog/[filename]`
- MVP, cukup untuk puluhan produk

### Phase 2: MinIO (homelab)
- Deploy MinIO container di Proxmox
- Ganti storage backend, API tidak berubah dari frontend
- Bucket: `3pb-katalog`

### Phase 3: Sanity CDN (untuk landing page)
- Sync ProdukInternal ke Sanity Studio (webhook / manual push)
- Gambar di-upload ke Sanity asset pipeline → CDN otomatis
- Landing page di-build dari Sanity data

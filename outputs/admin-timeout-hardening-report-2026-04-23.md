# Admin Timeout Hardening Report

Tanggal: 23 Apr 2026  
Workspace: `C:\Users\rakidpc\Documents\Codex\2026-04-21-project-website-toko-onderdil-vespa`

## Ringkasan

Hardening ditambahkan pada action admin:

- `cancelAdminOrder()`
- `deleteAdminOrder()`

Jika request awal timeout di client, wrapper frontend admin sekarang tidak langsung menganggap aksi gagal final. Sistem akan cek ulang order via `orders/list` dan menyimpulkan hasil akhir secara aman.

## Perubahan Kode

- `live-api-client.js`
  - tambah retry reconcile untuk action admin timeout
  - cancel timeout -> cek ulang apakah status order sudah `CANCEL`
  - delete timeout -> cek ulang apakah order sudah hilang dari daftar
- `admin.js`
  - toast/status sekarang memberi pesan khusus saat aksi berhasil dipastikan selesai setelah koneksi sempat lambat
  - jika hasil akhir belum pasti, panel memaksa refresh order dulu sebelum admin klik ulang

## Hasil Test

### 1. Cancel timeout live sampling

Status: PASS

- Order multi-item dummy berhasil dibuat.
- Cancel dikirim lewat timeout proxy `8000ms`.
- Client awal melihat timeout.
- Wrapper admin melakukan reconcile.
- Order terbukti berubah menjadi `CANCEL`.
- Stok dummy kembali ke nilai semula.

Hasil utama:

- `order_id`: `ORD-20260423215630-XF0ZXR`
- stok sebelum create:
  - `QA-TEST-001 = 5`
  - `QA-TEST-002 = 2`
- stok sesudah create:
  - `QA-TEST-001 = 4`
  - `QA-TEST-002 = 1`
- stok sesudah cancel reconcile:
  - `QA-TEST-001 = 5`
  - `QA-TEST-002 = 2`

Proxy log:

- `Apps Script timeout route="admin/order/cancel" after 8000ms`

### 2. Delete timeout with real backend commit

Status: PASS

- Order dummy dibuat dan dicancel normal dulu.
- Saat delete, client dipaksa menerima payload timeout.
- Di backend, delete nyata tetap dijalankan.
- Wrapper admin melakukan reconcile lewat `orders/list`.
- Order dinyatakan hilang dan delete dianggap sukses.

Hasil utama:

- `order_id`: `ORD-20260423220654-1JVHPO`
- hasil delete:
  - `reconciled = true`
  - `reconciled_action = delete`
- hasil lookup akhir:
  - `remainingOrders = []`

## Catatan Tambahan

Saat rerun harness penuh, sempat muncul lagi anomali lama pada jalur create order langsung:

- create request timeout di client
- order ternyata tetap sempat commit di backend

Order anomali rerun tersebut sudah dibersihkan manual dan stok dummy sudah dipulihkan lagi. Temuan ini konsisten dengan risiko lama yang memang sudah diatasi di flow customer publik lewat `order/reconcile`, tetapi masih bisa muncul jika create order dipanggil langsung tanpa layer reconcile frontend.

## Putusan

Untuk action admin yang diuji:

- cancel timeout: lebih aman
- delete timeout: lebih aman

Status keseluruhan hardening ini: **PASS dengan monitoring**

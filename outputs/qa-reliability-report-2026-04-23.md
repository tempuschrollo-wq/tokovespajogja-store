# QA Reliability Report - Toko Vespa Jogja

Tanggal audit: 2026-04-23
Scope: frontend, admin panel, proxy Node, Apps Script API, Google Sheets automation code.
Mode test: read-only untuk live data. Tidak menjalankan POST order/cancel/stock live agar stok produksi tidak berubah.

## Putusan Akhir

Status akhir: AMAN UNTUK SOFT LAUNCH DENGAN MONITORING.
Skor sustain: 7/10.

Sistem sudah punya pondasi backend yang cukup baik untuk order dan stok: ada document lock, duplicate guard, API log, inventory log, proxy cache, dan route live sudah memuat endpoint delete terbaru.

Belum saya beri status "aman dipakai rutin tanpa catatan" karena backup otomatis belum ada, cancel order belum sepenuhnya transactional untuk kasus multi-item error/timeout ekstrem, dan beberapa endpoint/reporting masih full scan sheet.

## Ringkasan Arsitektur Yang Dipahami

Website publik membaca katalog lewat `server.mjs` endpoint `/api/catalog`. Proxy Node meneruskan ke Apps Script Web App `GET /products`, lalu menyimpan cache katalog lokal di memory dan `.cache/catalog.json`.

Order customer dari `site.js` dikirim ke `/api/order`, diteruskan ke Apps Script `POST /order`, lalu Apps Script menulis `ORDERS_WEBSITE`, membuat `STOCK_OUT`, mengurangi `MASTER_PRODUCTS`, dan menulis `INVENTORY_LOG`.

Admin panel di `admin.js` memakai token admin browser untuk endpoint admin. Perubahan produk, stock in/out, status order, cancel order, dan delete history lewat proxy `/api/admin/...` menuju Apps Script.

Google Sheets tetap source of truth utama. Frontend memakai live API sebagai jalur utama, tetapi masih punya cache/local JSON fallback agar halaman tetap tampil saat API lambat.

## File Penting Yang Diaudit

- `api.gs`
- `apiOrders.gs`
- `apiAdmin.gs`
- `apiHelpers.gs`
- `apiProducts.gs`
- `helpers.gs`
- `logs.gs`
- `config.gs`
- `inventory.gs`
- `reporting.gs`
- `triggers.gs`
- `server.mjs`
- `live-api-client.js`
- `catalog-store.js`
- `site.js`
- `admin.js`
- `reports.js`
- `server.config.json`

## Top 3 Risiko Paling Berbahaya

1. FAIL - Backup otomatis belum ada.
   Risiko bisnis: kalau sheet rusak, row salah hapus, atau deploy script salah, recovery masih bergantung history/manual Google.
   Fix minimum: tambah `backupSpreadsheet()` yang copy spreadsheet harian ke folder Drive dan update `SETTINGS.Last_Backup_Time`.

2. WARNING - Cancel order belum sepenuhnya transactional untuk multi-item.
   Risiko bisnis: jika Apps Script timeout/error di tengah restore beberapa item sebelum status `CANCEL` tersimpan, retry bisa mengembalikan sebagian stok dua kali.
   Fix minimum: prevalidate semua SKU dulu, tulis marker cancel-processing/restored, lalu cek marker/log sebelum restore ulang.

3. WARNING - Proxy fetch ke Apps Script belum punya timeout eksplisit.
   Risiko bisnis: saat Apps Script lambat, admin/customer bisa menunggu terlalu lama dan mengira tombol tidak bekerja.
   Fix minimum: tambah `AbortController` 15-20 detik di `server.mjs::fetchAppsScriptJson_`.

## Hasil Audit Per Kategori

### A. ORDER DUPLICATE GUARD

Status: PASS

Bukti kode:
- `apiOrders.gs::apiCreateOrder_` membuat fingerprint order.
- `apiOrders.gs` line 36 memanggil `reserveOrderFingerprint_(fingerprint)`.
- `apiOrders.gs` line 39 memanggil `hasRecentOrderFingerprint_(fingerprint)`.
- `apiOrders.gs` line 96 menyimpan fingerprint sukses ke `CacheService`.
- `apiHelpers.gs::reserveOrderFingerprint_` memakai `CacheService.getScriptCache()`.
- `apiHelpers.gs::hasRecentOrderFingerprint_` scan `ORDERS_WEBSITE` untuk marker `[API_FP:...]`.

Risiko bisnis:
Jika guard tidak ada, double click, refresh, atau retry jaringan bisa membuat order ganda dan stok terpotong dua kali.

Catatan:
Secara kode backend sudah punya guard. Saya belum menjalankan duplicate POST live karena akan membuat order dan mengurangi stok produksi. Untuk bukti live mutasi, wajib pakai sheet staging.

Fix minimum:
Pertahankan fingerprint + cache lock. Tambahkan test staging yang mengirim payload sama dua kali cepat.

### B. STOCK CONSISTENCY / RACE CONDITION

Status: PASS

Bukti kode:
- `helpers.gs` line 406 memakai `LockService.getDocumentLock()`.
- `helpers.gs` line 407 memakai `tryLock(LOCK_WAIT_MS)`.
- `apiOrders.gs::apiCreateOrder_` dibungkus `withDocumentLock_`.
- `apiAdmin.gs::apiAdminStockIn_` dan `apiAdminStockOut_` dibungkus `withDocumentLock_`.
- `apiAdmin.gs` line 417 mengecek `qtyKeluar > stockBefore`.
- `apiAdmin.gs` line 452 memanggil `applyStockOutToMasterProduct_`.

Risiko bisnis:
Tanpa lock, dua order paralel untuk SKU stok kecil bisa oversold.

Fix minimum:
Jangan pernah membuat endpoint stok baru yang langsung edit `MASTER_PRODUCTS`. Semua mutasi stok harus lewat function terpusat yang sudah ada.

### C. CANCEL ORDER SAFETY

Status: WARNING

Bukti kode:
- `apiOrders.gs` line 122 `apiAdminOrderCancel_`.
- `apiOrders.gs` line 143 mencegah cancel kedua dengan `ORDER_ALREADY_CANCELLED`.
- `apiOrders.gs` line 155 restore stok per item.
- `apiOrders.gs` line 188 baru menyet `Status_Order` menjadi `CANCEL`.
- `apiOrders.gs` line 205 `apiAdminOrderDelete_`.
- `apiOrders.gs` line 226 mengizinkan delete history hanya jika order sudah `CANCEL`.

Risiko bisnis:
Cancel normal aman dan cancel kedua ditolak. Namun, untuk order multi-item, jika error/timeout terjadi setelah sebagian item restore tapi sebelum status `CANCEL` tersimpan, retry dapat membuat restore sebagian stok berulang.

Fix minimum:
Prevalidate semua SKU dan qty sebelum restore apa pun. Tambahkan marker `CANCEL_PROCESSING` atau `[CANCEL_RESTORED]` di `Catatan`, lalu cek marker itu sebelum restore ulang.

### D. FRONTEND VS BACKEND SOURCE OF TRUTH

Status: WARNING

Bukti kode:
- `site.js` line 700 membaca `readCachedLiveCatalog()`.
- `site.js` line 707 fallback ke `loadCatalog()`.
- `site.js` line 713 melakukan `fetchLiveCatalog()` background.
- `catalog-store.js` line 466 masih fetch `catalog-data.json`.
- `catalog-store.js` line 456 dan 461 memakai `localStorage`.
- `live-api-client.js` menyimpan live cache ke browser storage.

Kesimpulan:
Status source data: HYBRID.

Risiko bisnis:
Saat API lambat/gagal, customer bisa melihat katalog stale. Ini baik untuk UX, tapi buruk jika stok sedang kritis.

Fix minimum:
Jika live sync gagal terlalu lama, checkout sebaiknya menampilkan warning lebih tegas atau refresh stok SKU saat submit order.

### E. ERROR HANDLING

Status: WARNING

Bukti kode:
- `site.js::handleCheckoutSubmit` punya `catch` dan feedback error.
- `admin.js` line 150 `showToast`.
- `admin.js` line 170 `setStatus`.
- `admin.js` line 1688 catch error aksi order dan tampilkan toast.
- `server.mjs::fetchAppsScriptJson_` line 447 belum memakai `AbortController`.

Risiko bisnis:
UI sudah memberi feedback, tetapi request yang menggantung bisa terasa seperti loading lama.

Fix minimum:
Tambah timeout eksplisit di proxy Node, lalu response error yang jelas seperti "Sistem sedang lambat, coba ulang beberapa detik."

### F. API STABILITY

Status: WARNING

Bukti kode:
- `server.mjs` line 31-35 punya cache TTL: catalog 10 menit, dashboard 2 menit, adminOrders 30 detik.
- `server.mjs` line 262 `getCachedPayload_`.
- `server.mjs` line 271 mengembalikan cache lama sambil refresh background.
- `apiProducts.gs::apiGetProducts_` membaca semua active products dari sheet.
- `apiOrders.gs::apiAdminOrdersList_` membaca semua order lalu filter/sort.

Hasil timing aman yang dijalankan:
- `GET /api/health`: 3 ms, PASS.
- `GET /api/catalog`: 6 ms, PASS, dari proxy cache.
- `GET /api/dashboard-summary`: 3 ms, PASS, dari proxy cache.
- Apps Script root live: 3712 ms, PASS, route list terbaru ada.

Risiko bisnis:
Proxy cache cepat, tetapi cache miss dan admin order/reporting tetap bisa lambat jika sheet order/log membesar.

Fix minimum:
Pertahankan proxy cache. Tambahkan pagination/filter di Apps Script sebelum semua data diproses berat, atau buat summary harian incremental.

### G. LOGGING & AUDIT TRAIL

Status: WARNING

Bukti kode:
- `api.gs` line 17 menulis `safeWriteApiLog_` saat sukses.
- `api.gs` line 35 menulis `safeWriteApiLog_` saat error.
- `logs.gs` line 1 `writeInventoryLog_`.
- `logs.gs` line 61 `writeApiLog_`.
- `apiAdmin.gs` line 362 log stock in.
- `apiAdmin.gs` line 454 log stock out.
- `apiOrders.gs` cancel order menulis inventory restore log.

Risiko bisnis:
Perubahan stok tercatat. Namun product create/delete/edit non-stok belum punya audit detail khusus selain `API_LOG`.

Fix minimum:
Buat sheet `ADMIN_ACTIVITY_LOG` nanti jika client mulai banyak operator. Untuk sekarang API_LOG masih cukup sebagai jejak dasar.

### H. ADMIN SAFETY

Status: WARNING

Bukti kode:
- `apiAdmin.gs` line 193 `apiAdminProductDelete_`.
- `apiAdmin.gs` line 199 menerima `force_delete`.
- `apiAdmin.gs` line 213 memanggil `validateProductDeletionSafety_`.
- `apiOrders.gs` line 454 menolak update status langsung ke `CANCEL` dan mengarahkan ke endpoint cancel.
- `admin.js` line 1640-1661 cancel order memakai konfirmasi dan toast sukses.
- `admin.js` line 1664-1680 delete history hanya untuk order cancel.

Risiko bisnis:
`force_delete` permanen masih bisa menghapus produk dari `MASTER_PRODUCTS`. Walaupun ada konfirmasi, ini berisiko untuk client non-teknis.

Fix minimum:
Untuk akun client harian, sembunyikan hard delete atau matikan force delete. Default aman adalah `NONAKTIF`.

### I. REPORTING SUSTAINABILITY

Status: WARNING

Bukti kode:
- `reporting.gs` line 9 `refreshDashboard`.
- `reporting.gs` line 25 `generateWeeklyReport`.
- `reporting.gs` line 44 `generateMonthlyReport`.
- `reporting.gs` line 587, 676, 718, 762 membaca sheet transaksi/log.
- `reporting.gs` line 1108 `getSheetRowsForReporting_`.

Risiko bisnis:
Untuk 900 produk masih masuk akal. Jika order/log sudah ribuan sampai puluhan ribu, full scan bisa mulai berat dan kena limit Apps Script.

Fix minimum:
Untuk fase sekarang cukup. Saat order harian sudah konsisten tinggi, buat `DAILY_SUMMARY` dan laporan mingguan/bulanan dari summary, bukan dari raw log setiap kali.

### J. BACKUP & RECOVERY READINESS

Status: FAIL

Bukti kode:
- Scan tidak menemukan `backupSpreadsheet`, `makeCopy`, atau `DriveApp.getFileById`.
- `config.gs` hanya punya key `Last_Backup_Time`, belum ada implementasi backup.

Risiko bisnis:
Jika sheet rusak, row salah hapus, atau file terhapus, recovery belum punya prosedur otomatis.

Fix minimum:
Tambahkan:
- `backup.gs`
- `backupSpreadsheet()`
- trigger harian
- update `SETTINGS.Last_Backup_Time`
- folder Drive khusus backup

## Test Yang Berhasil Dijalankan

1. Syntax check:
   - `node --check tests/qa-reliability-audit.mjs`
   - `node --check server.mjs`
   - `node --check admin.js`
   - `node --check site.js`

2. QA audit repeatable:
   - `npm run qa:audit`
   - Hasil: 6 PASS, 7 WARNING, 1 FAIL.

3. Safe live/proxy GET:
   - Apps Script root live: PASS, route delete terbaru sudah ada.
   - `GET /api/health`: PASS.
   - `GET /api/catalog`: PASS.
   - `GET /api/dashboard-summary`: PASS.

## Test Yang Tidak Dijalankan Penuh

1. Duplicate POST order payload sama 2x cepat.
   Alasan: akan membuat order live dan mengurangi stok produksi.

2. Race condition dua order paralel untuk SKU stok kecil.
   Alasan: butuh SKU staging stok kecil supaya tidak merusak inventory real.

3. Cancel order 1x lalu cancel ulang order yang sama.
   Alasan: butuh order staging agar tidak mengubah order produksi.

4. Stock in/out live.
   Alasan: akan mengubah stok produksi dan log transaksi.

## Rencana Test Manual Staging Yang Disarankan

Siapkan satu SKU test, contoh `QA-TEST-001`, stok awal 1, harga 1000.

1. Duplicate order:
   - Kirim payload order yang sama dua kali cepat.
   - Expected: request pertama sukses, request kedua `DUPLICATE_ORDER` atau hanya satu order tercatat.

2. Race condition:
   - Kirim dua request order paralel untuk SKU `QA-TEST-001` qty 1.
   - Expected: satu sukses, satu `INSUFFICIENT_STOCK` atau duplicate guard, stok tidak minus.

3. Cancel idempotency:
   - Cancel order sukses satu kali.
   - Cancel order yang sama lagi.
   - Expected: request kedua `ORDER_ALREADY_CANCELLED`, stok tidak bertambah lagi.

4. Delete history:
   - Setelah order status `CANCEL`, klik hapus riwayat.
   - Expected: row order hilang dari `ORDERS_WEBSITE`, stok tidak berubah lagi.

## Blind Spot Yang Belum Bisa Dipastikan

- Apakah semua trigger Apps Script sudah benar terpasang di akun client.
- Apakah deployment Web App memakai permission yang stabil untuk semua user.
- Apakah Google Sheets quota aman saat order marketplace nanti mulai banyak.
- Apakah operator client akan memaksa hard delete produk real.
- Apakah Google Drive backup folder dan recovery SOP sudah disiapkan.

## Rekomendasi Fix Minimum Urut Prioritas

1. Tambahkan backup otomatis harian.
2. Hardening cancel order agar lebih idempotent untuk multi-item error/timeout.
3. Tambahkan timeout eksplisit di `server.mjs::fetchAppsScriptJson_`.
4. Sembunyikan force delete dari client harian.
5. Tambahkan test staging untuk duplicate/race/cancel.

## Command Untuk Ulang Audit

```bash
npm run qa:audit
```

Catatan: command ini akan exit code 1 selama backup otomatis belum ada, karena backup readiness memang status FAIL.

# Toko Vespa Jogja: Google Sheet to Website Setup

Dokumen ini dipakai setelah workbook sudah diimport dan disimpan sebagai Google Sheet.

## 1. Tempel Apps Script ke Google Sheet

1. Buka Google Sheet inventory.
2. Klik `Extensions` -> `Apps Script`.
3. Hapus file default `Code.gs` jika ada.
4. Buat file baru satu per satu dengan nama berikut:
   - `config.gs`
   - `helpers.gs`
   - `inventory.gs`
   - `orders.gs`
   - `logs.gs`
   - `reporting.gs`
   - `triggers.gs`
   - `apiHelpers.gs`
   - `apiProducts.gs`
   - `apiOrders.gs`
   - `apiAdmin.gs`
   - `api.gs`
5. Copy isi masing-masing file dari project lokal ini ke Apps Script project.

## 2. Set Project Settings

Di editor Apps Script:

1. Klik `Project Settings`.
2. Pastikan timezone project adalah `Asia/Jakarta`.
3. Aktifkan `Show "appsscript.json" manifest file in editor` jika ingin lihat manifest, tapi ini opsional.

## 3. Set Script Properties

Di Apps Script:

1. Klik `Project Settings`.
2. Di bagian `Script Properties`, tambahkan:
   - `SPREADSHEET_ID`
   - `ADMIN_API_TOKEN`

Nilainya:

- `SPREADSHEET_ID`: ambil dari URL Google Sheet.
  Contoh:
  `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0`
- `ADMIN_API_TOKEN`: buat token rahasia panjang.
  Contoh aman:
  `tvj_admin_2026_xxxxxxxxxxxxxxxxxx`

Catatan:

- `SPREADSHEET_ID` wajib untuk endpoint Web App.
- `ADMIN_API_TOKEN` wajib untuk endpoint admin seperti create/update product, stock in/out, dan cancel order.

## 4. Save dan Jalankan Setup Awal

Urutan yang disarankan:

1. `generateMissingProductIds()`
2. `backfillMargins()`
3. `recomputeAllStockStatus()`
4. `validateMasterProducts()`
5. `refreshDashboard()`
6. `generateWeeklyReport()`
7. `generateMonthlyReport()`

Saat pertama kali run:

- Google akan minta authorization.
- Klik `Review permissions`.
- Pilih akun Google yang dipakai.
- Jika muncul warning `Google hasn't verified this app`, pilih `Advanced` -> `Go to project`.

## 5. Cek Menu Spreadsheet

Setelah refresh tab Google Sheet, harus muncul menu baru:

- `TVJ Inventory`

Menu ini dipakai untuk:

- proses stock in/out manual
- recompute status stok
- validasi master products
- refresh dashboard
- generate weekly/monthly report
- install trigger reporting

## 6. Deploy Web App untuk API

Di Apps Script:

1. Klik `Deploy` -> `New deployment`.
2. Pilih type `Web app`.
3. Isi:
   - `Description`: `TVJ Inventory API`
   - `Execute as`: `Me`
   - `Who has access`: `Anyone`
4. Klik `Deploy`.
5. Copy `Web app URL`.

Contoh bentuk URL:

`https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxx/exec`

## 7. Test Endpoint Dasar

Tes di browser:

- Root:
  `WEB_APP_URL`
- Products:
  `WEB_APP_URL/products`
- Product detail:
  `WEB_APP_URL/product?sku=JVS-0001`
- Dashboard summary:
  `WEB_APP_URL/dashboard-summary`

Kalau endpoint root hidup, harus mengembalikan JSON status API aktif.

## 8. Test Endpoint Order

Contoh POST order pakai JavaScript console atau Postman:

```js
fetch("WEB_APP_URL/order", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    customer_name: "Rakha",
    customer_whatsapp: "6281234567890",
    customer_address: "Sleman, Yogyakarta",
    items: [
      { sku: "JVS-0001", qty: 1 },
      { sku: "JVS-0002", qty: 2 }
    ]
  })
}).then((res) => res.json()).then(console.log)
```

## 9. Test Endpoint Admin

Contoh stock in:

```js
fetch("WEB_APP_URL/admin/stock/in", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    admin_token: "ISI_TOKEN_ADMIN",
    sku: "JVS-0001",
    qty_masuk: 5,
    harga_modal_satuan: 25000,
    supplier: "Supplier A",
    catatan: "Restock manual",
    input_by: "ADMIN_WEB"
  })
}).then((res) => res.json()).then(console.log)
```

Contoh stock out:

```js
fetch("WEB_APP_URL/admin/stock/out", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    admin_token: "ISI_TOKEN_ADMIN",
    sku: "JVS-0001",
    qty_keluar: 1,
    harga_jual_satuan: 40000,
    jenis_keluar: "MANUAL",
    referensi_id: "TEST-OUT-001",
    catatan: "Sample keluar",
    input_by: "ADMIN_WEB"
  })
}).then((res) => res.json()).then(console.log)
```

## 10. Install Trigger yang Aman

Yang direkomendasikan:

1. Reporting trigger:
   - jalankan menu `TVJ Inventory` -> `Install trigger reporting`
2. Inventory processing:
   - untuk fase awal, pakai tombol menu manual
   - jangan langsung aktifkan onEdit automation

Kenapa:

- `onEdit` lebih rawan double process kalau user edit sambil copy-paste banyak row
- menu manual lebih stabil untuk operasional awal
- API call dari website jauh lebih aman untuk order live

## 11. Integrasi Website

Frontend website saat ini masih membaca `catalog-data.json`, jadi setelah API live ada dua tahap:

1. website public katalog diarahkan ke `GET /products`
2. checkout/order diarahkan ke `POST /order`
3. admin panel diarahkan ke endpoint admin:
   - `/admin/product/create`
   - `/admin/product/update`
   - `/admin/stock/in`
   - `/admin/stock/out`
   - `/admin/order/cancel`

## 12. Checklist Siap Jalan

Sistem dianggap siap dipakai kalau semua ini sudah lolos:

- Semua file `.gs` sudah masuk ke Apps Script
- Script Properties sudah diisi
- `validateMasterProducts()` lolos tanpa error
- `refreshDashboard()` berhasil
- `generateWeeklyReport()` berhasil
- `generateMonthlyReport()` berhasil
- Web App berhasil dideploy
- `GET /products` mengembalikan JSON
- `POST /order` berhasil membuat order test
- `POST /admin/stock/in` dan `POST /admin/stock/out` berhasil update stok

## 13. Catatan Operasional

- Untuk awal, jangan edit header sheet.
- Jangan ubah nama sheet.
- Jangan pindah urutan kolom sembarangan.
- Harga di sheet simpan sebagai angka, formatting tampilannya serahkan ke frontend.
- Jika user admin non-teknis, operasional harian paling aman lewat:
  - form admin website
  - menu `TVJ Inventory`
  - bukan edit sheet mentah terlalu sering

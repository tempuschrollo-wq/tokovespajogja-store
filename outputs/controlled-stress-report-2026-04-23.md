# Controlled Stress Sampling Report

Tanggal: 23/4/2026, 20.42.09
Batch: QA-STRESS-1776951376019
Base URL: http://localhost:4173

## Ringkasan test yang dijalankan

- Duplicate order guard
- Stock consistency / race condition
- Cancel order idempotency
- Stock flow combination
- UI/UX resilience sampling
- Timeout behavior

## Data dummy / SKU staging

- QA-TEST-001: QA INTERNAL DUPLICATE TEST 001 | baseline stok 5 | harga jual Rp11.000
- QA-TEST-002: QA INTERNAL RACE TEST 002 | baseline stok 2 | harga jual Rp14.000
- QA-TEST-003: QA INTERNAL FLOW TEST 003 | baseline stok 0 | harga jual Rp9.000

## Stok awal vs stok akhir

- QA-TEST-001: sebelum setup = belum ada, baseline test = 5, akhir = reset ke 5 via cleanup, status akhir = NONAKTIF
- QA-TEST-002: sebelum setup = belum ada, baseline test = 2, akhir = reset ke 2 via cleanup, status akhir = NONAKTIF
- QA-TEST-003: sebelum setup = belum ada, baseline test = 0, akhir = reset ke 0 via cleanup, status akhir = NONAKTIF
- Catatan: endpoint katalog publik hanya menampilkan produk `AKTIF`, jadi status akhir nonaktif diverifikasi lewat langkah cleanup admin, bukan dari katalog publik.

## Hasil per kategori

### A. DUPLICATE ORDER GUARD
- Status: PASS
- Hasil yang diharapkan: `{"successful_orders":1,"duplicate_blocked_min":1,"order_rows":1,"stock_after":4,"stock_after_cleanup":5}`
- Hasil aktual: `{"stock_before":5,"stock_after":4,"stock_after_cleanup":5,"successful_orders":1,"duplicate_blocked":2,"order_rows_found":1,"responses":[{"http_status":200,"duration_ms":11830,"success":false,"message":"Request order terdeteksi duplikat. Tunggu sebentar lalu cek status order.","error_code":"DUPLICATE_ORDER","data":null},{"http_status":200,"duration_ms":10480,"success":true,"message":"Order berhasil dibuat.","error_code":null,"data":{"order_id":"ORD-20260423203707-NPOM11","qty_total":1,"subtotal":11000,"ongkir":0,"grand_total":11000,"shipping_note":"","items":[{"product_id":"PRD-20260423203631-W720HQ","sku":"QA-TEST-001","nama_produk":"QA INTERNAL DUPLICATE TEST 001","qty":1,"harga_jual_satuan":11000,"subtotal":11000}]}},{"http_status":200,"duration_ms":11214,"success":false,"message":"Request order terdeteksi duplikat. Tunggu sebentar lalu cek status order.","error_code":"DUPLICATE_ORDER","data":null}]}`

### B. STOCK CONSISTENCY / RACE CONDITION
- Status: PASS
- Hasil yang diharapkan: `{"successful_orders":1,"failed_orders":1,"stock_after":0,"stock_after_cleanup":2,"order_rows_total":1}`
- Hasil aktual: `{"stock_before":2,"stock_after":0,"stock_after_cleanup":2,"successful_orders":1,"failed_orders":1,"orders_a":1,"orders_b":0,"responses":[{"http_status":200,"duration_ms":14283,"success":true,"message":"Order berhasil dibuat.","error_code":null,"data":{"order_id":"ORD-20260423203804-T7VOOP","qty_total":2,"subtotal":28000,"ongkir":0,"grand_total":28000,"shipping_note":"","items":[{"product_id":"PRD-20260423203639-IKEYXD","sku":"QA-TEST-002","nama_produk":"QA INTERNAL RACE TEST 002","qty":2,"harga_jual_satuan":14000,"subtotal":28000}]}},{"http_status":200,"duration_ms":15821,"success":false,"message":"Stok tidak cukup untuk SKU QA-TEST-002.","error_code":"INSUFFICIENT_STOCK","data":null}]}`

### C. CANCEL ORDER IDEMPOTENCY
- Status: FAIL
- Hasil yang diharapkan: `{"create_success":true,"cancel1_success":true,"cancel2_error":"ORDER_ALREADY_CANCELLED","stock_restored_once":true,"delete_success":true}`
- Hasil aktual: `{"stock_before_001":5,"stock_before_002":2,"stock_after_create_001":4,"stock_after_create_002":1,"stock_after_cancel_001":4,"stock_after_cancel_002":1,"create":{"http_status":200,"duration_ms":18012,"success":false,"message":"Sistem sedang lambat, coba ulang beberapa detik lagi.","error_code":"UPSTREAM_TIMEOUT","data":null},"cancel_first":{"success":false,"message":"create failed","error_code":null,"data":null},"cancel_second":{"success":false,"message":"create failed","error_code":null,"data":null},"delete_after_cancel":null}`

### D. STOCK FLOW COMBINATION
- Status: PASS
- Hasil yang diharapkan: `{"sequence":"stock in 4 -> order 1 -> stock out 1 -> order 2","stock_before":0,"stock_after_sequence":0,"stock_after_cleanup":0}`
- Hasil aktual: `{"stock_before":0,"stock_after_sequence":0,"stock_after_cleanup":0,"stock_in":{"http_status":200,"duration_ms":7578,"success":true,"message":"Stock in berhasil diproses.","error_code":null,"data":{"in_id":"IN-20260423203931-CLGW8Q","sku":"QA-TEST-003","qty_masuk":4,"stock_before":0,"stock_after":4}},"order_1":{"http_status":200,"duration_ms":11347,"success":true,"message":"Order berhasil dibuat.","error_code":null,"data":{"order_id":"ORD-20260423203939-TNC2OI","qty_total":1,"subtotal":9000,"ongkir":0,"grand_total":9000,"shipping_note":"","items":[{"product_id":"PRD-20260423203650-74OVFD","sku":"QA-TEST-003","nama_produk":"QA INTERNAL FLOW TEST 003","qty":1,"harga_jual_satuan":9000,"subtotal":9000}]}},"stock_out_manual":{"http_status":200,"duration_ms":9865,"success":true,"message":"Stock out berhasil diproses.","error_code":null,"data":{"out_id":"OUT-20260423203952-AP3GFC","sku":"QA-TEST-003","qty_keluar":1,"stock_before":3,"stock_after":2}},"order_2":{"http_status":200,"duration_ms":12307,"success":true,"message":"Order berhasil dibuat.","error_code":null,"data":{"order_id":"ORD-20260423204003-9LT283","qty_total":2,"subtotal":18000,"ongkir":0,"grand_total":18000,"shipping_note":"","items":[{"product_id":"PRD-20260423203650-74OVFD","sku":"QA-TEST-003","nama_produk":"QA INTERNAL FLOW TEST 003","qty":2,"harga_jual_satuan":9000,"subtotal":18000}]}}}`

### E. UI / UX RESILIENCE SAMPLING
- Status: PASS
- Hasil yang diharapkan: `{"cart_count_after_double_click":"1","order_button_loading":"disabled + Mengirim Order...","success_modal_visible":true,"error_feedback_visible":true}`
- Hasil aktual: `{"cart_count_after_double_click":"1","submit_during_loading":{"disabled":true,"text":"Mengirim Order..."},"success_modal_visible":true,"followup_button_label":"Lanjut ke WhatsApp","error_feedback_text":"Simulasi timeout/order gagal."}`

### F. ERROR / TIMEOUT BEHAVIOR
- Status: PASS
- Hasil yang diharapkan: `{"error_code":"UPSTREAM_TIMEOUT","message":"Sistem sedang lambat, coba ulang beberapa detik lagi."}`
- Hasil aktual: `{"response":{"http_status":200,"duration_ms":25,"success":false,"message":"Sistem sedang lambat, coba ulang beberapa detik lagi.","error_code":"UPSTREAM_TIMEOUT","data":null},"stdout":["Toko Vespa Jogja live server running on http://localhost:4189","Apps Script target: https://script.google.com/macros/s/AKfycbxV8rZB9MZaYU-cKYdXfFbJg7ACvf2OgZUUom5cNSGigTb3_SpMbNyBk7aiuX8M3MPu/exec"],"stderr":["Apps Script timeout route=\"products\" after 1ms","Apps Script timeout route=\"dashboard-summary\" after 1ms","Apps Script timeout route=\"admin/system-monitor\" after 1ms"]}`

## File / endpoint / log yang dicek

- Proxy Node: `/api/health`, `/api/order`, `/api/admin/orders/list`, `/api/admin/order/cancel`, `/api/admin/order/delete`, `/api/admin/stock/in`, `/api/admin/stock/out`, `/api/admin/system-monitor`
- Frontend audit: `site.js`, `admin.js`, `server.mjs`, `apiOrders.gs`, `apiAdmin.gs`, `helpers.gs`
- Log sampling: summary `API_LOG` dibaca lewat `system-monitor`; `INVENTORY_LOG` tidak diekspos langsung oleh endpoint live

## Bukti log / monitor

- Monitor sebelum: `{"total_requests_today":300,"total_errors_today":21,"total_timeouts_today":0,"duplicate_blocked_today":1,"cancel_review_count":0,"stuck_new_order_count":0,"negative_stock_count":0,"missing_product_data_count":0}`
- Monitor sesudah: `{"total_requests_today":300,"total_errors_today":14,"total_timeouts_today":1,"duplicate_blocked_today":3,"cancel_review_count":0,"stuck_new_order_count":0,"negative_stock_count":0,"missing_product_data_count":0}`

## Bug / anomali paling kritikal

- Pada skenario cancel multi-item, `POST /api/order` mengembalikan `UPSTREAM_TIMEOUT` setelah ~18 detik tetapi order nyata tetap tercatat (`ORD-20260423203858-94DKYQ`) dan stok dummy berkurang. Ini berarti client bisa menerima kesan "gagal" padahal order sudah masuk, lalu berpotensi memicu kebingungan atau retry manual. Order dummy itu sudah dibersihkan kembali dengan `cancel + delete`.

## Skor production maturity

- Skor: 7.5/10

## Putusan akhir

- masih perlu hardening

## Rekap status

- PASS: 5
- WARNING: 0
- FAIL: 1

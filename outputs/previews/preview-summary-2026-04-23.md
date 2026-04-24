# Preview Summary

Base URL: http://localhost:4173

## File hasil

- WEBSITE desktop: C:\Users\rakidpc\Documents\Codex\2026-04-21-project-website-toko-onderdil-vespa\outputs\previews\website-desktop-preview-2026-04-23.webm
- WEBSITE mobile: C:\Users\rakidpc\Documents\Codex\2026-04-21-project-website-toko-onderdil-vespa\outputs\previews\website-mobile-preview-2026-04-23.webm
- ADMIN desktop: C:\Users\rakidpc\Documents\Codex\2026-04-21-project-website-toko-onderdil-vespa\outputs\previews\admin-desktop-preview-2026-04-23.webm
- ADMIN mobile: C:\Users\rakidpc\Documents\Codex\2026-04-21-project-website-toko-onderdil-vespa\outputs\previews\admin-mobile-preview-2026-04-23.webm
- LAPORAN desktop: C:\Users\rakidpc\Documents\Codex\2026-04-21-project-website-toko-onderdil-vespa\outputs\previews\reports-desktop-preview-2026-04-23.webm
- LAPORAN mobile: C:\Users\rakidpc\Documents\Codex\2026-04-21-project-website-toko-onderdil-vespa\outputs\previews\reports-mobile-preview-2026-04-23.webm
- CEK SISTEM desktop: C:\Users\rakidpc\Documents\Codex\2026-04-21-project-website-toko-onderdil-vespa\outputs\previews\system-monitor-desktop-preview-2026-04-23.webm
- CEK SISTEM mobile: C:\Users\rakidpc\Documents\Codex\2026-04-21-project-website-toko-onderdil-vespa\outputs\previews\system-monitor-mobile-preview-2026-04-23.webm

## Flow yang direkam

- Website publik desktop: homepage, search, katalog, add to cart, checkout, loading, popup sukses, redirect WhatsApp preview.
- Website publik mobile: pencarian cepat, add to cart, checkout singkat, popup sukses, redirect WhatsApp preview.
- Admin desktop: dashboard, bell notif, marketplace section, order list, daftar produk, edit form tanpa simpan.
- Admin mobile: preview usability utama dengan scroll ringkas section penting.
- Laporan desktop/mobile: KPI, refresh, weekly/monthly blocks, ranking, low stock.
- Cek sistem desktop/mobile: status cards, refresh, alert, ringkasan error, issue table.

## Catatan keamanan

- Submit order di website publik dimock sukses untuk preview, jadi tidak membuat order live.
- Redirect WhatsApp diarahkan ke halaman preview aman, bukan membuka WA real.
- Admin/laporan/system monitor hanya menampilkan data live dan interaksi non-mutating.

## Cara generate ulang

```powershell
$env:TVJ_ADMIN_API_TOKEN=(Get-Content outputs\_system_monitor_req.json | ConvertFrom-Json).admin_token
node tests\generate-preview-videos.cjs
```
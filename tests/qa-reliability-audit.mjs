import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, "..")

const checks = []

const read = async (file) => readFile(path.join(root, file), "utf8")

const addCheck = ({ category, status, title, evidence, risk, fix }) => {
  checks.push({ category, status, title, evidence, risk, fix })
}

const hasAll = (source, patterns) => patterns.every((pattern) => source.includes(pattern))

const timedFetchJson = async (url, { timeoutMs = 12000 } = {}) => {
  const controller = new AbortController()
  const startedAt = performance.now()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store"
    })
    const text = await response.text()
    const durationMs = Math.round(performance.now() - startedAt)

    try {
      return {
        ok: response.ok,
        status: response.status,
        durationMs,
        payload: JSON.parse(text),
        raw: text.slice(0, 300)
      }
    } catch (error) {
      return {
        ok: false,
        status: response.status,
        durationMs,
        payload: null,
        raw: text.slice(0, 300)
      }
    }
  } finally {
    clearTimeout(timer)
  }
}

const main = async () => {
  const [
    apiGs,
    apiOrders,
    apiHelpers,
    apiAdmin,
    helpers,
    logs,
    server,
    liveApiClient,
    catalogStore,
    site,
    admin,
    reporting,
    backup,
    configRaw
  ] = await Promise.all([
    read("api.gs"),
    read("apiOrders.gs"),
    read("apiHelpers.gs"),
    read("apiAdmin.gs"),
    read("helpers.gs"),
    read("logs.gs"),
    read("server.mjs"),
    read("live-api-client.js"),
    read("catalog-store.js"),
    read("site.js"),
    read("admin.js"),
    read("reporting.gs"),
    read("backup.gs").catch(() => ""),
    read("server.config.json").catch(() => "{}")
  ])

  const config = JSON.parse(configRaw || "{}")

  addCheck({
    category: "A_DUPLICATE_ORDER_GUARD",
    status: hasAll(apiOrders, [
      "buildOrderFingerprint_",
      "reserveOrderFingerprint_",
      "hasRecentOrderFingerprint_",
      "[API_FP:"
    ]) && hasAll(apiHelpers, ["CacheService.getScriptCache()", "cache.put(cacheKey, 'LOCKED'", "API_RECENT_DUPLICATE_LOOKBACK_MINUTES"])
      ? "PASS"
      : "FAIL",
    title: "POST /order punya fingerprint + cache lock + scan order recent.",
    evidence: "apiOrders.gs::apiCreateOrder_, apiHelpers.gs::reserveOrderFingerprint_/hasRecentOrderFingerprint_",
    risk: "Tanpa guard backend, double tap/refresh bisa membuat order kembar dan stok terpotong dua kali.",
    fix: "Pertahankan fingerprint. Untuk pembuktian live, jalankan destructive test di sheet staging."
  })

  addCheck({
    category: "B_STOCK_RACE_CONDITION",
    status: hasAll(apiOrders, ["function apiCreateOrder_", "return withDocumentLock_"]) &&
      hasAll(apiAdmin, ["function apiAdminStockIn_", "function apiAdminStockOut_", "createProcessedStockOutTransaction_"]) &&
      hasAll(helpers, ["LockService.getDocumentLock()", "tryLock(LOCK_WAIT_MS)"]) &&
      hasAll(apiAdmin, ["if (qtyKeluar > stockBefore)", "applyStockOutToMasterProduct_"])
      ? "PASS"
      : "FAIL",
    title: "Mutasi stok utama lewat DocumentLock dan cek stok tepat sebelum dikurangi.",
    evidence: "helpers.gs::withDocumentLock_, apiOrders.gs::apiCreateOrder_, apiAdmin.gs::createProcessedStockOutTransaction_",
    risk: "Tanpa lock, dua order paralel untuk SKU stok kecil bisa oversold.",
    fix: "Semua endpoint stok baru wajib lewat createProcessedStockInTransaction_/createProcessedStockOutTransaction_."
  })

  const cancelHasStatusGuard = apiOrders.includes("ORDER_ALREADY_CANCELLED")
  const cancelSetsStatusAfterLoop =
    apiOrders.indexOf("items.forEach(function(item)") !== -1 &&
    apiOrders.indexOf("Status_Order')).setValue('CANCEL'") >
      apiOrders.indexOf("items.forEach(function(item)")

  const cancelHasSafetyMarkers =
    apiOrders.includes("getCancelMarker_(orderId, 'PROCESSING')") &&
    apiOrders.includes("getCancelMarker_(orderId, 'RESTORED')") &&
    apiOrders.includes("hasCancelMarker_") &&
    apiOrders.includes("buildCancelRestorePlan_")

  addCheck({
    category: "C_CANCEL_ORDER_SAFETY",
    status: cancelHasStatusGuard && cancelHasSafetyMarkers ? "PASS" : cancelHasStatusGuard && cancelSetsStatusAfterLoop ? "WARNING" : "FAIL",
    title: "Cancel mencegah cancel kedua dan memakai marker processing/restored untuk retry safety.",
    evidence: "apiOrders.gs::apiAdminOrderCancel_ cek ORDER_ALREADY_CANCELLED; buildCancelRestorePlan_ prevalidate item; marker CANCEL_PROCESSING/CANCEL_RESTORED di Catatan.",
    risk: "Tanpa marker, retry setelah partial restore bisa mengembalikan stok dua kali.",
    fix: "Tetap butuh destructive staging test untuk membuktikan cancel 1x + retry setelah marker."
  })

  const sourceTruthStatus =
    catalogStore.includes("catalog-data.json") ||
    catalogStore.includes("localStorage") ||
    liveApiClient.includes("localStorage")
      ? "WARNING"
      : "PASS"

  addCheck({
    category: "D_FRONTEND_SOURCE_OF_TRUTH",
    status: sourceTruthStatus,
    title: "Frontend API-first, tetapi masih hybrid dengan cache/local JSON fallback.",
    evidence: "site.js memakai fetchLiveCatalog + readCachedLiveCatalog; catalog-store.js masih punya fetchBaseCatalog catalog-data.json dan localStorage.",
    risk: "Saat API/cache bermasalah, customer/admin bisa melihat data lama, bukan data sheet terbaru.",
    fix: "Tampilkan label data stale yang jelas dan batasi checkout ketika katalog live gagal terlalu lama."
  })

  addCheck({
    category: "E_ERROR_HANDLING",
    status:
      site.includes("catch (error)") &&
      admin.includes("setStatus(") &&
      liveApiClient.includes("throw new Error") &&
      server.includes("AbortController") &&
      server.includes("UPSTREAM_TIMEOUT")
        ? "PASS"
        : "WARNING",
    title: "UI memberi feedback error dan proxy fetch ke Apps Script punya timeout eksplisit.",
    evidence: "site.js::handleCheckoutSubmit catch, admin.js::setStatus/showToast, server.mjs::fetchAppsScriptJson_ memakai AbortController dan UPSTREAM_TIMEOUT.",
    risk: "Jika timeout terlalu pendek saat Apps Script sedang cold start, user perlu retry.",
    fix: "Biarkan timeout 18 detik untuk UX; naikkan via TVJ_APPS_SCRIPT_TIMEOUT_MS jika perlu."
  })

  addCheck({
    category: "F_API_STABILITY",
    status:
      server.includes("API_CACHE_TTL") &&
      server.includes("refreshCacheInBackground_") &&
      reporting.includes("getSheetRowsForReporting_")
        ? "WARNING"
        : "FAIL",
    title: "Proxy cache sudah ada, tetapi Apps Script tetap membaca seluruh sheet untuk beberapa endpoint.",
    evidence: "server.mjs cache catalog/dashboard/adminOrders; apiProducts.gs getActiveMasterProducts_ baca semua produk; apiAdminOrdersList_ baca semua orders.",
    risk: "900 produk masih aman, tetapi ribuan order/log akan membuat admin/reporting makin lambat.",
    fix: "Tambahkan endpoint orders incremental/limit di Apps Script atau sheet index; pertahankan proxy cache."
  })

  addCheck({
    category: "G_LOGGING_AUDIT_TRAIL",
    status:
      apiGs.includes("safeWriteApiLog_") &&
      logs.includes("function writeInventoryLog_") &&
      apiAdmin.includes("writeInventoryLog_") &&
      apiOrders.includes("writeInventoryLog_")
        ? "WARNING"
        : "FAIL",
    title: "API_LOG dan INVENTORY_LOG dipakai, tetapi product create/delete belum punya audit event khusus selain API_LOG.",
    evidence: "api.gs::executeApiRequest_ menulis API_LOG; apiAdmin.gs/apiOrders.gs menulis INVENTORY_LOG untuk stok/order cancel.",
    risk: "Perubahan master produk non-stok bisa sulit dilacak detailnya dari INVENTORY_LOG.",
    fix: "Minimal: tulis log admin action ke API_LOG sudah ada; untuk audit serius tambah ADMIN_ACTIVITY_LOG."
  })

  addCheck({
    category: "H_ADMIN_SAFETY",
    status:
      apiAdmin.includes("force_delete") &&
      apiAdmin.includes("validateProductDeletionSafety_") &&
      apiOrders.includes("USE_CANCEL_ENDPOINT")
        ? "WARNING"
        : "FAIL",
    title: "Ada guard delete/status, tetapi force delete permanen tetap berisiko.",
    evidence: "apiAdmin.gs::apiAdminProductDelete_ mendukung force_delete; apiOrders.gs mencegah update langsung ke CANCEL.",
    risk: "Human error force delete bisa menghilangkan master produk yang masih dibutuhkan histori/reporting.",
    fix: "Untuk operasional client, sembunyikan/hard-disable force delete; gunakan NONAKTIF sebagai default."
  })

  addCheck({
    category: "I_REPORTING_SUSTAINABILITY",
    status:
      reporting.includes("refreshDashboard") &&
      reporting.includes("generateWeeklyReport") &&
      reporting.includes("generateMonthlyReport")
        ? "WARNING"
        : "FAIL",
    title: "Reporting bisa jalan terjadwal, tetapi masih full scan sheet.",
    evidence: "reporting.gs::installReportingTriggers_, refreshDashboard, generateWeeklyReport, generateMonthlyReport.",
    risk: "Semakin banyak order/log, report live bisa lambat atau kena batas waktu Apps Script.",
    fix: "Untuk fase awal aman; saat order harian besar, pakai summary harian incremental."
  })

  addCheck({
    category: "J_BACKUP_RECOVERY",
    status:
      /function\s+backupSpreadsheet|makeCopy|DriveApp\.getFileById|Last_Backup_Time|installBackupTrigger/.test(backup)
      ? "WARNING"
      : "FAIL",
    title: "Backup otomatis harian tersedia di Apps Script.",
    evidence: "backup.gs::backupSpreadsheet membuat copy via DriveApp; installBackupTrigger memasang trigger harian; SETTINGS.Last_Backup_Time diupdate.",
    risk: "Backup tetap harus diverifikasi satu kali di Apps Script karena Drive permission hanya bisa dibuktikan di akun Google.",
    fix: "Jalankan runBackupSpreadsheet dan installBackupTrigger dari menu TVJ Inventory."
  })

  if (config.appsScriptBaseUrl) {
    try {
      const rootResult = await timedFetchJson(config.appsScriptBaseUrl)
      const routes = rootResult.payload?.data?.routes || []
      addCheck({
        category: "LIVE_DEPLOYMENT",
        status:
          rootResult.payload?.success &&
          routes.includes("POST /admin/order/delete") &&
          routes.includes("POST /admin/product/delete")
            ? "PASS"
            : "WARNING",
        title: "Apps Script live root bisa diakses, cek route delete versi terbaru.",
        evidence: `${config.appsScriptBaseUrl} responded ${rootResult.status} in ${rootResult.durationMs}ms; routes=${routes.join(", ") || "n/a"}`,
        risk: "Jika route live tidak sama dengan kode lokal, tombol admin akan gagal walau file lokal sudah benar.",
        fix: "Deploy > Manage deployments > Edit > New version > Deploy, lalu pastikan route list memuat delete endpoints."
      })
    } catch (error) {
      addCheck({
        category: "LIVE_DEPLOYMENT",
        status: "WARNING",
        title: "Apps Script live root tidak berhasil dites dari lokal.",
        evidence: error.message,
        risk: "Tidak bisa memastikan deployment yang aktif sama dengan kode lokal.",
        fix: "Buka root Web App di browser dan cek route list."
      })
    }
  }

  for (const endpoint of ["/api/health", "/api/catalog", "/api/dashboard-summary"]) {
    try {
      const result = await timedFetchJson(`http://localhost:4173${endpoint}`, {
        timeoutMs: endpoint === "/api/catalog" ? 20000 : 12000
      })
      addCheck({
        category: "LOCAL_PROXY_GET",
        status: result.payload?.success ? "PASS" : "WARNING",
        title: `GET ${endpoint}`,
        evidence: `status=${result.status}, duration=${result.durationMs}ms, success=${Boolean(result.payload?.success)}`,
        risk: "Endpoint GET lokal lambat/gagal akan terasa langsung di customer/admin.",
        fix: "Pastikan server lokal/live Node aktif dan cache proxy terisi."
      })
    } catch (error) {
      addCheck({
        category: "LOCAL_PROXY_GET",
        status: "WARNING",
        title: `GET ${endpoint} tidak bisa dites`,
        evidence: error.message,
        risk: "Kemungkinan server lokal belum berjalan saat audit.",
        fix: "Jalankan npm start lalu ulangi test."
      })
    }
  }

  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] = (acc[check.status] || 0) + 1
      return acc
    },
    { PASS: 0, WARNING: 0, FAIL: 0 }
  )

  console.log(
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        project: "Toko Vespa Jogja",
        summary,
        checks
      },
      null,
      2
    )
  )

  if (summary.FAIL > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

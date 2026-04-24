import http from "node:http"
import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const localConfig = await loadLocalConfig_()

const PORT = Number(process.env.PORT || localConfig.port || 4173)
const HOST = process.env.HOST || localConfig.host || "0.0.0.0"
const APPS_SCRIPT_BASE_URL =
  process.env.TVJ_APPS_SCRIPT_URL || localConfig.appsScriptBaseUrl || ""
const APPS_SCRIPT_TIMEOUT_MS = Number(
  process.env.TVJ_APPS_SCRIPT_TIMEOUT_MS || localConfig.appsScriptTimeoutMs || 18_000
)
const PUBLIC_ORIGIN = process.env.TVJ_PUBLIC_ORIGIN || localConfig.publicOrigin || ""

if (!APPS_SCRIPT_BASE_URL) {
  throw new Error(
    "TVJ_APPS_SCRIPT_URL belum di-set. Isi via environment production atau server.config.json."
  )
}

const STATIC_MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
}

const PUBLIC_ROOT_FILES = new Set([
  "index.html",
  "admin.html",
  "reports.html",
  "system-monitor.html",
  "styles.css",
  "admin.css",
  "reports.css",
  "system-monitor.css",
  "site.js",
  "admin.js",
  "reports.js",
  "system-monitor.js",
  "live-api-client.js",
  "catalog-store.js",
  "catalog-data.json"
])

const API_CACHE_TTL = {
  catalog: 10 * 60_000,
  dashboard: 2 * 60_000,
  adminOrders: 30_000
}

const CACHE_DIR = path.join(__dirname, ".cache")
const CACHE_FILES = {
  catalog: path.join(CACHE_DIR, "catalog.json"),
  "dashboard-summary": path.join(CACHE_DIR, "dashboard-summary.json")
}

const apiCache = new Map()

await hydrateCacheFromDisk_()

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)

    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApiRequest(request, response, requestUrl)
      return
    }

    await serveStaticFile(response, requestUrl.pathname)
  } catch (error) {
    if (error?.statusCode === 404) {
      writeJson(response, 404, {
        success: false,
        message: "Halaman atau file tidak ditemukan.",
        data: null,
        error: {
          code: "NOT_FOUND",
          details: error.message
        }
      })
      return
    }

    writeJson(response, 500, {
      success: false,
      message: "Server lokal gagal memproses request.",
      data: null,
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Toko Vespa Jogja live server running on ${HOST}:${PORT}`)
  console.log(`Apps Script target: ${APPS_SCRIPT_BASE_URL}`)
  if (PUBLIC_ORIGIN) {
    console.log(`Public origin: ${PUBLIC_ORIGIN}`)
  }
  void warmProxyCache_()
})

async function handleApiRequest(request, response, requestUrl) {
  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    writeJson(response, 200, {
      success: true,
      message: "Proxy aktif.",
      data: {
        apps_script_url: APPS_SCRIPT_BASE_URL
      },
      error: null
    })
    return
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/catalog") {
    const forceFresh = requestUrl.searchParams.get("fresh") === "1"
    const payload = forceFresh
      ? await refreshCache_("catalog", () => fetchAllProducts_())
      : await getCachedPayload_("catalog", API_CACHE_TTL.catalog, () => fetchAllProducts_())
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/dashboard-summary") {
    const forceFresh = requestUrl.searchParams.get("fresh") === "1"
    const upstreamParams = new URLSearchParams(requestUrl.searchParams)
    upstreamParams.delete("fresh")
    const factory = () => fetchAppsScriptJson_("dashboard-summary", null, upstreamParams)
    const payload = forceFresh
      ? await refreshCache_("dashboard-summary", factory)
      : await getCachedPayload_("dashboard-summary", API_CACHE_TTL.dashboard, factory)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/order") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("order", body)
    invalidateInventoryCacheOnSuccess_(payload)
    invalidateAdminOrderCachesOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/order/reconcile") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("order/reconcile", body)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/product/create") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/product/create", body)
    invalidateInventoryCacheOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/product/update") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/product/update", body)
    invalidateInventoryCacheOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/product/delete") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/product/delete", body)
    invalidateInventoryCacheOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/marketplace/create") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/marketplace/create", body)
    invalidateInventoryCacheOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/marketplace/list") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/marketplace/list", body)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/stock/in") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/stock/in", body)
    invalidateInventoryCacheOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/stock/out") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/stock/out", body)
    invalidateInventoryCacheOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/orders/list") {
    const body = await readJsonBody_(request)
    const shouldForceFresh = body?.force === true
    const cacheKey = buildAdminOrdersCacheKey_(body)
    const payload = shouldForceFresh
      ? await fetchAppsScriptJson_("admin/orders/list", body)
      : await getCachedPayload_(
          cacheKey,
          API_CACHE_TTL.adminOrders,
          () => fetchAppsScriptJson_("admin/orders/list", body)
        )
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/order/update") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/order/update", body)
    invalidateInventoryCacheOnSuccess_(payload)
    invalidateAdminOrderCachesOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/order/cancel") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/order/cancel", body)
    invalidateInventoryCacheOnSuccess_(payload)
    invalidateAdminOrderCachesOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/order/delete") {
    const body = await readJsonBody_(request)
    const payload = await fetchAppsScriptJson_("admin/order/delete", body)
    invalidateAdminOrderCachesOnSuccess_(payload)
    writeJson(response, 200, payload)
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/system-monitor") {
    const body = await readJsonBody_(request)
    const startedAt = Date.now()
    const payload = await fetchAppsScriptJson_("admin/system-monitor", body)
    const latencyMs = Date.now() - startedAt

    if (payload?.success) {
      payload.data = {
        ...(payload.data || {}),
        status_cards: {
          ...(payload.data?.status_cards || {}),
          proxy: {
            status: "HEALTHY",
            label: "Aktif",
            detail: "Proxy Node menjawab dan berhasil menghubungi Apps Script.",
            latency_ms: latencyMs,
            checked_at: new Date().toISOString()
          }
        }
      }
    }

    writeJson(response, 200, payload)
    return
  }

  writeJson(response, 404, {
    success: false,
    message: "Endpoint proxy tidak ditemukan.",
    data: null,
    error: {
      code: "NOT_FOUND",
      details: requestUrl.pathname
    }
  })
}

async function fetchAllProducts_() {
  const limit = 1000
  const firstPayload = await fetchAppsScriptJson_("products", null, buildProductPageParams_(1, limit))

  if (!firstPayload.success) {
    return firstPayload
  }

  const products = Array.isArray(firstPayload.data) ? [...firstPayload.data] : []
  const totalPages = Number(firstPayload.meta?.total_pages || 1)

  if (totalPages > 1) {
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2)
    const remainingPayloads = await Promise.all(
      remainingPages.map((pageNumber) =>
        fetchAppsScriptJson_("products", null, buildProductPageParams_(pageNumber, limit))
      )
    )

    for (const payload of remainingPayloads) {
      if (!payload.success) {
        return payload
      }

      const pageItems = Array.isArray(payload.data) ? payload.data : []
      products.push(...pageItems)
    }
  }

  const updatedAt = products.reduce((latest, product) => {
    const value = String(product.last_updated || "").slice(0, 10)
    return value > latest ? value : latest
  }, "")

  return {
    success: true,
    message: "Katalog live berhasil diambil.",
    data: {
      products,
      updated_at: updatedAt,
      total: products.length
    },
    error: null,
    meta: null
  }
}

function buildProductPageParams_(page, limit) {
  return new URLSearchParams({
    page: String(page),
    limit: String(limit)
  })
}

async function getCachedPayload_(key, ttlMs, factory) {
  const now = Date.now()
  const cached = apiCache.get(key)

  if (cached?.payload?.success) {
    if (now - cached.fetchedAt <= ttlMs) {
      return cached.payload
    }

    void refreshCacheInBackground_(key, factory)
    return cached.payload
  }

  return refreshCache_(key, factory)
}

async function refreshCache_(key, factory) {
  const cached = apiCache.get(key)

  if (cached?.refreshPromise) {
    return cached.refreshPromise
  }

  const refreshPromise = (async () => {
    const payload = await factory()

    if (payload?.success) {
      const nextEntry = {
        payload,
        fetchedAt: Date.now(),
        refreshPromise: null
      }
      apiCache.set(key, nextEntry)
      await persistCacheSnapshot_(key, nextEntry)
      return payload
    }

    if (cached?.payload?.success) {
      return cached.payload
    }

    return payload
  })()

  apiCache.set(key, {
    payload: cached?.payload || null,
    fetchedAt: cached?.fetchedAt || 0,
    refreshPromise
  })

  try {
    return await refreshPromise
  } finally {
    const latest = apiCache.get(key)

    if (latest?.refreshPromise === refreshPromise) {
      apiCache.set(key, {
        payload: latest.payload,
        fetchedAt: latest.fetchedAt,
        refreshPromise: null
      })
    }
  }
}

function refreshCacheInBackground_(key, factory) {
  void refreshCache_(key, factory).catch((error) => {
    console.warn(`Background refresh gagal untuk cache "${key}": ${error.message}`)
  })
}

function invalidateInventoryCacheOnSuccess_(payload) {
  if (!payload?.success) {
    return
  }

  for (const key of Object.keys(CACHE_FILES)) {
    const cached = apiCache.get(key)

    if (!cached?.payload?.success) {
      apiCache.delete(key)
      continue
    }

    apiCache.set(key, {
      payload: cached.payload,
      fetchedAt: 0,
      refreshPromise: null
    })

    refreshCacheInBackground_(key, getCacheFactory_(key))
  }
}

function invalidateAdminOrderCachesOnSuccess_(payload) {
  if (!payload?.success) {
    return
  }

  for (const key of apiCache.keys()) {
    if (key.startsWith("admin-orders:")) {
      apiCache.delete(key)
    }
  }
}

function buildAdminOrdersCacheKey_(body = {}) {
  const tokenHash = createHash("sha256")
    .update(String(body.admin_token || ""))
    .digest("hex")
    .slice(0, 12)
  const cacheShape = {
    token: tokenHash,
    search: String(body.search || "").trim().toLowerCase(),
    page: Number(body.page || 1),
    limit: Number(body.limit || 8),
    status_order: String(body.status_order || "").trim().toUpperCase(),
    payment_status: String(body.payment_status || "").trim().toUpperCase()
  }

  return `admin-orders:${JSON.stringify(cacheShape)}`
}

function getCacheFactory_(key) {
  if (key === "catalog") {
    return () => fetchAllProducts_()
  }

  if (key === "dashboard-summary") {
    return () => fetchAppsScriptJson_("dashboard-summary")
  }

  throw new Error(`Factory cache belum diatur untuk key: ${key}`)
}

async function hydrateCacheFromDisk_() {
  await mkdir(CACHE_DIR, { recursive: true })

  for (const [key, filePath] of Object.entries(CACHE_FILES)) {
    try {
      const rawSnapshot = await readFile(filePath, "utf8")
      const snapshot = JSON.parse(rawSnapshot)

      if (!snapshot?.payload?.success) {
        continue
      }

      apiCache.set(key, {
        payload: snapshot.payload,
        fetchedAt: Number(snapshot.fetchedAt || 0),
        refreshPromise: null
      })
    } catch (error) {
      // Cache disk opsional. Kalau belum ada, server tetap lanjut jalan.
    }
  }
}

async function persistCacheSnapshot_(key, entry) {
  const filePath = CACHE_FILES[key]

  if (!filePath || !entry?.payload?.success) {
    return
  }

  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(
    filePath,
    JSON.stringify(
      {
        fetchedAt: entry.fetchedAt,
        payload: entry.payload
      },
      null,
      2
    ),
    "utf8"
  )
}

async function warmProxyCache_() {
  refreshCacheInBackground_("catalog", getCacheFactory_("catalog"))
  refreshCacheInBackground_("dashboard-summary", getCacheFactory_("dashboard-summary"))
}

async function fetchAppsScriptJson_(route, body, searchParams) {
  const targetUrl = new URL(APPS_SCRIPT_BASE_URL)
  targetUrl.searchParams.set("route", route)
  const controller = new AbortController()
  const timeoutTimer = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS)

  if (searchParams) {
    for (const [key, value] of searchParams.entries()) {
      if (key === "route") {
        continue
      }
      targetUrl.searchParams.set(key, value)
    }
  }

  const requestOptions = {
    method: body ? "POST" : "GET",
    redirect: "follow",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json"
    }
  }

  if (body) {
    requestOptions.body = JSON.stringify(body)
  }

  let upstreamResponse
  let textPayload

  try {
    upstreamResponse = await fetch(targetUrl, requestOptions)
    textPayload = await upstreamResponse.text()
  } catch (error) {
    if (error.name === "AbortError") {
      console.warn(
        `Apps Script timeout route="${route}" after ${APPS_SCRIPT_TIMEOUT_MS}ms`
      )
      return {
        success: false,
        message: "Sistem sedang lambat, coba ulang beberapa detik lagi.",
        data: null,
        error: {
          code: "UPSTREAM_TIMEOUT",
          details: {
            route,
            timeout_ms: APPS_SCRIPT_TIMEOUT_MS
          }
        },
        meta: null
      }
    }

    console.warn(`Apps Script fetch gagal route="${route}": ${error.message}`)
    return {
      success: false,
      message: "Koneksi ke sistem inventory sedang bermasalah. Coba ulang beberapa detik lagi.",
      data: null,
      error: {
        code: "UPSTREAM_FETCH_FAILED",
        details: error.message
      },
      meta: null
    }
  } finally {
    clearTimeout(timeoutTimer)
  }

  try {
    return JSON.parse(textPayload)
  } catch (error) {
    return {
      success: false,
      message: "Apps Script mengembalikan response yang tidak valid.",
      data: null,
      error: {
        code: "INVALID_UPSTREAM_RESPONSE",
        details: textPayload.slice(0, 500)
      },
      meta: {
        status: upstreamResponse.status
      }
    }
  }
}

async function readJsonBody_(request) {
  return new Promise((resolve, reject) => {
    let raw = ""

    request.on("data", (chunk) => {
      raw += chunk
    })

    request.on("end", () => {
      if (!raw.trim()) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(new Error("Body request harus JSON valid."))
      }
    })

    request.on("error", reject)
  })
}

async function serveStaticFile(response, pathname) {
  const safePath = resolveSafePath_(pathname)
  const finalPath = await resolveFilePath_(safePath)
  const extension = path.extname(finalPath).toLowerCase()
  const mimeType = STATIC_MIME_TYPES[extension] || "application/octet-stream"
  const content = await readFile(finalPath)

  response.writeHead(200, {
    "Content-Type": mimeType,
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=300"
  })
  response.end(content)
}

function resolveSafePath_(pathname) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname
  const cleanPath = path
    .normalize(normalizedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "")

  if (!isPublicStaticPath_(cleanPath)) {
    const error = new Error("File tidak diizinkan.")
    error.statusCode = 404
    throw error
  }

  return path.join(__dirname, cleanPath)
}

async function resolveFilePath_(safePath) {
  const fileStat = await safeStat_(safePath)
  if (fileStat?.isFile()) {
    return safePath
  }

  if (!path.extname(safePath)) {
    const htmlCandidate = `${safePath}.html`
    const htmlStat = await safeStat_(htmlCandidate)
    if (htmlStat?.isFile()) {
      return htmlCandidate
    }
  }

  const error = new Error("File tidak ditemukan.")
  error.statusCode = 404
  throw error
}

async function safeStat_(targetPath) {
  try {
    return await stat(targetPath)
  } catch (error) {
    return null
  }
}

function isPublicStaticPath_(cleanPath) {
  if (!cleanPath) {
    return false
  }

  if (cleanPath.startsWith("assets/") || cleanPath.startsWith("assets\\")) {
    return true
  }

  const normalized = cleanPath.replace(/\\/g, "/")

  if (PUBLIC_ROOT_FILES.has(normalized)) {
    return true
  }

  if (!path.extname(normalized)) {
    return PUBLIC_ROOT_FILES.has(`${normalized}.html`)
  }

  return false
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  })
  response.end(JSON.stringify(payload))
}

async function loadLocalConfig_() {
  const configPath = path.join(__dirname, "server.config.json")

  try {
    const raw = await readFile(configPath, "utf8")
    return JSON.parse(raw)
  } catch (error) {
    return {}
  }
}

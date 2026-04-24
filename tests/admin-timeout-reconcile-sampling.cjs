const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")

let playwright = null
try {
  playwright = require("playwright")
} catch (error) {
  playwright = null
}

const ROOT = path.resolve(__dirname, "..")
const BASE_URL = process.env.TVJ_BASE_URL || "http://localhost:4173"
const TIMEOUT_PROXY_PORT = Number(process.env.TVJ_TIMEOUT_PROXY_PORT || 4191)
const TIMEOUT_PROXY_URL = `http://localhost:${TIMEOUT_PROXY_PORT}`
const OUTPUT_PATH = path.join(
  ROOT,
  "outputs",
  `admin-timeout-reconcile-${new Date().toISOString().slice(0, 10)}.json`
)
const TOKEN_FILE = path.join(ROOT, "outputs", "_system_monitor_req.json")
const ADMIN_TOKEN =
  String(process.env.TVJ_ADMIN_API_TOKEN || "").trim() || readTokenFromFile_(TOKEN_FILE)
const DUMMIES = ["QA-TEST-001", "QA-TEST-002"]

function readTokenFromFile_(filePath) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"))
    return String(payload.admin_token || "").trim()
  } catch (error) {
    return ""
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function timedFetchJson(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    })
    const text = await response.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch (error) {
      payload = {
        success: false,
        message: "Invalid JSON response",
        raw: text.slice(0, 500)
      }
    }
    return {
      httpStatus: response.status,
      payload
    }
  } catch (error) {
    return {
      httpStatus: 0,
      payload: {
        success: false,
        message: error.name === "AbortError" ? "Request timeout" : error.message,
        error: {
          code: error.name === "AbortError" ? "CLIENT_TIMEOUT" : "FETCH_FAILED"
        }
      }
    }
  } finally {
    clearTimeout(timer)
  }
}

async function postJson(baseUrl, pathname, body, timeoutMs = 45000) {
  return timedFetchJson(
    `${baseUrl}${pathname}`,
    {
      method: "POST",
      body: JSON.stringify(body || {})
    },
    timeoutMs
  )
}

async function adminPost(baseUrl, pathname, body, timeoutMs = 45000) {
  return postJson(baseUrl, pathname, { admin_token: ADMIN_TOKEN, ...(body || {}) }, timeoutMs)
}

async function getCatalogFresh() {
  const response = await timedFetchJson(`${BASE_URL}/api/catalog?fresh=1`, { method: "GET" })
  if (!response.payload?.success) {
    throw new Error(response.payload?.message || "Katalog gagal dimuat.")
  }
  return response.payload.data?.products || []
}

async function getStockMap() {
  const products = await getCatalogFresh()
  return Object.fromEntries(
    DUMMIES.map((sku) => {
      const product = products.find((item) => item.sku === sku)
      return [sku, product ? Number(product.stok_aktif || 0) : null]
    })
  )
}

async function fetchOrders(search) {
  const response = await adminPost(
    BASE_URL,
    "/api/admin/orders/list",
    {
      search,
      page: 1,
      limit: 20,
      force: true
    },
    45000
  )
  return response.payload
}

async function ensureDummyProductsActive() {
  const payloads = [
    {
      sku: "QA-TEST-001",
      nama_produk: "QA INTERNAL DUPLICATE TEST 001",
      kategori: "Aksesoris",
      model_vespa: "QA",
      harga_jual: 11000,
      stok_aktif: 5,
      berat: 0.1,
      status_produk: "AKTIF"
    },
    {
      sku: "QA-TEST-002",
      nama_produk: "QA INTERNAL RACE TEST 002",
      kategori: "Mesin",
      model_vespa: "QA",
      harga_jual: 14000,
      stok_aktif: 2,
      berat: 0.15,
      status_produk: "AKTIF"
    }
  ]

  for (const payload of payloads) {
    const response = await adminPost(BASE_URL, "/api/admin/product/update", payload, 45000)
    if (!response.payload?.success) {
      throw new Error(response.payload?.message || `Setup dummy gagal untuk ${payload.sku}`)
    }
    await sleep(250)
  }
}

async function resetDummyProducts() {
  const payloads = [
    { sku: "QA-TEST-001", stok_aktif: 5, status_produk: "NONAKTIF" },
    { sku: "QA-TEST-002", stok_aktif: 2, status_produk: "NONAKTIF" }
  ]

  for (const payload of payloads) {
    await adminPost(BASE_URL, "/api/admin/product/update", payload, 45000)
    await sleep(250)
  }
}

async function startTimeoutProxy() {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TIMEOUT_PROXY_PORT),
      TVJ_APPS_SCRIPT_TIMEOUT_MS: "8000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  })

  let stdout = ""
  let stderr = ""

  child.stdout.on("data", (chunk) => {
    stdout += String(chunk)
  })
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk)
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout proxy start timeout")), 12000)
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes(TIMEOUT_PROXY_URL)) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.on("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`Timeout proxy exited early with code ${code}`))
    })
  })

  return {
    child,
    getLogs() {
      return {
        stdout: stdout.trim().split(/\r?\n/).slice(-12),
        stderr: stderr.trim().split(/\r?\n/).slice(-12)
      }
    }
  }
}

async function runBrowserAdminAction(actionName, orderId) {
  if (!playwright) {
    throw new Error("Playwright tidak tersedia untuk retest admin timeout.")
  }

  const { chromium } = playwright
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  })

  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
    await context.addInitScript(
      ({ token }) => {
        localStorage.setItem("toko-vespa-jogja-admin-api-token-v1", token)
      },
      { token: ADMIN_TOKEN }
    )
    const page = await context.newPage()

    await page.route("**/api/admin/order/cancel", async (route) => {
      const request = route.request()
      const body = request.postData() || "{}"
      const upstream = await timedFetchJson(`${TIMEOUT_PROXY_URL}/api/admin/order/cancel`, {
        method: "POST",
        body
      })
      await route.fulfill({
        status: upstream.httpStatus || 200,
        contentType: "application/json",
        body: JSON.stringify(upstream.payload || {})
      })
    })

    await page.route("**/api/admin/order/delete", async (route) => {
      const request = route.request()
      const body = request.postData() || "{}"
      const upstream = await timedFetchJson(`${TIMEOUT_PROXY_URL}/api/admin/order/delete`, {
        method: "POST",
        body
      })
      await route.fulfill({
        status: upstream.httpStatus || 200,
        contentType: "application/json",
        body: JSON.stringify(upstream.payload || {})
      })
    })

    await page.goto(`${BASE_URL}/admin.html`, { waitUntil: "networkidle" })

    const result = await page.evaluate(async ({ actionName, orderId }) => {
      const mod = await import("/live-api-client.js")
      if (actionName === "cancel") {
        return mod.cancelAdminOrder({
          orderId,
          actor: "QA_STRESS",
          note: "QA admin timeout cancel retest"
        })
      }

      return mod.deleteAdminOrder({
        orderId,
        actor: "QA_STRESS"
      })
    }, { actionName, orderId })

    await context.close()
    return result
  } finally {
    await browser.close()
  }
}

async function main() {
  if (!ADMIN_TOKEN) {
    throw new Error("ADMIN token tidak ditemukan. Isi TVJ_ADMIN_API_TOKEN atau outputs/_system_monitor_req.json.")
  }

  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    timeoutProxyUrl: TIMEOUT_PROXY_URL,
    scenario: "admin cancel/delete timeout reconcile",
    beforeStock: null,
    orderCreate: null,
    cancelResult: null,
    deleteResult: null,
    afterCreateStock: null,
    afterCancelStock: null,
    finalOrderLookup: null,
    status: "UNKNOWN",
    notes: []
  }

  let proxy = null
  let orderId = null
  const customerName = `QA ADMIN RECON ${Date.now()}`

  try {
    await ensureDummyProductsActive()
    report.beforeStock = await getStockMap()

    const createResponse = await postJson(
      BASE_URL,
      "/api/order",
      {
        customer_name: customerName,
        customer_whatsapp: "620000000701",
        customer_address: "ADDR QA ADMIN TIMEOUT",
        items: [
          { sku: "QA-TEST-001", qty: 1 },
          { sku: "QA-TEST-002", qty: 1 }
        ]
      },
      45000
    )

    report.orderCreate = createResponse.payload
    if (!createResponse.payload?.success) {
      throw new Error(createResponse.payload?.message || "Create dummy order gagal.")
    }

    orderId = createResponse.payload?.data?.order_id || ""
    report.afterCreateStock = await getStockMap()
    proxy = await startTimeoutProxy()

    report.cancelResult = await runBrowserAdminAction("cancel", orderId)
    await sleep(1500)
    report.afterCancelStock = await getStockMap()

    const afterCancelOrders = await fetchOrders(orderId)
    report.notes.push({
      afterCancelOrders: afterCancelOrders?.data?.orders || []
    })

    report.deleteResult = await runBrowserAdminAction("delete", orderId)
    await sleep(1500)

    const finalOrderLookup = await fetchOrders(orderId)
    report.finalOrderLookup = finalOrderLookup?.data?.orders || []

    const cancelConfirmed =
      report.cancelResult?.reconciled === true &&
      report.cancelResult?.reconciled_action === "cancel"
    const deleteConfirmed =
      (report.deleteResult?.reconciled === true &&
        report.deleteResult?.reconciled_action === "delete") ||
      Boolean(report.deleteResult?.deleted_order_id)
    const stocksRestored =
      report.afterCancelStock?.["QA-TEST-001"] === report.beforeStock?.["QA-TEST-001"] &&
      report.afterCancelStock?.["QA-TEST-002"] === report.beforeStock?.["QA-TEST-002"]
    const orderDeleted = Array.isArray(report.finalOrderLookup) && report.finalOrderLookup.length === 0

    report.status = cancelConfirmed && deleteConfirmed && stocksRestored && orderDeleted ? "PASS" : "WARNING"
  } finally {
    if (proxy?.child) {
      proxy.child.kill("SIGTERM")
      await sleep(400)
      report.proxyLogs = proxy.getLogs()
    }

    if (orderId) {
      try {
        const maybeOrders = await fetchOrders(orderId)
        const orders = maybeOrders?.data?.orders || []
        if (orders.length) {
          await adminPost(
            BASE_URL,
            "/api/admin/order/cancel",
            {
              order_id: orderId,
              actor: "QA_STRESS",
              note: "QA admin timeout cleanup cancel"
            },
            45000
          )
          await sleep(500)
          await adminPost(
            BASE_URL,
            "/api/admin/order/delete",
            {
              order_id: orderId,
              actor: "QA_STRESS"
            },
            45000
          )
          await sleep(500)
        }
      } catch (error) {
        report.notes.push({
          cleanupError: error.message
        })
      }
    }

    try {
      await resetDummyProducts()
    } catch (error) {
      report.notes.push({
        resetDummyError: error.message
      })
    }

    report.finishedAt = new Date().toISOString()
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

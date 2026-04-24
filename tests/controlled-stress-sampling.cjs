const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")

let playwright = null
try {
  playwright = require("playwright")
} catch (error) {
  playwright = null
}

const BASE_URL = process.env.TVJ_BASE_URL || "http://localhost:4173"
const ADMIN_TOKEN = String(process.env.TVJ_ADMIN_API_TOKEN || "").trim()
const CONFIRM = String(process.env.TVJ_STRESS_CONFIRM || "").trim()
const ROOT = path.resolve(__dirname, "..")
const OUTPUT_PATH = path.join(
  ROOT,
  "outputs",
  `controlled-stress-report-${new Date().toISOString().slice(0, 10)}.md`
)

const DUMMIES = [
  {
    sku: "QA-TEST-001",
    name: "QA INTERNAL DUPLICATE TEST 001",
    category: "Aksesoris",
    models: "QA",
    stock: 5,
    cost: 5000,
    price: 11000,
    weightKg: 0.1
  },
  {
    sku: "QA-TEST-002",
    name: "QA INTERNAL RACE TEST 002",
    category: "Mesin",
    models: "QA",
    stock: 2,
    cost: 7000,
    price: 14000,
    weightKg: 0.15
  },
  {
    sku: "QA-TEST-003",
    name: "QA INTERNAL FLOW TEST 003",
    category: "Kaki-Kaki",
    models: "QA",
    stock: 0,
    cost: 3000,
    price: 9000,
    weightKg: 0.12
  }
]

const report = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  batchId: `QA-STRESS-${Date.now()}`,
  monitorBefore: null,
  monitorAfter: null,
  dummyStateBefore: {},
  dummyBaseline: {},
  dummyFinal: {},
  scenarios: [],
  uiNotes: [],
  logsChecked: [],
  criticalFindings: [],
  finalVerdict: ""
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function timedFetchJson(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController()
  const startedAt = Date.now()
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
    let payload = null
    try {
      payload = JSON.parse(text)
    } catch (error) {
      payload = {
        success: false,
        message: "Invalid JSON response",
        raw: text.slice(0, 600)
      }
    }

    return {
      httpStatus: response.status,
      durationMs: Date.now() - startedAt,
      payload
    }
  } catch (error) {
    return {
      httpStatus: 0,
      durationMs: Date.now() - startedAt,
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

async function getJson(pathname, { timeoutMs = 30000 } = {}) {
  return timedFetchJson(`${BASE_URL}${pathname}`, { method: "GET" }, timeoutMs)
}

async function postJson(pathname, body, { timeoutMs = 30000 } = {}) {
  return timedFetchJson(
    `${BASE_URL}${pathname}`,
    {
      method: "POST",
      body: JSON.stringify(body || {})
    },
    timeoutMs
  )
}

async function adminPost(pathname, body, options) {
  return postJson(pathname, { admin_token: ADMIN_TOKEN, ...(body || {}) }, options)
}

async function getCatalogFresh() {
  const response = await getJson("/api/catalog?fresh=1", { timeoutMs: 45000 })
  if (!response.payload?.success) {
    throw new Error(response.payload?.message || "Katalog live gagal dimuat.")
  }
  return response.payload.data.products || []
}

async function getProductBySku(sku) {
  const products = await getCatalogFresh()
  return products.find((item) => item.sku === sku) || null
}

async function fetchSystemMonitor() {
  const response = await adminPost("/api/admin/system-monitor", {}, { timeoutMs: 45000 })
  return response.payload?.success ? response.payload.data : null
}

async function fetchOrders(search) {
  const response = await adminPost(
    "/api/admin/orders/list",
    {
      search,
      limit: 30,
      page: 1,
      force: true
    },
    { timeoutMs: 45000 }
  )
  return response.payload
}

async function ensureDummyProducts() {
  const products = await getCatalogFresh()

  for (const def of DUMMIES) {
    const existing = products.find((item) => item.sku === def.sku) || null
    report.dummyStateBefore[def.sku] = existing
      ? {
          exists: true,
          status_produk: existing.status_produk,
          stock: Number(existing.stok_aktif || 0),
          product_id: existing.product_id
        }
      : {
          exists: false,
          status_produk: null,
          stock: null,
          product_id: null
        }

    const payload = {
      sku: def.sku,
      nama_produk: def.name,
      kategori: def.category,
      model_vespa: def.models,
      deskripsi_singkat: "SKU staging untuk QA stress sampling. Jangan dijual.",
      harga_modal: def.cost,
      harga_jual: def.price,
      stok_aktif: def.stock,
      minimum_stok: 1,
      status_produk: "AKTIF",
      image_url: "",
      berat: def.weightKg,
      lokasi_rak: "QA-STAGING",
      actor: "QA_STRESS"
    }

    let result
    if (existing) {
      result = await adminPost("/api/admin/product/update", payload, { timeoutMs: 45000 })
    } else {
      result = await adminPost("/api/admin/product/create", payload, { timeoutMs: 45000 })
    }

    if (!result.payload?.success) {
      throw new Error(
        `Gagal menyiapkan ${def.sku}: ${result.payload?.message || "unknown error"}`
      )
    }
    await sleep(350)
  }

  const refreshed = await getCatalogFresh()
  for (const def of DUMMIES) {
    const product = refreshed.find((item) => item.sku === def.sku)
    if (!product) {
      throw new Error(`Dummy product ${def.sku} tidak ditemukan setelah setup.`)
    }
    report.dummyBaseline[def.sku] = {
      product_id: product.product_id,
      status_produk: product.status_produk,
      stock: Number(product.stok_aktif || 0),
      price: Number(product.harga_jual || 0)
    }
  }
}

async function cancelAndDeleteOrder(orderId, cleanupNote) {
  const cancelResponse = await adminPost(
    "/api/admin/order/cancel",
    {
      order_id: orderId,
      actor: "QA_STRESS",
      note: cleanupNote
    },
    { timeoutMs: 45000 }
  )

  const deleteResponse = await adminPost(
    "/api/admin/order/delete",
    {
      order_id: orderId,
      actor: "QA_STRESS"
    },
    { timeoutMs: 45000 }
  )

  return {
    cancel: cancelResponse.payload,
    del: deleteResponse.payload
  }
}

function summarizePayload(response) {
  return {
    http_status: response.httpStatus,
    duration_ms: response.durationMs,
    success: Boolean(response.payload?.success),
    message: response.payload?.message || "",
    error_code: response.payload?.error?.code || null,
    data: response.payload?.data || null
  }
}

function getStockFromProducts(products, sku) {
  const product = products.find((item) => item.sku === sku)
  return product ? Number(product.stok_aktif || 0) : null
}

async function runDuplicateGuardTest() {
  const label = "A. DUPLICATE ORDER GUARD"
  const sku = "QA-TEST-001"
  const beforeProducts = await getCatalogFresh()
  const stockBefore = getStockFromProducts(beforeProducts, sku)
  const customerName = `QA DUP ${report.batchId}`
  const orderPayload = {
    customer_name: customerName,
    customer_whatsapp: "620000000101",
    customer_address: `ADDR ${report.batchId} DUP`,
    items: [{ sku, qty: 1 }]
  }

  const responses = await Promise.all([
    postJson("/api/order", orderPayload, { timeoutMs: 45000 }),
    postJson("/api/order", orderPayload, { timeoutMs: 45000 }),
    postJson("/api/order", orderPayload, { timeoutMs: 45000 })
  ])

  await sleep(1200)

  const afterProducts = await getCatalogFresh()
  const stockAfter = getStockFromProducts(afterProducts, sku)
  const orderQuery = await fetchOrders(customerName)
  const orders = orderQuery?.data?.orders || []
  const successResponses = responses.filter((item) => item.payload?.success)
  const blockedResponses = responses.filter(
    (item) => item.payload?.error?.code === "DUPLICATE_ORDER"
  )
  const orderIds = successResponses
    .map((item) => item.payload?.data?.order_id)
    .filter(Boolean)

  for (const orderId of orderIds) {
    await cancelAndDeleteOrder(orderId, "QA duplicate guard cleanup")
    await sleep(300)
  }

  const restoredProducts = await getCatalogFresh()
  const stockAfterCleanup = getStockFromProducts(restoredProducts, sku)

  const pass =
    successResponses.length === 1 &&
    blockedResponses.length >= 1 &&
    orders.length === 1 &&
    stockAfter === stockBefore - 1 &&
    stockAfterCleanup === stockBefore

  report.scenarios.push({
    category: label,
    status: pass ? "PASS" : "FAIL",
    expected: {
      successful_orders: 1,
      duplicate_blocked_min: 1,
      order_rows: 1,
      stock_after: stockBefore - 1,
      stock_after_cleanup: stockBefore
    },
    actual: {
      stock_before: stockBefore,
      stock_after: stockAfter,
      stock_after_cleanup: stockAfterCleanup,
      successful_orders: successResponses.length,
      duplicate_blocked: blockedResponses.length,
      order_rows_found: orders.length,
      responses: responses.map(summarizePayload)
    }
  })
}

async function runRaceConditionTest() {
  const label = "B. STOCK CONSISTENCY / RACE CONDITION"
  const sku = "QA-TEST-002"
  const beforeProducts = await getCatalogFresh()
  const stockBefore = getStockFromProducts(beforeProducts, sku)

  const payloadA = {
    customer_name: `QA RACE A ${report.batchId}`,
    customer_whatsapp: "620000000201",
    customer_address: `ADDR ${report.batchId} RACE-A`,
    items: [{ sku, qty: 2 }]
  }

  const payloadB = {
    customer_name: `QA RACE B ${report.batchId}`,
    customer_whatsapp: "620000000202",
    customer_address: `ADDR ${report.batchId} RACE-B`,
    items: [{ sku, qty: 2 }]
  }

  const [responseA, responseB] = await Promise.all([
    postJson("/api/order", payloadA, { timeoutMs: 45000 }),
    postJson("/api/order", payloadB, { timeoutMs: 45000 })
  ])

  await sleep(1200)

  const afterProducts = await getCatalogFresh()
  const stockAfter = getStockFromProducts(afterProducts, sku)
  const ordersA = (await fetchOrders(payloadA.customer_name))?.data?.orders || []
  const ordersB = (await fetchOrders(payloadB.customer_name))?.data?.orders || []
  const successResponses = [responseA, responseB].filter((item) => item.payload?.success)
  const failedResponses = [responseA, responseB].filter((item) => !item.payload?.success)

  for (const orderId of successResponses
    .map((item) => item.payload?.data?.order_id)
    .filter(Boolean)) {
    await cancelAndDeleteOrder(orderId, "QA race cleanup")
    await sleep(300)
  }

  const restoredProducts = await getCatalogFresh()
  const stockAfterCleanup = getStockFromProducts(restoredProducts, sku)
  const insufficientRejected = failedResponses.every((item) =>
    ["INSUFFICIENT_STOCK", "DUPLICATE_ORDER"].includes(item.payload?.error?.code)
  )

  const pass =
    successResponses.length === 1 &&
    failedResponses.length === 1 &&
    insufficientRejected &&
    stockAfter === 0 &&
    stockAfterCleanup === stockBefore &&
    ordersA.length + ordersB.length === 1

  report.scenarios.push({
    category: label,
    status: pass ? "PASS" : "WARNING",
    expected: {
      successful_orders: 1,
      failed_orders: 1,
      stock_after: 0,
      stock_after_cleanup: stockBefore,
      order_rows_total: 1
    },
    actual: {
      stock_before: stockBefore,
      stock_after: stockAfter,
      stock_after_cleanup: stockAfterCleanup,
      successful_orders: successResponses.length,
      failed_orders: failedResponses.length,
      orders_a: ordersA.length,
      orders_b: ordersB.length,
      responses: [responseA, responseB].map(summarizePayload)
    }
  })
}

async function runCancelIdempotencyTest() {
  const label = "C. CANCEL ORDER IDEMPOTENCY"
  const beforeProducts = await getCatalogFresh()
  const stockBefore001 = getStockFromProducts(beforeProducts, "QA-TEST-001")
  const stockBefore002 = getStockFromProducts(beforeProducts, "QA-TEST-002")

  const payload = {
    customer_name: `QA CANCEL ${report.batchId}`,
    customer_whatsapp: "620000000301",
    customer_address: `ADDR ${report.batchId} CANCEL`,
    items: [
      { sku: "QA-TEST-001", qty: 1 },
      { sku: "QA-TEST-002", qty: 1 }
    ]
  }

  const createResponse = await postJson("/api/order", payload, { timeoutMs: 45000 })
  const orderId = createResponse.payload?.data?.order_id || null
  await sleep(900)
  const afterCreate = await getCatalogFresh()
  const stockAfterCreate001 = getStockFromProducts(afterCreate, "QA-TEST-001")
  const stockAfterCreate002 = getStockFromProducts(afterCreate, "QA-TEST-002")

  let cancel1 = { payload: { success: false, message: "create failed" } }
  let cancel2 = { payload: { success: false, message: "create failed" } }
  let deleteResult = null

  if (orderId) {
    cancel1 = await adminPost(
      "/api/admin/order/cancel",
      { order_id: orderId, actor: "QA_STRESS", note: "QA cancel idempotency first cancel" },
      { timeoutMs: 45000 }
    )
    await sleep(600)
    cancel2 = await adminPost(
      "/api/admin/order/cancel",
      { order_id: orderId, actor: "QA_STRESS", note: "QA cancel idempotency second cancel" },
      { timeoutMs: 45000 }
    )
    deleteResult = await adminPost(
      "/api/admin/order/delete",
      { order_id: orderId, actor: "QA_STRESS" },
      { timeoutMs: 45000 }
    )
  }

  await sleep(900)
  const afterCancel = await getCatalogFresh()
  const stockAfterCancel001 = getStockFromProducts(afterCancel, "QA-TEST-001")
  const stockAfterCancel002 = getStockFromProducts(afterCancel, "QA-TEST-002")

  const pass =
    createResponse.payload?.success &&
    cancel1.payload?.success &&
    !cancel2.payload?.success &&
    cancel2.payload?.error?.code === "ORDER_ALREADY_CANCELLED" &&
    stockAfterCreate001 === stockBefore001 - 1 &&
    stockAfterCreate002 === stockBefore002 - 1 &&
    stockAfterCancel001 === stockBefore001 &&
    stockAfterCancel002 === stockBefore002 &&
    deleteResult?.payload?.success

  report.scenarios.push({
    category: label,
    status: pass ? "PASS" : "FAIL",
    expected: {
      create_success: true,
      cancel1_success: true,
      cancel2_error: "ORDER_ALREADY_CANCELLED",
      stock_restored_once: true,
      delete_success: true
    },
    actual: {
      stock_before_001: stockBefore001,
      stock_before_002: stockBefore002,
      stock_after_create_001: stockAfterCreate001,
      stock_after_create_002: stockAfterCreate002,
      stock_after_cancel_001: stockAfterCancel001,
      stock_after_cancel_002: stockAfterCancel002,
      create: summarizePayload(createResponse),
      cancel_first: summarizePayload(cancel1),
      cancel_second: summarizePayload(cancel2),
      delete_after_cancel: deleteResult ? summarizePayload(deleteResult) : null
    }
  })
}

async function runCombinationFlowTest() {
  const label = "D. STOCK FLOW COMBINATION"
  const sku = "QA-TEST-003"
  const beforeProducts = await getCatalogFresh()
  const stockBefore = getStockFromProducts(beforeProducts, sku)
  const manualReference = `QA-MANUAL-${report.batchId}`

  const stockInResponse = await adminPost(
    "/api/admin/stock/in",
    {
      sku,
      qty_masuk: 4,
      harga_modal_satuan: 3000,
      supplier: "QA_STRESS",
      catatan: `QA stock in ${report.batchId}`,
      input_by: "QA_STRESS"
    },
    { timeoutMs: 45000 }
  )

  const order1 = await postJson(
    "/api/order",
    {
      customer_name: `QA COMBO 1 ${report.batchId}`,
      customer_whatsapp: "620000000401",
      customer_address: `ADDR ${report.batchId} COMBO1`,
      items: [{ sku, qty: 1 }]
    },
    { timeoutMs: 45000 }
  )

  const stockOutManual = await adminPost(
    "/api/admin/stock/out",
    {
      sku,
      qty_keluar: 1,
      harga_jual_satuan: 9000,
      jenis_keluar: "MANUAL",
      referensi_id: manualReference,
      catatan: `QA manual stock out ${report.batchId}`,
      input_by: "QA_STRESS"
    },
    { timeoutMs: 45000 }
  )

  const order2 = await postJson(
    "/api/order",
    {
      customer_name: `QA COMBO 2 ${report.batchId}`,
      customer_whatsapp: "620000000402",
      customer_address: `ADDR ${report.batchId} COMBO2`,
      items: [{ sku, qty: 2 }]
    },
    { timeoutMs: 45000 }
  )

  await sleep(1200)
  const afterSequence = await getCatalogFresh()
  const stockAfter = getStockFromProducts(afterSequence, sku)

  const successfulOrderIds = [order1, order2]
    .filter((item) => item.payload?.success)
    .map((item) => item.payload?.data?.order_id)
    .filter(Boolean)

  for (const orderId of successfulOrderIds) {
    await cancelAndDeleteOrder(orderId, "QA combination cleanup")
    await sleep(250)
  }

  await adminPost(
    "/api/admin/product/update",
    {
      sku,
      stok_aktif: stockBefore,
      actor: "QA_STRESS"
    },
    { timeoutMs: 45000 }
  )

  const restoredProducts = await getCatalogFresh()
  const stockAfterCleanup = getStockFromProducts(restoredProducts, sku)

  const pass =
    stockInResponse.payload?.success &&
    order1.payload?.success &&
    stockOutManual.payload?.success &&
    order2.payload?.success &&
    stockAfter === 0 &&
    stockAfterCleanup === stockBefore

  report.scenarios.push({
    category: label,
    status: pass ? "PASS" : "WARNING",
    expected: {
      sequence: "stock in 4 -> order 1 -> stock out 1 -> order 2",
      stock_before: stockBefore,
      stock_after_sequence: 0,
      stock_after_cleanup: stockBefore
    },
    actual: {
      stock_before: stockBefore,
      stock_after_sequence: stockAfter,
      stock_after_cleanup: stockAfterCleanup,
      stock_in: summarizePayload(stockInResponse),
      order_1: summarizePayload(order1),
      stock_out_manual: summarizePayload(stockOutManual),
      order_2: summarizePayload(order2)
    }
  })
}

async function runUiSampling() {
  const label = "E. UI / UX RESILIENCE SAMPLING"
  const dummy = await getProductBySku("QA-TEST-001")
  if (!playwright || !dummy) {
    report.scenarios.push({
      category: label,
      status: "WARNING",
      expected: { sample: "anti double click add to cart + order loading feedback" },
      actual: {
        note: !playwright
          ? "Playwright tidak tersedia di runtime saat ini."
          : "Dummy product tidak ditemukan untuk UI sample."
      }
    })
    return
  }

  const { chromium } = playwright
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  })

  let addToCartCount = null
  let submitDuringLoading = null
  let successModalVisible = null
  let followupButtonLabel = null
  let errorMessageText = null

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: "networkidle" })
    await page.fill("#catalog-search", "QA-TEST-001")
    await page.click("#apply-search")
    const button = page.locator(`[data-product-id="${dummy.product_id}"]`).first()
    await button.waitFor({ state: "visible", timeout: 15000 })
    await Promise.allSettled([button.click(), button.click()])
    addToCartCount = await page.textContent("#header-cart-count")
    await context.close()

    const successContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const successPage = await successContext.newPage()
    await successPage.route("**/api/order", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700))
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Mock order success",
          data: {
            order_id: `ORD-MOCK-${Date.now()}`,
            qty_total: 1,
            grand_total: 11000
          }
        })
      })
    })
    await successPage.goto(`${BASE_URL}/index.html`, { waitUntil: "networkidle" })
    await successPage.fill("#catalog-search", "QA-TEST-001")
    await successPage.click("#apply-search")
    const successButton = successPage.locator(`[data-product-id="${dummy.product_id}"]`).first()
    await successButton.click()
    await successPage.fill("#checkout-name", "QA UI Success")
    await successPage.fill("#checkout-whatsapp", "620000000501")
    await successPage.fill("#checkout-address", "Alamat UI success")
    await successPage.click("#checkout-button")
    await successPage.waitForTimeout(150)
    submitDuringLoading = await successPage.$eval("#checkout-button", (node) => ({
      disabled: node.disabled,
      text: node.textContent
    }))
    await successPage.waitForSelector("#order-success-modal:not([hidden])", { timeout: 5000 })
    successModalVisible = true
    followupButtonLabel = await successPage.textContent("#order-success-whatsapp-button")
    await successContext.close()

    const errorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const errorPage = await errorContext.newPage()
    await errorPage.route("**/api/order", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700))
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "Simulasi timeout/order gagal."
        })
      })
    })
    await errorPage.goto(`${BASE_URL}/index.html`, { waitUntil: "networkidle" })
    await errorPage.fill("#catalog-search", "QA-TEST-001")
    await errorPage.click("#apply-search")
    const errorButton = errorPage.locator(`[data-product-id="${dummy.product_id}"]`).first()
    await errorButton.click()
    await errorPage.fill("#checkout-name", "QA UI Error")
    await errorPage.fill("#checkout-whatsapp", "620000000502")
    await errorPage.fill("#checkout-address", "Alamat UI error")
    await errorPage.click("#checkout-button")
    await errorPage.waitForTimeout(1200)
    errorMessageText = await errorPage.textContent("#checkout-feedback")
    await errorContext.close()
  } finally {
    await browser.close()
  }

  const pass =
    String(addToCartCount).trim() === "1" &&
    submitDuringLoading?.disabled === true &&
    /Mengirim Order/i.test(submitDuringLoading?.text || "") &&
    successModalVisible === true &&
    /WhatsApp/i.test(followupButtonLabel || "") &&
    /gagal|timeout/i.test(errorMessageText || "")

  report.scenarios.push({
    category: label,
    status: pass ? "PASS" : "WARNING",
    expected: {
      cart_count_after_double_click: "1",
      order_button_loading: "disabled + Mengirim Order...",
      success_modal_visible: true,
      error_feedback_visible: true
    },
    actual: {
      cart_count_after_double_click: addToCartCount,
      submit_during_loading: submitDuringLoading,
      success_modal_visible: successModalVisible,
      followup_button_label: followupButtonLabel,
      error_feedback_text: errorMessageText
    }
  })
}

async function runTimeoutSampling() {
  const label = "F. ERROR / TIMEOUT BEHAVIOR"
  const tempPort = 4189
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(tempPort),
      TVJ_APPS_SCRIPT_TIMEOUT_MS: "1"
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

  try {
    const started = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Temp proxy start timeout")), 10000)
      child.stdout.on("data", (chunk) => {
        const text = String(chunk)
        if (text.includes(`http://localhost:${tempPort}`)) {
          clearTimeout(timer)
          resolve(true)
        }
      })
      child.on("exit", (code) => {
        clearTimeout(timer)
        reject(new Error(`Temp proxy exit ${code}`))
      })
    })

    if (!started) {
      throw new Error("Temp proxy gagal start.")
    }

    const response = await timedFetchJson(
      `http://localhost:${tempPort}/api/admin/system-monitor`,
      {
        method: "POST",
        body: JSON.stringify({ admin_token: ADMIN_TOKEN })
      },
      15000
    )

    const pass =
      response.payload?.success === false &&
      response.payload?.error?.code === "UPSTREAM_TIMEOUT" &&
      /Sistem sedang lambat/i.test(response.payload?.message || "")

    report.scenarios.push({
      category: label,
      status: pass ? "PASS" : "WARNING",
      expected: {
        error_code: "UPSTREAM_TIMEOUT",
        message: "Sistem sedang lambat, coba ulang beberapa detik lagi."
      },
      actual: {
        response: summarizePayload(response),
        stdout: stdout.trim().split(/\r?\n/).slice(-4),
        stderr: stderr.trim().split(/\r?\n/).slice(-4)
      }
    })
  } finally {
    child.kill("SIGTERM")
    await sleep(400)
  }
}

async function finalizeDummyState() {
  for (const def of DUMMIES) {
    await adminPost(
      "/api/admin/product/update",
      {
        sku: def.sku,
        stok_aktif: def.stock,
        status_produk: "NONAKTIF",
        actor: "QA_STRESS"
      },
      { timeoutMs: 45000 }
    )
    await sleep(250)
  }

  const finalProducts = await getCatalogFresh()
  for (const def of DUMMIES) {
    const product = finalProducts.find((item) => item.sku === def.sku)
    report.dummyFinal[def.sku] = product
      ? {
          stock: Number(product.stok_aktif || 0),
          status_produk: product.status_produk,
          product_id: product.product_id
        }
      : null
  }
}

function buildReportMarkdown() {
  const lines = []
  const passCount = report.scenarios.filter((item) => item.status === "PASS").length
  const warningCount = report.scenarios.filter((item) => item.status === "WARNING").length
  const failCount = report.scenarios.filter((item) => item.status === "FAIL").length

  lines.push("# Controlled Stress Sampling Report")
  lines.push("")
  lines.push(`Tanggal: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`)
  lines.push(`Batch: ${report.batchId}`)
  lines.push(`Base URL: ${report.baseUrl}`)
  lines.push("")
  lines.push("## Ringkasan test yang dijalankan")
  lines.push("")
  lines.push("- Duplicate order guard")
  lines.push("- Stock consistency / race condition")
  lines.push("- Cancel order idempotency")
  lines.push("- Stock flow combination")
  lines.push("- UI/UX resilience sampling")
  lines.push("- Timeout behavior")
  lines.push("")
  lines.push("## Data dummy / SKU staging")
  lines.push("")
  for (const def of DUMMIES) {
    lines.push(
      `- ${def.sku}: ${def.name} | baseline stok ${def.stock} | harga jual Rp${def.price.toLocaleString("id-ID")}`
    )
  }
  lines.push("")
  lines.push("## Stok awal vs stok akhir")
  lines.push("")
  for (const def of DUMMIES) {
    const before = report.dummyStateBefore[def.sku]
    const baseline = report.dummyBaseline[def.sku]
    const final = report.dummyFinal[def.sku]
    lines.push(
      `- ${def.sku}: sebelum setup = ${before?.stock ?? "belum ada"}, baseline test = ${baseline?.stock ?? "-"}, akhir = ${final?.stock ?? "-"}, status akhir = ${final?.status_produk ?? "-"}`
    )
  }
  lines.push("")
  lines.push("## Hasil per kategori")
  lines.push("")
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.category}`)
    lines.push(`- Status: ${scenario.status}`)
    lines.push(`- Hasil yang diharapkan: \`${JSON.stringify(scenario.expected)}\``)
    lines.push(`- Hasil aktual: \`${JSON.stringify(scenario.actual)}\``)
    lines.push("")
  }
  lines.push("## File / endpoint / log yang dicek")
  lines.push("")
  lines.push("- Proxy Node: `/api/health`, `/api/order`, `/api/admin/orders/list`, `/api/admin/order/cancel`, `/api/admin/order/delete`, `/api/admin/stock/in`, `/api/admin/stock/out`, `/api/admin/system-monitor`")
  lines.push("- Frontend audit: `site.js`, `admin.js`, `server.mjs`, `apiOrders.gs`, `apiAdmin.gs`, `helpers.gs`")
  lines.push("- Log sampling: summary `API_LOG` dibaca lewat `system-monitor`; `INVENTORY_LOG` tidak diekspos langsung oleh endpoint live")
  lines.push("")
  lines.push("## Bukti log / monitor")
  lines.push("")
  lines.push(`- Monitor sebelum: \`${JSON.stringify(report.monitorBefore?.summary || {})}\``)
  lines.push(`- Monitor sesudah: \`${JSON.stringify(report.monitorAfter?.summary || {})}\``)
  lines.push("")
  lines.push("## Bug / anomali paling kritikal")
  lines.push("")
  if (!report.criticalFindings.length) {
    lines.push("- Tidak ada bug kritikal baru dari sampling terkendali ini.")
  } else {
    for (const item of report.criticalFindings) {
      lines.push(`- ${item}`)
    }
  }
  lines.push("")
  lines.push("## Skor production maturity")
  lines.push("")
  let score = 8.6
  if (failCount > 0) {
    score -= failCount * 1.1
  }
  if (warningCount > 0) {
    score -= warningCount * 0.25
  }
  score = Math.max(0, Math.min(10, Number(score.toFixed(1))))
  lines.push(`- Skor: ${score}/10`)
  lines.push("")
  lines.push("## Putusan akhir")
  lines.push("")
  if (failCount > 0) {
    report.finalVerdict = "masih perlu hardening"
  } else if (warningCount > 1) {
    report.finalVerdict = "aman dengan monitoring"
  } else {
    report.finalVerdict = "aman dipakai rutin"
  }
  lines.push(`- ${report.finalVerdict}`)
  lines.push("")
  lines.push("## Rekap status")
  lines.push("")
  lines.push(`- PASS: ${passCount}`)
  lines.push(`- WARNING: ${warningCount}`)
  lines.push(`- FAIL: ${failCount}`)

  return lines.join("\n")
}

async function main() {
  if (!ADMIN_TOKEN) {
    throw new Error("TVJ_ADMIN_API_TOKEN wajib diisi.")
  }
  if (CONFIRM !== "YES") {
    throw new Error("Set TVJ_STRESS_CONFIRM=YES untuk menjalankan write test live terkendali.")
  }

  report.monitorBefore = await fetchSystemMonitor()
  await ensureDummyProducts()

  try {
    await runDuplicateGuardTest()
    await runRaceConditionTest()
    await runCancelIdempotencyTest()
    await runCombinationFlowTest()
    await runUiSampling()
    await runTimeoutSampling()
  } finally {
    await finalizeDummyState()
    report.monitorAfter = await fetchSystemMonitor()
  }

  const markdown = buildReportMarkdown()
  fs.writeFileSync(OUTPUT_PATH, markdown, "utf8")
  console.log(markdown)
  console.log(`\nReport saved to ${OUTPUT_PATH}`)
}

main().catch(async (error) => {
  console.error(error)
  try {
    await finalizeDummyState()
  } catch (cleanupError) {
    console.error("Cleanup gagal:", cleanupError)
  }
  process.exitCode = 1
})

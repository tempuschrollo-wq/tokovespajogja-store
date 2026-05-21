import {
  ADMIN_SESSION_KEY,
  STORE_CONFIG,
  formatRupiah,
  getTodayDate,
  hydrateProduct,
  normalizeText,
  serializeProduct
} from "./catalog-store.js"

const API_BASE = "/api"
const ADMIN_API_TOKEN_KEY = "toko-vespa-jogja-admin-api-token-v1"
const LIVE_CATALOG_CACHE_KEY = "toko-vespa-jogja-live-catalog-cache-v1"
const LIVE_DASHBOARD_CACHE_KEY = "toko-vespa-jogja-live-dashboard-cache-v1"
const ADMIN_ORDERS_CACHE_KEY = "toko-vespa-jogja-admin-orders-cache-v1"
const ADMIN_MARKETPLACE_CACHE_KEY = "toko-vespa-jogja-admin-marketplace-cache-v1"
const WEBSITE_ORDER_RECONCILE_ATTEMPTS = 4
const WEBSITE_ORDER_RECONCILE_INTERVAL_MS = 1800
const ADMIN_ACTION_RECONCILE_ATTEMPTS = 4
const ADMIN_ACTION_RECONCILE_INTERVAL_MS = 1800
const CLIENT_FETCH_TIMEOUT_MS = 45_000
const READ_CACHE_TTL_MS = {
  catalog: 60_000,
  dashboard: 30_000,
  orders: 15_000,
  marketplace: 15_000
}

const memoryReadCache = new Map()
const pendingReadRequests = new Map()

const categoryValueMap = {
  mesin: "mesin",
  "kaki-kaki": "kaki-kaki",
  kaki: "kaki-kaki",
  kelistrikan: "kelistrikan",
  body: "body",
  "body & restorasi": "body",
  servis: "servis",
  aksesoris: "aksesoris",
  aksesori: "aksesoris"
}

export const fetchLiveCatalog = async ({ force = false } = {}) => {
  return readWithMemoryCache_({
    key: "catalog",
    force,
    ttlMs: READ_CACHE_TTL_MS.catalog,
    load: async () => {
      const payload = await fetchJson(
        `${API_BASE}/catalog${force ? "?fresh=1" : ""}`
      )

      if (!payload.success) {
        throw createApiError_(payload, "Katalog live gagal dimuat.")
      }

      const products = Array.isArray(payload.data?.products)
        ? payload.data.products.map(mapApiProductToCatalog)
        : []

      const result = {
        products,
        updatedAt: payload.data?.updated_at || getTodayDate(),
        dataSource: "live-api"
      }

      writeJsonStorageValue(LIVE_CATALOG_CACHE_KEY, {
        products: products.map((product, index) => serializeProduct(product, index)),
        updatedAt: result.updatedAt
      })

      return result
    }
  })
}

export const fetchLiveDashboardSummary = async ({ force = false } = {}) => {
  return readWithMemoryCache_({
    key: "dashboard-summary",
    force,
    ttlMs: READ_CACHE_TTL_MS.dashboard,
    load: async () => {
      const payload = await fetchJson(
        `${API_BASE}/dashboard-summary${force ? "?fresh=1" : ""}`
      )

      if (!payload.success) {
        throw createApiError_(payload, "Ringkasan live gagal dimuat.")
      }

      const summary = payload.data || {}
      writeJsonStorageValue(LIVE_DASHBOARD_CACHE_KEY, summary)
      return summary
    }
  })
}

export const createWebsiteOrder = async ({
  customerName,
  customerWhatsApp,
  customerAddress,
  items,
  shippingAmount = 0,
  shippingNote = ""
}) => {
  const requestBody = {
  customer_nama: customerName,
  customer_name: customerName,
  customer_whatsapp: customerWhatsApp,
  customer_alamat: customerAddress,
  customer_address: customerAddress,
  items,
  ongkir: shippingAmount,
  shipping_note: shippingNote
}

  const payload = await fetchJson(`${API_BASE}/order`, {
    method: "POST",
    body: JSON.stringify(requestBody)
  })

  if (!payload.success && payload.error?.code === "UPSTREAM_TIMEOUT") {
    const reconciledOrder = await reconcileWebsiteOrder_(requestBody)

    if (reconciledOrder) {
      return {
        ...reconciledOrder,
        reconciled: true
      }
    }

    const pendingError = new Error(
      "Sistem sedang mengecek order terakhir. Jangan klik kirim ulang dulu, tunggu beberapa detik lalu cek lagi."
    )
    pendingError.code = "ORDER_PENDING_CHECK"
    pendingError.details = {
      upstream: payload.error?.details || null
    }
    throw pendingError
  }

  if (!payload.success) {
    const error = new Error(payload.message || "Order gagal dibuat.")
    error.code = payload.error?.code || "ORDER_FAILED"
    error.details = payload.error?.details || null
    throw error
  }

  return payload.data
}

const reconcileWebsiteOrder_ = async (requestBody) => {
  for (let attempt = 0; attempt < WEBSITE_ORDER_RECONCILE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await wait_(WEBSITE_ORDER_RECONCILE_INTERVAL_MS)
    }

    const payload = await fetchJson(`${API_BASE}/order/reconcile`, {
      method: "POST",
      body: JSON.stringify(requestBody)
    })

    if (payload.success && payload.data?.found && payload.data?.order) {
      return payload.data.order
    }
  }

  return null
}

const readStorageValue = (key) => {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || ""
  } catch (error) {
    return sessionStorage.getItem(key) || ""
  }
}

const writeStorageValue = (key, value) => {
  const normalizedValue = String(value || "").trim()

  try {
    localStorage.setItem(key, normalizedValue)
  } catch (error) {
    // localStorage bisa diblokir di mode browser tertentu, jadi tetap simpan ke sessionStorage.
  }

  sessionStorage.setItem(key, normalizedValue)
}

const removeStorageValue = (key) => {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    // noop
  }

  sessionStorage.removeItem(key)
}

const wait_ = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

const readJsonStorageValue = (key, { sessionOnly = false } = {}) => {
  const rawValue = sessionOnly ? sessionStorage.getItem(key) : readStorageValue(key)

  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue)
  } catch (error) {
    removeStorageValue(key)
    return null
  }
}

const writeJsonStorageValue = (key, value, { sessionOnly = false } = {}) => {
  const rawValue = JSON.stringify(value)

  if (sessionOnly) {
    sessionStorage.setItem(key, rawValue)
    return
  }

  writeStorageValue(key, rawValue)
}

export const readAdminApiToken = () => readStorageValue(ADMIN_API_TOKEN_KEY)

export const saveAdminApiToken = (token) => {
  writeStorageValue(ADMIN_API_TOKEN_KEY, token)
}

export const clearAdminApiToken = () => {
  removeStorageValue(ADMIN_API_TOKEN_KEY)
}

export const hasAdminApiToken = () => Boolean(readAdminApiToken())

export const clearAdminApiSession = () => {
  clearAdminApiToken()
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY)
  } catch (error) {
    // noop
  }
  sessionStorage.removeItem(ADMIN_SESSION_KEY)
}

export const readCachedLiveCatalog = () => {
  const cached = readJsonStorageValue(LIVE_CATALOG_CACHE_KEY)

  if (!cached || !Array.isArray(cached.products)) {
    return null
  }

  return {
    products: cached.products.map(hydrateProduct),
    updatedAt: cached.updatedAt || getTodayDate(),
    dataSource: "live-cache"
  }
}

export const readCachedLiveDashboardSummary = () => {
  const cached = readJsonStorageValue(LIVE_DASHBOARD_CACHE_KEY)
  return cached && typeof cached === "object" ? cached : null
}

export const readCachedAdminOrders = () => {
  const cached = readJsonStorageValue(ADMIN_ORDERS_CACHE_KEY, {
    sessionOnly: true
  })

  if (!cached || !Array.isArray(cached.orders)) {
    return null
  }

  return cached
}

export const readCachedAdminMarketplaceHistory = () => {
  const cached = readJsonStorageValue(ADMIN_MARKETPLACE_CACHE_KEY, {
    sessionOnly: true
  })

  if (!cached || !Array.isArray(cached.items)) {
    return null
  }

  return cached
}

export const createAdminProduct = async (productPayload) => {
  try {
    const result = await postAdminJson("/admin/product/create", productPayload)
    clearReadCache_("catalog")
    clearReadCache_("dashboard-summary")
    return result
  } catch (error) {
    if (!isPendingTimeoutError_(error)) {
      throw error
    }

    const reconciled = await reconcileAdminProductUpdate_(productPayload)

    if (reconciled) {
      clearReadCache_("catalog")
      clearReadCache_("dashboard-summary")
      return reconciled
    }

    throw createPendingConfirmationError_(
      "Belum bisa dikonfirmasi, jangan submit ulang dulu. Refresh data beberapa detik lagi.",
      {
        action: "product-create",
        sku: productPayload?.sku,
        upstream: error.details || null
      }
    )
  }
}

export const updateAdminProduct = async (productPayload) => {
  try {
    const result = await postAdminJson("/admin/product/update", productPayload)
    clearReadCache_("catalog")
    clearReadCache_("dashboard-summary")
    return result
  } catch (error) {
    if (!isPendingTimeoutError_(error)) {
      throw error
    }

    const reconciled = await reconcileAdminProductUpdate_(productPayload)

    if (reconciled) {
      clearReadCache_("catalog")
      clearReadCache_("dashboard-summary")
      return reconciled
    }

    throw createPendingConfirmationError_(
      "Belum bisa dikonfirmasi, jangan submit ulang dulu. Refresh data beberapa detik lagi.",
      {
        action: "product-update",
        sku: productPayload?.sku,
        product_id: productPayload?.product_id,
        upstream: error.details || null
      }
    )
  }
}

export const deleteAdminProduct = async ({
  sku,
  productId,
  actor = "ADMIN_WEB",
  forceDelete = false
}) => {
  try {
    const result = await postAdminJson("/admin/product/delete", {
      ...(productId ? { product_id: productId } : { sku }),
      actor,
      force_delete: forceDelete
    })
    clearReadCache_("catalog")
    clearReadCache_("dashboard-summary")
    return result
  } catch (error) {
    if (!isPendingTimeoutError_(error)) {
      throw error
    }

    const reconciled = await reconcileAdminProductDelete_({ sku, productId })

    if (reconciled) {
      clearReadCache_("catalog")
      clearReadCache_("dashboard-summary")
      return reconciled
    }

    throw createPendingConfirmationError_(
      "Belum bisa dikonfirmasi, jangan submit ulang dulu. Refresh data beberapa detik lagi.",
      {
        action: "product-delete",
        sku,
        product_id: productId,
        upstream: error.details || null
      }
    )
  }
}

export const createAdminMarketplaceOrder = async (marketplacePayload) => {
  const payload = withAdminClientRequestId_(marketplacePayload)

  try {
    const result = await postAdminJson("/admin/marketplace/create", payload)
    clearReadCache_("catalog")
    clearReadCache_("dashboard-summary")
    clearReadCache_("marketplace:")
    return result
  } catch (error) {
    if (!isPendingTimeoutError_(error)) {
      throw error
    }

    const reconciled = await reconcileAdminMarketplaceOrder_(payload)

    if (reconciled) {
      clearReadCache_("marketplace:")
      clearReadCache_("catalog")
      clearReadCache_("dashboard-summary")
      return reconciled
    }

    throw createPendingConfirmationError_(
      "Belum bisa dikonfirmasi. Jangan submit ulang dulu, refresh data beberapa detik lagi.",
      {
        action: "marketplace-create",
        sku: payload?.sku,
        marketplace_order_no: payload?.marketplace_order_no,
        client_request_id: payload?.client_request_id,
        upstream: error.details || null
      }
    )
  }
}

export const fetchAdminMarketplaceHistory = async ({ limit = 8, force = false } = {}) => {
  const token = readAdminApiToken()
  const cacheKey = `marketplace:${token}:${Number(limit || 8)}`

  return readWithMemoryCache_({
    key: cacheKey,
    force,
    ttlMs: READ_CACHE_TTL_MS.marketplace,
    load: async () => {
      const result = await postAdminJson("/admin/marketplace/list", {
        limit,
        force
      })

      const normalized = {
        ...(result || {}),
        items: Array.isArray(result?.items) ? result.items : []
      }

      writeJsonStorageValue(ADMIN_MARKETPLACE_CACHE_KEY, normalized, {
        sessionOnly: true
      })

      return normalized
    }
  })
}

export const fetchAdminOrdersList = async ({
  search = "",
  page = 1,
  limit = 8,
  statusOrder = "",
  paymentStatus = "",
  force = false
} = {}) => {
  const token = readAdminApiToken()

  if (!token) {
    throw new Error("Token admin belum diisi. Simpan token admin browser dulu.")
  }

  const cacheKey = `orders:${token}:${normalizeText(search)}:${page}:${limit}:${normalizeText(
    statusOrder
  )}:${normalizeText(paymentStatus)}`

  return readWithMemoryCache_({
    key: cacheKey,
    force,
    ttlMs: READ_CACHE_TTL_MS.orders,
    load: async () => {
      const response = await fetchJson(`${API_BASE}/admin/orders/list`, {
        method: "POST",
        body: JSON.stringify({
          admin_token: token,
          search,
          page,
          limit,
          force,
          status_order: statusOrder,
          payment_status: paymentStatus
        })
      })

      if (!response.success) {
        throw createApiError_(response, "Riwayat order admin gagal dimuat.")
      }

      const result = {
        ...(response.data || {}),
        ...(response.meta || {})
      }

      writeJsonStorageValue(ADMIN_ORDERS_CACHE_KEY, result, {
        sessionOnly: true
      })

      return result
    }
  })
}

export const updateAdminOrder = async (orderPayload) => {
  try {
    const result = await postAdminJson("/admin/order/update", orderPayload)
    clearReadCache_("orders:")
    return result
  } catch (error) {
    if (!isPendingTimeoutError_(error)) {
      throw error
    }

    const reconciled = await reconcileAdminOrderUpdate_(orderPayload)

    if (reconciled) {
      clearReadCache_("orders:")
      return reconciled
    }

    throw createPendingConfirmationError_(
      "Belum bisa dikonfirmasi, jangan submit ulang dulu. Refresh data beberapa detik lagi.",
      {
        action: "order-update",
        order_id: orderPayload?.order_id,
        upstream: error.details || null
      }
    )
  }
}

export const cancelAdminOrder = async ({ orderId, actor = "ADMIN_WEB", note = "" }) => {
  try {
    const result = await postAdminJson("/admin/order/cancel", {
      order_id: orderId,
      actor,
      note
    })
    clearReadCache_("orders:")
    clearReadCache_("catalog")
    clearReadCache_("dashboard-summary")
    return result
  } catch (error) {
    if (!isPendingTimeoutError_(error)) {
      throw error
    }

    const reconciled = await reconcileAdminOrderAction_({
      orderId,
      action: "cancel"
    })

    if (reconciled) {
      clearReadCache_("orders:")
      clearReadCache_("catalog")
      clearReadCache_("dashboard-summary")
      return reconciled
    }

    throw createPendingConfirmationError_(
      "Belum bisa dikonfirmasi, jangan submit ulang dulu. Refresh data beberapa detik lagi.",
      {
        action: "cancel",
        order_id: orderId,
        upstream: error.details || null
      }
    )
  }
}

export const deleteAdminOrder = async ({ orderId, actor = "ADMIN_WEB" }) => {
  try {
    const result = await postAdminJson("/admin/order/delete", {
      order_id: orderId,
      actor
    })
    clearReadCache_("orders:")
    return result
  } catch (error) {
    if (!isPendingTimeoutError_(error)) {
      throw error
    }

    const reconciled = await reconcileAdminOrderAction_({
      orderId,
      action: "delete"
    })

    if (reconciled) {
      clearReadCache_("orders:")
      return reconciled
    }

    throw createPendingConfirmationError_(
      "Belum bisa dikonfirmasi, jangan submit ulang dulu. Refresh data beberapa detik lagi.",
      {
        action: "delete",
        order_id: orderId,
        upstream: error.details || null
      }
    )
  }
}

export const fetchSystemMonitor = async () => {
  return postAdminJson("/admin/system-monitor", {
    actor: "ADMIN_WEB"
  })
}

export const deactivateAdminProduct = async ({ sku, productId }) => {
  return updateAdminProduct({
    ...(productId ? { product_id: productId } : { sku }),
    status_produk: "NONAKTIF"
  })
}

export const buildOrderFollowupLink = ({
  entries,
  customerName,
  customerAddress,
  orderId,
  shippingAmount = 0,
  grandTotal = 0
}) => {
  const totalItems = entries.reduce((total, entry) => total + entry.quantity, 0)
  const subtotal = entries.reduce(
    (total, entry) => total + entry.product.price * entry.quantity,
    0
  )
  const lines = entries.map(({ product, quantity }) => {
    const unitPrice = product.price > 0 ? formatRupiah(product.price) : "Hubungi admin"
    const subtotal = product.price > 0 ? formatRupiah(product.price * quantity) : "Hubungi admin"
    return `- ${product.name} x${quantity} (${product.sku}) | ${unitPrice} | ${subtotal}`
  })
  const message = [
    `Halo ${STORE_CONFIG.name}, order website saya sudah masuk.`,
    `Order ID: ${orderId}`,
    `Nama: ${customerName}`,
    `Alamat: ${customerAddress}`,
    "",
    ...lines,
    "",
    `Total item: ${totalItems}`,
    `Subtotal produk: ${formatRupiah(subtotal)}`,
    shippingAmount > 0
      ? `Estimasi ongkir + packing: ${formatRupiah(shippingAmount)}`
      : "Ongkir: dikonfirmasi admin setelah alamat dicek",
    `Total produk saat ini: ${formatRupiah(grandTotal || subtotal + shippingAmount)}`,
    "",
    "Mohon dibantu proses lanjutannya ya."
  ].join("\n")

  return `https://api.whatsapp.com/send/?phone=${STORE_CONFIG.whatsappPhone}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`
}

function mapApiProductToCatalog(product, index) {
  const stockStatus = normalizeText(product.status_stok).replace(/[_-]+/g, " ")
  return hydrateProduct(
    {
      id: product.product_id || product.sku || `live-${index + 1}`,
      sourceNo: product.product_id || product.sku || `LIVE-${index + 1}`,
      sku: product.sku,
      name: product.nama_produk,
      category: mapCategoryToId(product.kategori),
      models: splitModels(product.model_vespa),
      stock: Number(product.stok_aktif || 0),
      minimumStock: Number(product.minimum_stok || 1),
      stockStatus: product.status_stok || "",
      status: stockStatus === "out of stock" ? "out" : "ready",
      price: Number(product.harga_jual || 0),
      costPrice: Number(product.harga_modal || 0),
      priceDisplay: product.harga_label || "",
      imageUrl: product.image_url || "",
      weight: Number(product.berat || 0)
    },
    index
  )
}

function mapCategoryToId(categoryValue) {
  const normalized = normalizeText(categoryValue).replace(/\s+/g, "-")
  return categoryValueMap[normalized] || "aksesoris"
}

function splitModels(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

async function readWithMemoryCache_({ key, force = false, ttlMs = 0, load }) {
  const now = Date.now()
  const cached = memoryReadCache.get(key)

  if (!force && cached && now - cached.fetchedAt <= ttlMs) {
    return cached.value
  }

  if (!force && cached) {
    if (!pendingReadRequests.has(key)) {
      const request = load()
        .then((value) => {
          memoryReadCache.set(key, {
            value,
            fetchedAt: Date.now()
          })
          return value
        })
        .finally(() => {
          pendingReadRequests.delete(key)
        })
      pendingReadRequests.set(key, request)
    }
    return cached.value
  }

  if (!force && pendingReadRequests.has(key)) {
    return pendingReadRequests.get(key)
  }

  const request = load()
    .then((value) => {
      memoryReadCache.set(key, {
        value,
        fetchedAt: Date.now()
      })
      return value
    })
    .finally(() => {
      pendingReadRequests.delete(key)
    })

  pendingReadRequests.set(key, request)
  return request
}

function clearReadCache_(prefix = "") {
  for (const key of memoryReadCache.keys()) {
    if (!prefix || key === prefix || key.startsWith(prefix)) {
      memoryReadCache.delete(key)
    }
  }
}

function createApiError_(payload, fallbackMessage = "Request gagal diproses.") {
  const error = new Error(payload?.message || fallbackMessage)
  error.code = payload?.error?.code || "REQUEST_FAILED"
  error.details = payload?.error?.details || null
  return error
}

function createPendingConfirmationError_(message, details = {}) {
  const error = new Error(message)
  error.code = "ADMIN_ACTION_PENDING_CHECK"
  error.details = details
  return error
}

function isPendingTimeoutError_(error) {
  return error?.code === "UPSTREAM_TIMEOUT" || error?.code === "NETWORK_TIMEOUT"
}

function normalizeReference_(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "")
}

function withAdminClientRequestId_(payload = {}) {
  if (payload.client_request_id || !payload.marketplace_order_no) {
    return payload
  }

  const parts = [
    "TVJ",
    payload.channel || "MARKETPLACE",
    payload.sku || "",
    payload.marketplace_order_no
  ]
    .map((part) =>
      String(part || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter(Boolean)

  return {
    ...payload,
    client_request_id: parts.join("-").slice(0, 120)
  }
}

async function postAdminJson(pathname, payload) {
  const token = readAdminApiToken()

  if (!token) {
    throw new Error("Token admin belum diisi. Simpan token admin browser dulu.")
  }

  const response = await fetchJson(`${API_BASE}${pathname}`, {
    method: "POST",
    body: JSON.stringify({
      admin_token: token,
      ...payload
    })
  })

  if (!response.success) {
    throw createApiError_(response, "Request admin gagal diproses.")
  }

  return response.data
}

async function reconcileAdminOrderAction_({ orderId, action }) {
  for (let attempt = 0; attempt < ADMIN_ACTION_RECONCILE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await wait_(ADMIN_ACTION_RECONCILE_INTERVAL_MS)
    }

    let order = null

    try {
      order = await fetchAdminOrderById_(orderId)
    } catch (error) {
      continue
    }

    if (action === "cancel" && isCancelledOrderStatus_(order?.status_order)) {
      return {
        order_id: orderId,
        reconciled: true,
        reconciled_action: "cancel",
        stock_action: "RESTORE_CONFIRMED_BY_STATUS",
        order
      }
    }

    if (action === "delete" && !order) {
      return {
        deleted_order_id: orderId,
        reconciled: true,
        reconciled_action: "delete",
        stock_action: "NO_CHANGE_ALREADY_CANCELLED"
      }
    }
  }

  return null
}

async function reconcileAdminOrderUpdate_(orderPayload = {}) {
  const orderId = orderPayload.order_id

  if (!orderId) {
    return null
  }

  for (let attempt = 0; attempt < ADMIN_ACTION_RECONCILE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await wait_(ADMIN_ACTION_RECONCILE_INTERVAL_MS)
    }

    try {
      const order = await fetchAdminOrderById_(orderId)

      if (order && orderMatchesUpdate_(order, orderPayload)) {
        clearReadCache_("orders:")
        return {
          order_id: orderId,
          reconciled: true,
          reconciled_action: "update",
          order
        }
      }
    } catch (error) {
      continue
    }
  }

  return null
}

function orderMatchesUpdate_(order, orderPayload = {}) {
  const checks = []

  if (orderPayload.payment_status) {
    checks.push(
      normalizeText(order.payment_status) === normalizeText(orderPayload.payment_status)
    )
  }

  if (orderPayload.status_order) {
    checks.push(normalizeText(order.status_order) === normalizeText(orderPayload.status_order))
  }

  return checks.length > 0 && checks.every(Boolean)
}

async function reconcileAdminMarketplaceOrder_(payload = {}) {
  const referenceValues = [
    payload.client_request_id,
    payload.marketplace_order_no,
    payload.reference_id,
    payload.referensi_id
  ]
    .map(normalizeReference_)
    .filter(Boolean)

  if (!referenceValues.length) {
    return null
  }

  const sku = normalizeText(payload.sku)
  const qty = Number(payload.qty_keluar || payload.qty || 0)

  for (let attempt = 0; attempt < ADMIN_ACTION_RECONCILE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await wait_(ADMIN_ACTION_RECONCILE_INTERVAL_MS)
    }

    try {
      const history = await fetchAdminMarketplaceHistory({
        limit: 50,
        force: true
      })
      const item = (history.items || []).find((entry) => {
        const entryRefs = [
          entry.client_request_id,
          entry.marketplace_order_no,
          entry.reference_id,
          entry.referensi_id,
          entry.referensi,
          entry.reference,
          entry.catatan
        ]
          .map(normalizeReference_)
          .filter(Boolean)
        const hasReference = entryRefs.some((entryRef) =>
          referenceValues.some((reference) => entryRef.includes(reference))
        )
        const hasSku = !sku || normalizeText(entry.sku) === sku
        const hasQty = !qty || Number(entry.qty_keluar || entry.qty || 0) === qty
        return hasReference && hasSku && hasQty
      })

      if (item) {
        clearReadCache_("catalog")
        clearReadCache_("dashboard-summary")
        clearReadCache_("marketplace:")
        return {
          transaction: item,
          item,
          reconciled: true,
          already_processed: true
        }
      }
    } catch (error) {
      continue
    }
  }

  return null
}

async function reconcileAdminProductUpdate_(payload = {}) {
  const sku = normalizeText(payload.sku)
  const productId = String(payload.product_id || payload.identifier || "").trim()

  if (!sku && !productId) {
    return null
  }

  for (let attempt = 0; attempt < ADMIN_ACTION_RECONCILE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await wait_(ADMIN_ACTION_RECONCILE_INTERVAL_MS)
    }

    try {
      const catalog = await fetchLiveCatalog({ force: true })
      const product = (catalog.products || []).find(
        (item) =>
          (sku && normalizeText(item.sku) === sku) ||
          (productId && String(item.id || "").trim() === productId)
      )

      if (normalizeText(payload.status_produk) === "nonaktif" && !product) {
        clearReadCache_("catalog")
        clearReadCache_("dashboard-summary")
        return {
          reconciled: true,
          reconciled_action: "product-deactivate",
          product_id: productId || null,
          sku: payload.sku || null
        }
      }

      if (product && productMatchesUpdate_(product, payload)) {
        clearReadCache_("catalog")
        clearReadCache_("dashboard-summary")
        return {
          reconciled: true,
          reconciled_action: "product-update",
          product
        }
      }
    } catch (error) {
      continue
    }
  }

  return null
}

async function reconcileAdminProductDelete_({ sku, productId } = {}) {
  const normalizedSku = normalizeText(sku)
  const normalizedProductId = String(productId || "").trim()

  if (!normalizedSku && !normalizedProductId) {
    return null
  }

  for (let attempt = 0; attempt < ADMIN_ACTION_RECONCILE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await wait_(ADMIN_ACTION_RECONCILE_INTERVAL_MS)
    }

    try {
      const catalog = await fetchLiveCatalog({ force: true })
      const product = (catalog.products || []).find(
        (item) =>
          (normalizedSku && normalizeText(item.sku) === normalizedSku) ||
          (normalizedProductId && String(item.id || "").trim() === normalizedProductId)
      )

      if (!product) {
        clearReadCache_("catalog")
        clearReadCache_("dashboard-summary")
        return {
          reconciled: true,
          reconciled_action: "product-delete",
          product_id: normalizedProductId || null,
          sku: sku || null
        }
      }
    } catch (error) {
      continue
    }
  }

  return null
}

function productMatchesUpdate_(product, payload = {}) {
  const checks = []

  if (payload.sku) {
    checks.push(normalizeText(product.sku) === normalizeText(payload.sku))
  }

  if (payload.nama_produk) {
    checks.push(normalizeText(product.name) === normalizeText(payload.nama_produk))
  }

  if (payload.stok_aktif !== undefined && payload.stok_aktif !== "") {
    checks.push(Number(product.stock || 0) === Number(payload.stok_aktif || 0))
  }

  if (payload.harga_jual !== undefined && payload.harga_jual !== "") {
    checks.push(Number(product.price || 0) === Number(payload.harga_jual || 0))
  }

  if (payload.status_produk && normalizeText(payload.status_produk) === "aktif") {
    checks.push(Boolean(product))
  }

  return checks.length > 0 && checks.every(Boolean)
}

function isCancelledOrderStatus_(value) {
  const normalized = normalizeText(value)
  return (
    normalized === "cancel" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "dibatalkan"
  )
}

async function fetchAdminOrderById_(orderId) {
  const result = await fetchAdminOrdersList({
    search: orderId,
    page: 1,
    limit: 8,
    force: true
  })

  const orders = Array.isArray(result.orders) ? result.orders : []
  return (
    orders.find((order) => String(order?.order_id || "").trim() === String(orderId || "").trim()) ||
    null
  )
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController()
  const timeoutTimer = window.setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options,
      signal: options.signal || controller.signal
    })

    const payload = await response.json()

    if (!response.ok && !payload.success) {
      return payload
    }

    return payload
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        "Transaksi sedang dikonfirmasi. Koneksi browser melewati batas waktu tunggu."
      )
      timeoutError.code = "NETWORK_TIMEOUT"
      timeoutError.details = {
        url,
        timeout_ms: CLIENT_FETCH_TIMEOUT_MS
      }
      throw timeoutError
    }

    const networkError = new Error(
      error?.message || "Koneksi ke server lokal sedang bermasalah."
    )
    networkError.code = "NETWORK_ERROR"
    networkError.details = {
      url,
      cause: error?.message || ""
    }
    throw networkError
  } finally {
    window.clearTimeout(timeoutTimer)
  }
}

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
const WEBSITE_ORDER_RECONCILE_ATTEMPTS = 4
const WEBSITE_ORDER_RECONCILE_INTERVAL_MS = 1800
const ADMIN_ACTION_RECONCILE_ATTEMPTS = 4
const ADMIN_ACTION_RECONCILE_INTERVAL_MS = 1800

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
  const payload = await fetchJson(
    `${API_BASE}/catalog${force ? "?fresh=1" : ""}`
  )

  if (!payload.success) {
    throw new Error(payload.message || "Katalog live gagal dimuat.")
  }

  const products = Array.isArray(payload.data?.products)
    ? payload.data.products.map(mapApiProductToCatalog)
    : []

  writeJsonStorageValue(LIVE_CATALOG_CACHE_KEY, {
    products: products.map((product, index) => serializeProduct(product, index)),
    updatedAt: payload.data?.updated_at || getTodayDate()
  })

  return {
    products,
    updatedAt: payload.data?.updated_at || getTodayDate(),
    dataSource: "live-api"
  }
}

export const fetchLiveDashboardSummary = async ({ force = false } = {}) => {
  const payload = await fetchJson(
    `${API_BASE}/dashboard-summary${force ? "?fresh=1" : ""}`
  )

  if (!payload.success) {
    throw new Error(payload.message || "Ringkasan live gagal dimuat.")
  }

  const summary = payload.data || {}
  writeJsonStorageValue(LIVE_DASHBOARD_CACHE_KEY, summary)
  return summary
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
    customer_name: customerName,
    customer_whatsapp: customerWhatsApp,
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

export const createAdminProduct = async (productPayload) => {
  return postAdminJson("/admin/product/create", productPayload)
}

export const updateAdminProduct = async (productPayload) => {
  return postAdminJson("/admin/product/update", productPayload)
}

export const deleteAdminProduct = async ({
  sku,
  productId,
  actor = "ADMIN_WEB",
  forceDelete = false
}) => {
  return postAdminJson("/admin/product/delete", {
    ...(productId ? { product_id: productId } : { sku }),
    actor,
    force_delete: forceDelete
  })
}

export const createAdminMarketplaceOrder = async (marketplacePayload) => {
  return postAdminJson("/admin/marketplace/create", marketplacePayload)
}

export const fetchAdminMarketplaceHistory = async ({ limit = 8 } = {}) => {
  return postAdminJson("/admin/marketplace/list", {
    limit
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
    throw new Error(response.message || "Riwayat order admin gagal dimuat.")
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

export const updateAdminOrder = async (orderPayload) => {
  return postAdminJson("/admin/order/update", orderPayload)
}

export const cancelAdminOrder = async ({ orderId, actor = "ADMIN_WEB", note = "" }) => {
  try {
    return await postAdminJson("/admin/order/cancel", {
      order_id: orderId,
      actor,
      note
    })
  } catch (error) {
    if (error?.code !== "UPSTREAM_TIMEOUT") {
      throw error
    }

    const reconciled = await reconcileAdminOrderAction_({
      orderId,
      action: "cancel"
    })

    if (reconciled) {
      return reconciled
    }

    const pendingError = new Error(
      "Koneksi sempat lambat. Sistem belum bisa memastikan order ini sudah dibatalkan atau belum. Cek ulang status order dulu sebelum klik lagi."
    )
    pendingError.code = "ADMIN_ACTION_PENDING_CHECK"
    pendingError.details = {
      action: "cancel",
      order_id: orderId,
      upstream: error.details || null
    }
    throw pendingError
  }
}

export const deleteAdminOrder = async ({ orderId, actor = "ADMIN_WEB" }) => {
  try {
    return await postAdminJson("/admin/order/delete", {
      order_id: orderId,
      actor
    })
  } catch (error) {
    if (error?.code !== "UPSTREAM_TIMEOUT") {
      throw error
    }

    const reconciled = await reconcileAdminOrderAction_({
      orderId,
      action: "delete"
    })

    if (reconciled) {
      return reconciled
    }

    const pendingError = new Error(
      "Koneksi sempat lambat. Sistem belum bisa memastikan riwayat order ini sudah terhapus atau belum. Refresh order dulu sebelum klik lagi."
    )
    pendingError.code = "ADMIN_ACTION_PENDING_CHECK"
    pendingError.details = {
      action: "delete",
      order_id: orderId,
      upstream: error.details || null
    }
    throw pendingError
  }
}

export const fetchSystemMonitor = async () => {
  return postAdminJson("/admin/system-monitor", {
    actor: "ADMIN_WEB"
  })
}

export const deactivateAdminProduct = async ({ sku, productId }) => {
  return postAdminJson("/admin/product/update", {
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
      status: normalizeText(product.status_stok) === "out of stock" ? "out" : "ready",
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
    const error = new Error(response.message || "Request admin gagal diproses.")
    error.code = response.error?.code || "ADMIN_REQUEST_FAILED"
    error.details = response.error?.details || null
    throw error
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

    if (action === "cancel" && normalizeText(order?.status_order) === "cancel") {
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
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  })

  const payload = await response.json()

  if (!response.ok && !payload.success) {
    return payload
  }

  return payload
}

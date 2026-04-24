import {
  ADMIN_SESSION_KEY,
  clearAdminSession,
  escapeHtml,
  fileToDataUrl,
  formatItemCount,
  formatProductPrice,
  formatRupiah,
  formatRupiahInput,
  getCategoryLabel,
  hasValidAdminSession,
  hashText,
  isRupiahLikeValue,
  makeProductLookup,
  normalizeText,
  parseRupiahNumber,
  readAdminCredentials,
  saveAdminCredentials,
  setAdminSession,
  categoryLabels
} from "./catalog-store.js"
import {
  cancelAdminOrder,
  clearAdminApiSession,
  clearAdminApiToken,
  createAdminMarketplaceOrder,
  createAdminProduct,
  deleteAdminOrder,
  deleteAdminProduct,
  deactivateAdminProduct,
  fetchAdminMarketplaceHistory,
  fetchAdminOrdersList,
  fetchLiveCatalog,
  fetchLiveDashboardSummary,
  hasAdminApiToken,
  readCachedAdminOrders,
  readCachedLiveCatalog,
  readCachedLiveDashboardSummary,
  readAdminApiToken,
  saveAdminApiToken,
  updateAdminOrder,
  updateAdminProduct
} from "./live-api-client.js"

const tablePageSize = 8
const ordersPageSize = 8
const ORDER_NOTIFICATION_POLL_MS = 8000
const ORDER_NOTIFICATION_LIMIT = 8
const ORDER_NOTIFICATION_SOUND_KEY = "tvj-admin-order-sound-v1"

const revealBlocks = document.querySelectorAll(".reveal")
const accessCard = document.querySelector("#access-card")
const accessNote = document.querySelector("#access-note")
const setupView = document.querySelector("#setup-view")
const loginView = document.querySelector("#login-view")
const setupForm = document.querySelector("#setup-form")
const setupUsernameInput = document.querySelector("#setup-username")
const setupPasswordInput = document.querySelector("#setup-password")
const setupConfirmInput = document.querySelector("#setup-confirm")
const loginForm = document.querySelector("#login-form")
const loginUsernameInput = document.querySelector("#login-username")
const loginPasswordInput = document.querySelector("#login-password")

const logoutButton = document.querySelector("#admin-logout-button")
const notificationWrap = document.querySelector("#admin-notification-wrap")
const notificationButton = document.querySelector("#admin-notification-button")
const notificationBadge = document.querySelector("#admin-notification-badge")
const notificationDropdown = document.querySelector("#admin-notification-dropdown")
const notificationList = document.querySelector("#admin-notification-list")
const notificationSoundToggle = document.querySelector("#admin-notification-sound-toggle")
const dashboard = document.querySelector("#admin-dashboard")
const dashboardNote = document.querySelector("#dashboard-note")
const summaryTotalProducts = document.querySelector("#summary-total-products")
const summaryReadyProducts = document.querySelector("#summary-ready-products")
const summaryOutProducts = document.querySelector("#summary-out-products")
const summaryStockUnits = document.querySelector("#summary-stock-units")
const actionNote = document.querySelector("#action-note")

const newProductButton = document.querySelector("#new-product-button")
const exportButton = document.querySelector("#export-button")
const refreshLiveButton = document.querySelector("#refresh-live-button")

const marketplaceForm = document.querySelector("#marketplace-form")
const marketplaceChannelSelect = document.querySelector("#marketplace-channel")
const marketplaceProductSearchInput = document.querySelector("#marketplace-product-search")
const marketplaceProductSelect = document.querySelector("#marketplace-product-select")
const marketplaceQtyInput = document.querySelector("#marketplace-qty")
const marketplacePriceInput = document.querySelector("#marketplace-price")
const marketplaceOrderNoInput = document.querySelector("#marketplace-order-no")
const marketplaceNoteInput = document.querySelector("#marketplace-note")
const marketplacePreviewSku = document.querySelector("#marketplace-preview-sku")
const marketplacePreviewCategory = document.querySelector("#marketplace-preview-category")
const marketplacePreviewStockCurrent = document.querySelector("#marketplace-preview-stock-current")
const marketplacePreviewStockAfter = document.querySelector("#marketplace-preview-stock-after")
const marketplacePreviewNote = document.querySelector("#marketplace-preview-note")
const marketplaceSubmitButton = document.querySelector("#marketplace-submit-button")
const marketplaceInlineStatus = document.querySelector("#marketplace-inline-status")
const marketplaceHistoryList = document.querySelector("#marketplace-history-list")
const marketplaceRefreshButton = document.querySelector("#marketplace-refresh-button")

const connectorForm = document.querySelector("#connector-form")
const adminApiTokenInput = document.querySelector("#admin-api-token")
const clearTokenButton = document.querySelector("#clear-token-button")
const connectorStatus = document.querySelector("#connector-status")

const ordersSearchInput = document.querySelector("#orders-search")
const ordersTotalCount = document.querySelector("#orders-total-count")
const ordersUnpaidCount = document.querySelector("#orders-unpaid-count")
const ordersPaidCount = document.querySelector("#orders-paid-count")
const ordersRevenueTotal = document.querySelector("#orders-revenue-total")
const topSellingList = document.querySelector("#top-selling-list")
const topSellingNote = document.querySelector("#top-selling-note")
const orderStatusStack = document.querySelector("#order-status-stack")
const ordersTableBody = document.querySelector("#orders-table-body")
const ordersMobileList = document.querySelector("#orders-mobile-list")
const ordersEmpty = document.querySelector("#orders-empty")
const ordersSummary = document.querySelector("#orders-summary")
const ordersPrevButton = document.querySelector("#orders-prev")
const ordersNextButton = document.querySelector("#orders-next")
const ordersPageLabel = document.querySelector("#orders-page-label")
const ordersNewBadge = document.querySelector("#orders-new-badge")

const managerSearchInput = document.querySelector("#manager-search")
const managerTableBody = document.querySelector("#manager-table-body")
const managerMobileList = document.querySelector("#manager-mobile-list")
const managerEmpty = document.querySelector("#manager-empty")
const managerSummary = document.querySelector("#manager-summary")
const managerPrevButton = document.querySelector("#manager-prev")
const managerNextButton = document.querySelector("#manager-next")
const managerPageLabel = document.querySelector("#manager-page-label")

const editorCard = document.querySelector("#editor-card")
const editorTitle = document.querySelector("#editor-title")
const editorSubtitle = document.querySelector("#editor-subtitle")
const cancelEditButton = document.querySelector("#cancel-edit-button")
const productForm = document.querySelector("#product-form")
const productIdInput = document.querySelector("#product-id")
const productNameInput = document.querySelector("#product-name")
const productSkuInput = document.querySelector("#product-sku")
const productCategorySelect = document.querySelector("#product-category")
const productModelsInput = document.querySelector("#product-models")
const productPriceDisplayInput = document.querySelector("#product-price-display")
const productPriceInput = document.querySelector("#product-price")
const priceSyncNote = document.querySelector("#price-sync-note")
const productStockInput = document.querySelector("#product-stock")
const productWeightInput = document.querySelector("#product-weight")
const productImageUrlInput = document.querySelector("#product-image-url")
const productImageUpload = document.querySelector("#product-image-upload")
const productImagePreview = document.querySelector("#product-image-preview")

const currentAdminUser = document.querySelector("#current-admin-user")
const credentialsForm = document.querySelector("#credentials-form")
const credentialsUsernameInput = document.querySelector("#credentials-username")
const credentialsPasswordInput = document.querySelector("#credentials-password")
const credentialsConfirmInput = document.querySelector("#credentials-confirm")

const adminStatus = document.querySelector("#admin-status")
const adminToast = document.querySelector("#admin-toast")

const MARKETPLACE_HISTORY_LIMIT = 8
const MARKETPLACE_CHANNEL_LABELS = {
  SHOPEE: "Shopee",
  TOKOPEDIA: "Tokopedia",
  TIKTOK: "TikTok Shop"
}

const readOrderNotificationSoundPreference = () => {
  try {
    return localStorage.getItem(ORDER_NOTIFICATION_SOUND_KEY) !== "off"
  } catch (error) {
    return true
  }
}

const writeOrderNotificationSoundPreference = (enabled) => {
  try {
    localStorage.setItem(ORDER_NOTIFICATION_SOUND_KEY, enabled ? "on" : "off")
  } catch (error) {
    // noop
  }
}

const state = {
  products: [],
  productLookup: new Map(),
  dashboardSummary: null,
  orders: [],
  orderSummary: null,
  topSellingProducts: [],
  pendingOrderActions: new Map(),
  search: "",
  page: 1,
  orderSearch: "",
  orderPage: 1,
  orderMeta: null,
  orderLoadError: "",
  editingId: "",
  notificationFeed: [],
  unreadNotificationOrderIds: new Set(),
  knownRecentOrderIds: new Set(),
  lastSeenOrderTimestamp: 0,
  notificationsInitialized: false,
  notificationDropdownOpen: false,
  notificationSoundEnabled: readOrderNotificationSoundPreference(),
  marketplaceHistory: [],
  marketplaceHistoryError: "",
  marketplaceSearch: "",
  marketplaceSelectedProductId: "",
  isSubmittingMarketplace: false
}

let ordersSearchTimer = 0
let toastTimer = 0
let orderNotificationPollTimer = 0
let orderNotificationPollInFlight = false
let orderNotificationAudioContext = null

const showToast = (message, tone = "success") => {
  if (!adminToast || !message) {
    return
  }

  window.clearTimeout(toastTimer)
  adminToast.textContent = message
  adminToast.className = `admin-toast ${tone}`
  adminToast.hidden = false
  requestAnimationFrame(() => {
    adminToast.classList.add("is-visible")
  })
  toastTimer = window.setTimeout(() => {
    adminToast.classList.remove("is-visible")
    window.setTimeout(() => {
      adminToast.hidden = true
    }, 190)
  }, tone === "error" ? 5600 : 3600)
}

const setStatus = (message, options = {}) => {
  adminStatus.textContent = message

  if (options.toast) {
    showToast(message, options.tone || "success")
  }
}

const getAdminActionErrorMessage = (error) => {
  const rawMessage = String(error?.message || "")

  if (
    /admin\/order\/delete|admin\/product\/delete|Endpoint POST tidak ditemukan/i.test(rawMessage)
  ) {
    return "Endpoint delete belum aktif di Web App. Deploy ulang Apps Script versi terbaru, lalu reload halaman admin."
  }

  if (/admin\/marketplace\/create|admin\/marketplace\/list/i.test(rawMessage)) {
    return "Endpoint marketplace belum aktif di Web App. Update apiMarketplace.gs dan api.gs, lalu deploy ulang Apps Script."
  }

  if (error?.code === "PRODUCT_DELETE_BLOCKED") {
    return "Produk punya riwayat transaksi. Kalau ini dummy/test, lanjutkan konfirmasi Hapus Paksa."
  }

  if (error?.code === "ADMIN_ACTION_PENDING_CHECK") {
    return (
      rawMessage ||
      "Koneksi sempat lambat. Sistem sedang mengecek hasil aksi admin terakhir. Refresh order dulu sebelum klik lagi."
    )
  }

  return rawMessage || "Aksi admin gagal diproses."
}

const parseWeightKgInput = (value = "") => {
  const normalized = String(value).trim().replace(",", ".")

  if (!normalized) {
    return 0
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const resetOrdersState = () => {
  state.orders = []
  state.orderSummary = null
  state.topSellingProducts = []
  state.orderMeta = null
  state.orderLoadError = ""
}

const getOrdersLoadErrorMessage = (error) => {
  const rawMessage = String(error?.message || "")

  if (/admin\/orders\/list/i.test(rawMessage) || /endpoint post tidak ditemukan/i.test(rawMessage)) {
    return "Riwayat order admin belum aktif di Apps Script. Update file api.gs dan apiOrders.gs, lalu deploy ulang Web App."
  }

  return rawMessage || "Riwayat order admin live gagal dimuat."
}

const resetOrderNotifications = () => {
  state.notificationFeed = []
  state.unreadNotificationOrderIds = new Set()
  state.knownRecentOrderIds = new Set()
  state.lastSeenOrderTimestamp = 0
  state.notificationsInitialized = false
  state.notificationDropdownOpen = false
}

const getUnreadOrderNotificationCount = () => state.unreadNotificationOrderIds.size

const getOrderTimestampValue = (order) => {
  const timestampCandidates = [order?.created_at, order?.order_date]

  for (const value of timestampCandidates) {
    const timestamp = value ? new Date(value).getTime() : 0

    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp
    }
  }

  return 0
}

const sortOrdersByRecency = (orders = []) =>
  [...orders].sort((left, right) => getOrderTimestampValue(right) - getOrderTimestampValue(left))

const syncNotificationSoundToggle = () => {
  if (!notificationSoundToggle) {
    return
  }

  notificationSoundToggle.textContent = state.notificationSoundEnabled
    ? "Suara aktif"
    : "Suara mati"
}

const renderNotificationList = () => {
  if (!notificationList) {
    return
  }

  if (!state.notificationFeed.length) {
    notificationList.innerHTML =
      '<div class="admin-notification-empty">Belum ada order baru yang belum dibaca.</div>'
    return
  }

  notificationList.innerHTML = state.notificationFeed
    .map(
      (order) => `
        <button
          class="notification-item ${state.unreadNotificationOrderIds.has(order.order_id) ? "is-unread" : ""}"
          type="button"
          data-order-notification="${escapeHtml(order.order_id)}"
        >
          <div class="notification-item-top">
            <span class="notification-item-dot" aria-hidden="true"></span>
            <div class="notification-item-copy">
              <strong>${escapeHtml(order.order_id)}</strong>
              <span>${escapeHtml(order.customer_nama || "Customer website")}</span>
            </div>
          </div>
          <div class="notification-item-meta">${escapeHtml(order.order_date || "-")}</div>
        </button>
      `
    )
    .join("")
}

const renderOrderNotifications = () => {
  const shouldShowNotifications =
    !dashboard.hidden && hasValidAdminSession() && hasAdminApiToken()

  if (notificationWrap) {
    notificationWrap.hidden = !shouldShowNotifications
  }

  const unreadCount = getUnreadOrderNotificationCount()

  if (notificationBadge) {
    notificationBadge.hidden = unreadCount < 1
    notificationBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount)
  }

  if (ordersNewBadge) {
    ordersNewBadge.hidden = unreadCount < 1
    ordersNewBadge.textContent = `${unreadCount} baru`
  }

  if (notificationButton) {
    notificationButton.setAttribute("aria-expanded", state.notificationDropdownOpen ? "true" : "false")
    notificationButton.classList.toggle("is-active", state.notificationDropdownOpen)
  }

  if (notificationDropdown) {
    notificationDropdown.hidden = !state.notificationDropdownOpen
  }

  syncNotificationSoundToggle()
  renderNotificationList()
}

const setNotificationFeedFromOrders = (orders = []) => {
  const latestOrders = sortOrdersByRecency(orders).slice(0, ORDER_NOTIFICATION_LIMIT)
  const latestIds = new Set(latestOrders.map((order) => order.order_id))

  state.notificationFeed = latestOrders
  state.knownRecentOrderIds = latestIds
  state.unreadNotificationOrderIds = new Set(
    [...state.unreadNotificationOrderIds].filter((orderId) => latestIds.has(orderId))
  )
}

const syncNotificationBaseline = (orders = [], { markAsRead = false } = {}) => {
  setNotificationFeedFromOrders(orders)
  state.lastSeenOrderTimestamp = state.notificationFeed.reduce(
    (latest, order) => Math.max(latest, getOrderTimestampValue(order)),
    state.lastSeenOrderTimestamp || 0
  )
  state.notificationsInitialized = true

  if (markAsRead) {
    state.unreadNotificationOrderIds = new Set()
  }

  renderOrderNotifications()
}

const markNotificationsAsRead = () => {
  state.unreadNotificationOrderIds = new Set()
  renderOrderNotifications()
}

const bumpNotificationBadge = () => {
  if (!notificationBadge) {
    return
  }

  notificationBadge.classList.remove("is-bump")
  void notificationBadge.offsetWidth
  notificationBadge.classList.add("is-bump")
}

const ensureNotificationAudioContext = async () => {
  if (!state.notificationSoundEnabled) {
    return null
  }

  if (typeof window.AudioContext === "undefined" && typeof window.webkitAudioContext === "undefined") {
    return null
  }

  if (!orderNotificationAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    orderNotificationAudioContext = new AudioContextClass()
  }

  if (orderNotificationAudioContext.state === "suspended") {
    try {
      await orderNotificationAudioContext.resume()
    } catch (error) {
      return null
    }
  }

  return orderNotificationAudioContext
}

const playOrderNotificationSound = async () => {
  if (!state.notificationSoundEnabled) {
    return
  }

  const audioContext = await ensureNotificationAudioContext()

  if (!audioContext) {
    return
  }

  try {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const now = audioContext.currentTime

    oscillator.type = "triangle"
    oscillator.frequency.setValueAtTime(740, now)
    oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.12)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.24)
  } catch (error) {
    console.warn("Bunyi notifikasi order gagal diputar.", error)
  }
}

const handleIncomingOrders = (orders = []) => {
  const latestOrders = sortOrdersByRecency(orders).slice(0, ORDER_NOTIFICATION_LIMIT)

  if (!state.notificationsInitialized) {
    syncNotificationBaseline(latestOrders, { markAsRead: true })
    return
  }

  const newOrders = latestOrders.filter((order) => {
    const timestamp = getOrderTimestampValue(order)
    return (
      timestamp > state.lastSeenOrderTimestamp ||
      (timestamp === state.lastSeenOrderTimestamp && !state.knownRecentOrderIds.has(order.order_id))
    )
  })

  setNotificationFeedFromOrders(latestOrders)
  state.lastSeenOrderTimestamp = latestOrders.reduce(
    (latest, order) => Math.max(latest, getOrderTimestampValue(order)),
    state.lastSeenOrderTimestamp || 0
  )

  if (!newOrders.length) {
    renderOrderNotifications()
    return
  }

  newOrders.forEach((order) => {
    state.unreadNotificationOrderIds.add(order.order_id)
  })

  renderOrderNotifications()
  bumpNotificationBadge()

  if (newOrders.length === 1) {
    showToast(`Order baru masuk • ${newOrders[0].order_id}`, "info")
  } else {
    showToast(`${newOrders.length} order baru masuk • cek lonceng untuk detail`, "info")
  }

  void playOrderNotificationSound()
}

const stopOrderNotificationPolling = () => {
  if (orderNotificationPollTimer) {
    window.clearInterval(orderNotificationPollTimer)
    orderNotificationPollTimer = 0
  }

  state.notificationDropdownOpen = false
  renderOrderNotifications()
}

const pollOrderNotifications = async () => {
  if (
    orderNotificationPollInFlight ||
    dashboard.hidden ||
    !hasValidAdminSession() ||
    !hasAdminApiToken() ||
    document.hidden
  ) {
    return
  }

  orderNotificationPollInFlight = true

  try {
    const ordersPayload = await fetchAdminOrdersList({
      page: 1,
      limit: ORDER_NOTIFICATION_LIMIT,
      force: true
    })

    const latestOrders = Array.isArray(ordersPayload.orders) ? ordersPayload.orders : []
    handleIncomingOrders(latestOrders)

    if (!state.orderSearch && state.orderPage === 1 && !state.pendingOrderActions.size) {
      state.orders = latestOrders
      state.orderSummary = ordersPayload.summary || state.orderSummary
      state.topSellingProducts = Array.isArray(ordersPayload.top_products)
        ? ordersPayload.top_products
        : state.topSellingProducts
      state.orderMeta = {
        total: ordersPayload.total || latestOrders.length,
        page: ordersPayload.page || 1,
        limit: ordersPayload.limit || ORDER_NOTIFICATION_LIMIT,
        total_pages: ordersPayload.total_pages || 1
      }
      state.orderLoadError = ""
      renderOrdersTable()
    }
  } catch (error) {
    console.warn("Polling order baru gagal.", error)
  } finally {
    orderNotificationPollInFlight = false
  }
}

const startOrderNotificationPolling = () => {
  stopOrderNotificationPolling()

  if (dashboard.hidden || !hasValidAdminSession() || !hasAdminApiToken()) {
    renderOrderNotifications()
    return
  }

  renderOrderNotifications()
  void pollOrderNotifications()
  orderNotificationPollTimer = window.setInterval(() => {
    void pollOrderNotifications()
  }, ORDER_NOTIFICATION_POLL_MS)
}

const focusOrderFromNotification = async (orderId) => {
  if (!orderId) {
    return
  }

  state.orderSearch = orderId
  state.orderPage = 1

  if (ordersSearchInput) {
    ordersSearchInput.value = orderId
  }

  state.notificationDropdownOpen = false
  state.unreadNotificationOrderIds.delete(orderId)
  renderOrderNotifications()

  try {
    await loadOrdersState({ force: true })
  } catch (error) {
    console.error(error)
  }

  requestAnimationFrame(() => {
    const highlightedTargets = document.querySelectorAll(".order-row-highlight")
    highlightedTargets.forEach((element) => element.classList.remove("order-row-highlight"))

    const target =
      document.querySelector(`[data-order-row="${orderId}"]`) ||
      document.querySelector(`[data-order-mobile="${orderId}"]`)

    if (!target) {
      return
    }

    target.classList.add("order-row-highlight")
    target.scrollIntoView({ behavior: "smooth", block: "center" })
  })
}

const getMarketplaceChannelLabel = (channel) =>
  MARKETPLACE_CHANNEL_LABELS[normalizeText(channel)] || "Marketplace"

const getMarketplaceProducts = () =>
  [...state.products].sort((left, right) => left.name.localeCompare(right.name, "id"))

const getFilteredMarketplaceProducts = () => {
  const query = normalizeText(state.marketplaceSearch)
  const products = getMarketplaceProducts()

  if (!query) {
    return products
  }

  return products.filter((product) => product.searchIndex.includes(query))
}

const getSelectedMarketplaceProduct = () =>
  state.marketplaceSelectedProductId
    ? state.productLookup.get(state.marketplaceSelectedProductId) || null
    : null

const syncMarketplaceSelectedProduct = ({ preferFirstMatch = false } = {}) => {
  const products = getFilteredMarketplaceProducts()
  const currentExists = products.some((product) => product.id === state.marketplaceSelectedProductId)

  if (currentExists) {
    return
  }

  if (preferFirstMatch && products.length) {
    state.marketplaceSelectedProductId = products[0].id
    return
  }

  state.marketplaceSelectedProductId = ""
}

const renderMarketplaceProductOptions = () => {
  if (!marketplaceProductSelect) {
    return
  }

  syncMarketplaceSelectedProduct({
    preferFirstMatch: Boolean(state.marketplaceSearch.trim())
  })

  const products = getFilteredMarketplaceProducts()

  if (!products.length) {
    marketplaceProductSelect.innerHTML =
      '<option value="">Produk tidak ditemukan. Ubah kata kunci pencarian.</option>'
    marketplaceProductSelect.value = ""
    return
  }

  marketplaceProductSelect.innerHTML = [
    '<option value="">Pilih produk dari hasil pencarian...</option>',
    ...products.map(
      (product) => `
        <option value="${escapeHtml(product.id)}">
          ${escapeHtml(product.sku)} • ${escapeHtml(product.name)} • stok ${escapeHtml(String(product.stock))}
        </option>
      `
    )
  ].join("")

  if (state.marketplaceSelectedProductId) {
    marketplaceProductSelect.value = state.marketplaceSelectedProductId
  }
}

const getMarketplaceQtyValue = () => Math.max(0, Number(marketplaceQtyInput?.value || 0) || 0)

const getMarketplacePriceValue = (product) => {
  const rawValue = marketplacePriceInput?.value?.trim() || ""
  if (!rawValue) {
    return Math.max(0, Number(product?.price || 0) || 0)
  }
  return Math.max(0, parseRupiahNumber(rawValue) || 0)
}

const updateMarketplaceInlineStatus = (message, tone = "") => {
  if (!marketplaceInlineStatus) {
    return
  }

  marketplaceInlineStatus.textContent = message
  marketplaceInlineStatus.classList.toggle("is-error", tone === "error")
  marketplaceInlineStatus.classList.toggle("is-ready", tone === "success")
}

const syncMarketplacePriceFromProduct = (product, { force = false } = {}) => {
  if (!marketplacePriceInput || !product) {
    return
  }

  const currentValue = marketplacePriceInput.value.trim()

  if (!force && currentValue) {
    return
  }

  marketplacePriceInput.value = product.price > 0 ? formatRupiah(product.price) : ""
}

const renderMarketplacePreview = () => {
  const product = getSelectedMarketplaceProduct()
  const qty = getMarketplaceQtyValue()

  if (!product) {
    marketplacePreviewSku.textContent = "-"
    marketplacePreviewCategory.textContent = "-"
    marketplacePreviewStockCurrent.textContent = "-"
    marketplacePreviewStockAfter.textContent = "-"
    marketplacePreviewNote.textContent =
      "Pilih produk marketplace dulu. Preview stok akan muncul otomatis."
    marketplacePreviewNote.classList.remove("is-error", "is-ready")
    return
  }

  const stockAfter = product.stock - qty

  marketplacePreviewSku.textContent = product.sku
  marketplacePreviewCategory.textContent = product.categoryLabel
  marketplacePreviewStockCurrent.textContent = formatItemCount(product.stock)
  marketplacePreviewStockAfter.textContent =
    qty > 0 ? formatItemCount(Math.max(0, stockAfter)) : formatItemCount(product.stock)

  if (!qty) {
    marketplacePreviewNote.textContent =
      "Isi qty terjual untuk melihat stok setelah transaksi marketplace."
    marketplacePreviewNote.classList.remove("is-error", "is-ready")
    return
  }

  if (stockAfter < 0) {
    marketplacePreviewNote.textContent =
      "Stok tidak cukup untuk transaksi ini. Kurangi qty atau pilih produk lain."
    marketplacePreviewNote.classList.add("is-error")
    marketplacePreviewNote.classList.remove("is-ready")
    return
  }

  marketplacePreviewNote.textContent = `Transaksi ${getMarketplaceChannelLabel(
    marketplaceChannelSelect.value
  )} ini akan mengurangi stok ${product.name} sebanyak ${formatItemCount(qty)}.`
  marketplacePreviewNote.classList.remove("is-error")
  marketplacePreviewNote.classList.add("is-ready")
}

const renderMarketplaceSection = () => {
  renderMarketplaceProductOptions()
  renderMarketplacePreview()
  renderMarketplaceHistory()

  if (marketplaceSubmitButton && !state.isSubmittingMarketplace) {
    marketplaceSubmitButton.disabled = !hasAdminApiToken()
    marketplaceSubmitButton.classList.toggle("is-disabled", !hasAdminApiToken())
  }

  if (marketplaceRefreshButton && !state.isSubmittingMarketplace) {
    marketplaceRefreshButton.disabled = !hasAdminApiToken()
  }

  if (!hasAdminApiToken()) {
    updateMarketplaceInlineStatus(
      "Simpan token admin browser dulu supaya order marketplace bisa langsung masuk inventory live.",
      "error"
    )
    return
  }

  if (state.isSubmittingMarketplace) {
    return
  }

  if (state.marketplaceHistoryError) {
    updateMarketplaceInlineStatus(
      "Riwayat marketplace belum terbaca, tapi form pencatatan masih bisa dipakai.",
      "error"
    )
    return
  }

  if (!marketplaceInlineStatus?.textContent.trim()) {
    updateMarketplaceInlineStatus(
      "Transaksi ini akan mengurangi stok pusat, masuk inventory log, dan ikut reporting."
    )
  }
}

const setMarketplaceSubmitting = (isSubmitting) => {
  state.isSubmittingMarketplace = isSubmitting

  ;[
    marketplaceChannelSelect,
    marketplaceProductSearchInput,
    marketplaceProductSelect,
    marketplaceQtyInput,
    marketplacePriceInput,
    marketplaceOrderNoInput,
    marketplaceNoteInput,
    marketplaceRefreshButton
  ].forEach((field) => {
    if (field) {
      field.disabled = isSubmitting
    }
  })

  if (!marketplaceSubmitButton) {
    return
  }

  marketplaceSubmitButton.disabled = isSubmitting
  marketplaceSubmitButton.classList.toggle("is-disabled", isSubmitting)
  marketplaceSubmitButton.classList.toggle("is-loading", isSubmitting)
  marketplaceSubmitButton.textContent = isSubmitting
    ? "Mencatat Transaksi..."
    : "Catat Order Marketplace"
}

const resetMarketplaceForm = () => {
  state.marketplaceSearch = ""
  state.marketplaceSelectedProductId = ""
  marketplaceProductSearchInput.value = ""
  marketplaceQtyInput.value = "1"
  marketplaceOrderNoInput.value = ""
  marketplaceNoteInput.value = ""
  marketplacePriceInput.value = ""
  renderMarketplaceProductOptions()
  renderMarketplacePreview()
  updateMarketplaceInlineStatus(
    "Transaksi ini akan mengurangi stok pusat, masuk inventory log, dan ikut reporting."
  )
}

const renderMarketplaceHistory = () => {
  if (!marketplaceHistoryList) {
    return
  }

  if (!hasAdminApiToken()) {
    marketplaceHistoryList.innerHTML =
      '<div class="marketplace-history-empty">Isi token admin browser dulu untuk membaca riwayat marketplace.</div>'
    return
  }

  if (state.marketplaceHistoryError) {
    marketplaceHistoryList.innerHTML = `
      <div class="marketplace-history-empty">${escapeHtml(state.marketplaceHistoryError)}</div>
    `
    return
  }

  if (!state.marketplaceHistory.length) {
    marketplaceHistoryList.innerHTML =
      '<div class="marketplace-history-empty">Belum ada transaksi marketplace yang tercatat.</div>'
    return
  }

  marketplaceHistoryList.innerHTML = state.marketplaceHistory
    .map(
      (item) => `
        <article class="marketplace-history-item">
          <div class="marketplace-history-top">
            <div class="marketplace-history-copy">
              <strong>${escapeHtml(item.nama_produk || "-")}</strong>
              <small>${escapeHtml(item.sku || "-")} • ${escapeHtml(item.waktu || "-")}</small>
            </div>
            <span class="marketplace-history-channel">${escapeHtml(item.channel_label || "Marketplace")}</span>
          </div>
          <div class="marketplace-history-meta">
            <span>${escapeHtml(formatItemCount(item.qty_keluar || 0))}</span>
            <span>${escapeHtml(formatRupiah(item.harga_jual_satuan || 0))}</span>
            ${
              item.marketplace_order_no
                ? `<span>${escapeHtml(item.marketplace_order_no)}</span>`
                : `<span>Tanpa nomor order</span>`
            }
          </div>
          <div class="marketplace-history-total">
            <span>${escapeHtml(item.referensi_id || "-")}</span>
            <strong>${escapeHtml(formatRupiah(item.total_penjualan || 0))}</strong>
          </div>
        </article>
      `
    )
    .join("")
}

const loadMarketplaceHistory = async () => {
  if (!hasAdminApiToken()) {
    state.marketplaceHistory = []
    state.marketplaceHistoryError = ""
    renderMarketplaceHistory()
    return false
  }

  try {
    const payload = await fetchAdminMarketplaceHistory({
      limit: MARKETPLACE_HISTORY_LIMIT
    })
    state.marketplaceHistory = Array.isArray(payload.items) ? payload.items : []
    state.marketplaceHistoryError = ""
  } catch (error) {
    console.error(error)
    state.marketplaceHistory = []
    state.marketplaceHistoryError =
      error.message || "Riwayat marketplace live gagal dimuat."
    renderMarketplaceHistory()
    return false
  }

  renderMarketplaceHistory()
  return true
}

const submitMarketplaceOrder = async () => {
  if (state.isSubmittingMarketplace) {
    return
  }

  const product = getSelectedMarketplaceProduct()
  const channel = normalizeText(marketplaceChannelSelect.value)
  const qty = getMarketplaceQtyValue()
  const hargaJual = getMarketplacePriceValue(product)
  const marketplaceOrderNo = marketplaceOrderNoInput.value.trim()
  const catatan = marketplaceNoteInput.value.trim()

  if (!channel) {
    throw new Error("Pilih channel marketplace dulu.")
  }

  if (!product) {
    throw new Error("Pilih produk marketplace yang valid dulu.")
  }

  if (qty <= 0) {
    throw new Error("Qty terjual harus lebih besar dari 0.")
  }

  if (qty > product.stock) {
    throw new Error(`Stok ${product.name} tidak cukup. Stok aktif saat ini ${product.stock}.`)
  }

  setMarketplaceSubmitting(true)
  updateMarketplaceInlineStatus("Transaksi marketplace sedang dikirim ke inventory live...")

  try {
    const response = await createAdminMarketplaceOrder({
      channel,
      sku: product.sku,
      qty_keluar: qty,
      harga_jual: hargaJual,
      marketplace_order_no: marketplaceOrderNo,
      catatan
    })

    await loadCatalogState({ force: true })
    await loadMarketplaceHistory()
    renderDashboard()
    resetMarketplaceForm()
    updateMarketplaceInlineStatus(
      `Order ${getMarketplaceChannelLabel(channel)} untuk ${product.name} berhasil dicatat.`,
      "success"
    )
    setStatus(
      `Order marketplace ${response.transaction?.referensi_id || product.sku} berhasil dicatat.`,
      {
        toast: true
      }
    )
  } catch (error) {
    console.error(error)
    updateMarketplaceInlineStatus(
      error.message || "Order marketplace gagal dicatat. Coba lagi beberapa detik.",
      "error"
    )
    throw error
  } finally {
    setMarketplaceSubmitting(false)
    renderMarketplacePreview()
  }
}

const updatePriceSyncNote = () => {
  const price = parseRupiahNumber(productPriceInput.value)
  const displayValue = productPriceDisplayInput.value.trim()

  if (normalizeText(displayValue).includes("hubungi")) {
    priceSyncNote.textContent =
      "Harga hitung dinonaktifkan. Website akan menampilkan teks Hubungi admin."
    return
  }

  if (price > 0) {
    priceSyncNote.textContent = `Harga hitung aktif: ${formatRupiah(price)}.`
    return
  }

  priceSyncNote.textContent =
    "Isi angka biasa atau format Rupiah, sistem akan merapikan otomatis."
}

const syncDisplayFromNumeric = () => {
  const price = parseRupiahNumber(productPriceInput.value)
  const currentDisplay = productPriceDisplayInput.value.trim()
  const canAutoFill =
    !currentDisplay ||
    isRupiahLikeValue(currentDisplay) ||
    normalizeText(currentDisplay).includes("hubungi")

  productPriceInput.value = price > 0 ? formatRupiahInput(productPriceInput.value) : ""

  if (canAutoFill) {
    productPriceDisplayInput.value = price > 0 ? formatRupiah(price) : "Hubungi admin"
  }

  updatePriceSyncNote()
}

const syncNumericFromDisplay = () => {
  const rawDisplay = productPriceDisplayInput.value.trim()

  if (!rawDisplay) {
    if (!productPriceInput.value.trim()) {
      updatePriceSyncNote()
    }
    return
  }

  if (normalizeText(rawDisplay).includes("hubungi")) {
    productPriceDisplayInput.value = "Hubungi admin"
    productPriceInput.value = ""
    updatePriceSyncNote()
    return
  }

  if (!isRupiahLikeValue(rawDisplay)) {
    updatePriceSyncNote()
    return
  }

  const price = parseRupiahNumber(rawDisplay)
  productPriceInput.value = price > 0 ? formatRupiah(price) : ""
  productPriceDisplayInput.value = price > 0 ? formatRupiah(price) : "Hubungi admin"
  updatePriceSyncNote()
}

const populateCategoryOptions = () => {
  productCategorySelect.innerHTML = Object.entries(categoryLabels)
    .map(
      ([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`
    )
    .join("")
}

const initReveal = () => {
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.16 }
    )

    revealBlocks.forEach((block) => observer.observe(block))
  } else {
    revealBlocks.forEach((block) => block.classList.add("is-visible"))
  }
}

const applyCatalog = (products) => {
  state.products = products
  state.productLookup = makeProductLookup(products)
}

const refreshConnectorState = () => {
  if (hasAdminApiToken()) {
    connectorStatus.textContent =
      "Token admin browser sudah aktif. Simpan produk, atur order, dan ubah stok sekarang akan langsung mengubah inventory live."
    return
  }

  connectorStatus.textContent =
    "Token admin belum tersimpan di browser ini."
}

const updateDashboardHeadings = () => {
  dashboardNote.textContent =
    "Data yang tampil di dashboard ini berasal langsung dari inventory live Google Sheet."

  actionNote.textContent = hasAdminApiToken()
    ? "Token admin browser aktif. Perubahan form akan langsung dikirim ke inventory live."
    : "Isi token admin browser dulu sebelum menyimpan perubahan produk atau memproses order."
}

const renderSummary = () => {
  const summary = state.dashboardSummary || {
    total_produk_aktif: state.products.length,
    ready_stock: state.products.filter((product) => product.availability === "ready").length,
    out_of_stock: state.products.filter((product) => product.availability === "out").length,
    total_stok_unit: state.products.reduce((total, product) => total + product.stock, 0)
  }

  summaryTotalProducts.textContent = formatItemCount(summary.total_produk_aktif || 0)
  summaryReadyProducts.textContent = formatItemCount(summary.ready_stock || 0)
  summaryOutProducts.textContent = formatItemCount(summary.out_of_stock || 0)
  summaryStockUnits.textContent = formatItemCount(summary.total_stok_unit || 0)
  updateDashboardHeadings()
  refreshConnectorState()
}

const getOrderStatusClass = (value) => {
  const normalized = normalizeText(value)

  if (normalized === "done" || normalized === "paid") {
    return "ready"
  }

  if (normalized === "cancel" || normalized === "unpaid") {
    return "out"
  }

  return "pending"
}

const getOrderMetaValue = (key, fallback = 0) =>
  Number(state.orderMeta?.[key] ?? fallback) || fallback

const getPendingOrderActionLabel = (orderId) =>
  state.pendingOrderActions.get(orderId) || ""

const setPendingOrderAction = (orderId, label = "") => {
  if (!orderId) {
    return
  }

  if (!label) {
    state.pendingOrderActions.delete(orderId)
    return
  }

  state.pendingOrderActions.set(orderId, label)
}

const patchOrderInCurrentState = (orderId, patch = {}) => {
  state.orders = state.orders.map((order) =>
    order.order_id === orderId
      ? {
          ...order,
          ...patch
        }
      : order
  )
}

const removeOrderFromCurrentState = (orderId) => {
  state.orders = state.orders.filter((order) => order.order_id !== orderId)

  if (state.orderMeta) {
    state.orderMeta = {
      ...state.orderMeta,
      total: Math.max(0, Number(state.orderMeta.total || 0) - 1)
    }
  }
}

const restoreOrderItemsToLocalCatalog = (orderId) => {
  const order = state.orders.find((item) => item.order_id === orderId)
  const orderItems = Array.isArray(order?.items) ? order.items : []

  if (!orderItems.length) {
    return
  }

  const qtyBySku = new Map()
  orderItems.forEach((item) => {
    const sku = String(item.sku || "").toUpperCase()
    const qty = Number(item.qty || 0)

    if (!sku || qty <= 0) {
      return
    }

    qtyBySku.set(sku, (qtyBySku.get(sku) || 0) + qty)
  })

  state.products = state.products.map((product) => {
    const qty = qtyBySku.get(String(product.sku || "").toUpperCase())

    if (!qty) {
      return product
    }

    const nextStock = Number(product.stock || 0) + qty
    const stockStatus =
      nextStock <= 0
        ? "OUT OF STOCK"
        : nextStock <= Number(product.minimumStock || 1)
          ? "LOW"
          : "READY"

    return {
      ...product,
      stock: nextStock,
      stockIn: nextStock,
      stockStatus,
      availability: nextStock <= 0 ? "out" : "ready",
      availabilityLabel: nextStock <= 0 ? "Stock Habis" : "Ready"
    }
  })

  state.productLookup = makeProductLookup(state.products)
}

const removeProductFromCurrentState = (productId) => {
  state.products = state.products.filter((product) => product.id !== productId)
  state.productLookup = makeProductLookup(state.products)
}

const renderTopSellingList = () => {
  topSellingList.innerHTML = ""
  topSellingList.classList.toggle("is-scrollable", state.topSellingProducts.length > 3)

  if (!state.topSellingProducts.length) {
    topSellingList.innerHTML = `
      <div class="orders-empty-note">
        Belum ada produk terjual yang bisa diringkas dari order website.
      </div>
    `
    return
  }

  const fragment = document.createDocumentFragment()

  state.topSellingProducts.forEach((item, index) => {
    const article = document.createElement("article")
    article.className = "top-selling-item"
    article.innerHTML = `
      <span class="top-selling-rank">#${index + 1}</span>
      <div class="top-selling-copy">
        <strong>${escapeHtml(item.nama_produk || item.sku)}</strong>
        <small>${escapeHtml(item.sku)} · ${formatItemCount(item.qty_sold || 0)} item</small>
      </div>
      <strong class="top-selling-total">${formatRupiah(item.revenue || 0)}</strong>
    `
    fragment.appendChild(article)
  })

  topSellingList.appendChild(fragment)
}

const renderOrderStatusStack = () => {
  const summary = state.orderSummary || {}
  const items = [
    { label: "NEW", value: summary.new_orders || 0 },
    { label: "PROCESS", value: summary.process_orders || 0 },
    { label: "DONE", value: summary.done_orders || 0 },
    { label: "CANCEL", value: summary.cancel_orders || 0 }
  ]

  orderStatusStack.innerHTML = items
    .map(
      (item) => `
        <div class="order-status-pill">
          <span>${escapeHtml(item.label)}</span>
          <strong>${formatItemCount(item.value)}</strong>
        </div>
      `
    )
    .join("")
}

const buildOrderActions = (order) => {
  const pendingLabel = getPendingOrderActionLabel(order.order_id)

  if (pendingLabel) {
    return `
      <span class="row-action is-disabled is-pending">
        ${escapeHtml(pendingLabel)}
      </span>
    `
  }

  const actions = []
  const paymentStatus = normalizeText(order.payment_status)
  const statusOrder = normalizeText(order.status_order)

  if (statusOrder !== "cancel") {
    actions.push(`
      <button class="row-action" type="button" data-order-action="toggle-payment" data-order-id="${escapeHtml(
        order.order_id
      )}">
        ${paymentStatus === "paid" ? "Set Unpaid" : "Set Paid"}
      </button>
    `)
  }

  if (statusOrder === "new") {
    actions.push(`
      <button class="row-action" type="button" data-order-action="set-process" data-order-id="${escapeHtml(
        order.order_id
      )}">
        Set Process
      </button>
    `)
  } else if (statusOrder === "process") {
    actions.push(`
      <button class="row-action" type="button" data-order-action="set-done" data-order-id="${escapeHtml(
        order.order_id
      )}">
        Set Done
      </button>
    `)
  }

  if (statusOrder !== "cancel") {
    actions.push(`
      <button class="row-action danger" type="button" data-order-action="cancel" data-order-id="${escapeHtml(
        order.order_id
      )}">
        Cancel
      </button>
    `)
  } else {
    actions.push(`
      <button class="row-action danger" type="button" data-order-action="delete-history" data-order-id="${escapeHtml(
        order.order_id
      )}">
        Hapus Riwayat
      </button>
    `)
  }

  return actions.join("")
}

const renderOrdersTable = () => {
  const orders = state.orders || []
  ordersTableBody.innerHTML = ""
  ordersMobileList.innerHTML = ""
  ordersEmpty.hidden = true

  if (!hasAdminApiToken()) {
    ordersEmpty.hidden = false
    ordersSummary.textContent = "Token admin browser dibutuhkan"
    ordersPageLabel.textContent = "Hal 1 dari 1"
    ordersPrevButton.disabled = true
    ordersNextButton.disabled = true
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="7"><span class="table-muted">Isi token admin browser untuk melihat order customer.</span></td>
      </tr>
    `
    topSellingNote.textContent = "Isi token admin browser untuk membaca order customer."
    ordersTotalCount.textContent = "0"
    ordersUnpaidCount.textContent = "0"
    ordersPaidCount.textContent = "0"
    ordersRevenueTotal.textContent = formatRupiah(0)
    renderTopSellingList()
    renderOrderStatusStack()
    return
  }

  if (!orders.length) {
    ordersTotalCount.textContent = "0"
    ordersUnpaidCount.textContent = "0"
    ordersPaidCount.textContent = "0"
    ordersRevenueTotal.textContent = formatRupiah(0)
    ordersEmpty.hidden = false
    ordersSummary.textContent = "0 order"
    ordersPageLabel.textContent = "Hal 1 dari 1"
    ordersPrevButton.disabled = true
    ordersNextButton.disabled = true
    const emptyCopy = ordersEmpty.querySelector("p")

    if (state.orderLoadError) {
      emptyCopy.textContent = state.orderLoadError
      topSellingNote.textContent = state.orderLoadError
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="7"><span class="table-muted">${escapeHtml(state.orderLoadError)}</span></td>
        </tr>
      `
    } else {
      emptyCopy.textContent =
        "Isi token admin browser untuk memuat data customer dari inventory live, atau cek apakah order website sudah masuk."
      topSellingNote.textContent = "Belum ada barang laku yang tercatat."
    }
    renderTopSellingList()
    renderOrderStatusStack()
    return
  }

  const summary = state.orderSummary || {}
  const totalOrders = getOrderMetaValue("total", orders.length)
  const totalPages = getOrderMetaValue("total_pages", 1)

  ordersTotalCount.textContent = formatItemCount(summary.total_orders || totalOrders)
  ordersUnpaidCount.textContent = formatItemCount(summary.unpaid_orders || 0)
  ordersPaidCount.textContent = formatItemCount(summary.paid_orders || 0)
  ordersRevenueTotal.textContent = formatRupiah(summary.total_revenue || 0)
  state.orderLoadError = ""
  topSellingNote.textContent =
    state.topSellingProducts.length > 3
      ? "Top 3 langsung tampil. Scroll untuk lihat produk laku lainnya."
      : "Rekap dihitung dari order website yang belum cancel dan produk yang paling laku."

  const rowFragment = document.createDocumentFragment()
  const mobileFragment = document.createDocumentFragment()

  orders.forEach((order) => {
    const row = document.createElement("tr")
    row.dataset.orderRow = order.order_id
    row.innerHTML = `
      <td>
        <strong>${escapeHtml(order.order_id)}</strong>
        <span class="table-muted">${escapeHtml(order.order_date || "-")}</span>
      </td>
      <td>
        <strong>${escapeHtml(order.customer_nama || "-")}</strong>
        <span class="table-muted">${escapeHtml(order.customer_whatsapp || "-")}</span>
      </td>
      <td>
        <strong>${escapeHtml(order.item_summary || "-")}</strong>
        <span class="table-muted">${escapeHtml(order.qty_total || 0)} item</span>
      </td>
      <td>
        <strong>${escapeHtml(formatRupiah(order.grand_total || 0))}</strong>
        <span class="table-muted">ongkir ${escapeHtml(formatRupiah(order.ongkir || 0))}</span>
      </td>
      <td>
        <span class="table-status ${getOrderStatusClass(order.payment_status)}">
          ${escapeHtml(order.payment_status || "-")}
        </span>
      </td>
      <td>
        <span class="table-status ${getOrderStatusClass(order.status_order)}">
          ${escapeHtml(order.status_order || "-")}
        </span>
      </td>
      <td>
        <div class="row-actions">
          ${buildOrderActions(order)}
        </div>
      </td>
    `
    rowFragment.appendChild(row)

    const mobileCard = document.createElement("article")
    mobileCard.className = "manager-mobile-card orders-mobile-card"
    mobileCard.dataset.orderMobile = order.order_id
    mobileCard.innerHTML = `
      <div class="manager-mobile-top">
        <div>
          <span class="table-muted">${escapeHtml(order.order_id)}</span>
          <strong>${escapeHtml(order.customer_nama || "-")}</strong>
        </div>
        <span class="table-status ${getOrderStatusClass(order.status_order)}">
          ${escapeHtml(order.status_order || "-")}
        </span>
      </div>
      <div class="manager-mobile-meta">
        <span>${escapeHtml(order.order_date || "-")}</span>
        <span>${escapeHtml(order.customer_whatsapp || "-")}</span>
        <span>${escapeHtml(formatRupiah(order.grand_total || 0))}</span>
      </div>
      <p class="order-mobile-items">${escapeHtml(order.item_summary || "-")}</p>
      <div class="row-actions">
        ${buildOrderActions(order)}
      </div>
    `
    mobileFragment.appendChild(mobileCard)
  })

  ordersTableBody.appendChild(rowFragment)
  ordersMobileList.appendChild(mobileFragment)
  ordersSummary.textContent = `${formatItemCount(totalOrders)} order ditemukan`
  ordersPageLabel.textContent = `Hal ${getOrderMetaValue("page", 1)} dari ${totalPages}`
  ordersPrevButton.disabled = getOrderMetaValue("page", 1) <= 1
  ordersNextButton.disabled = getOrderMetaValue("page", 1) >= totalPages
  renderTopSellingList()
  renderOrderStatusStack()
}

const setPreview = (imageUrl) => {
  if (imageUrl && imageUrl.trim()) {
    productImagePreview.innerHTML = `
      <img src="${imageUrl}" alt="Preview foto produk" />
    `
    return
  }

  productImagePreview.innerHTML = "<span>Preview foto produk akan muncul di sini.</span>"
}

const clearEditor = () => {
  state.editingId = ""
  productIdInput.value = ""
  productNameInput.value = ""
  productSkuInput.value = ""
  productCategorySelect.value = "mesin"
  productModelsInput.value = ""
  productPriceDisplayInput.value = ""
  productPriceInput.value = ""
  productStockInput.value = "0"
  productWeightInput.value = ""
  productImageUrlInput.value = ""
  productImageUpload.value = ""
  editorTitle.textContent = "Tambah Produk Baru"
  editorSubtitle.textContent =
    "Isi data produk lalu simpan supaya katalog dan stok live langsung ikut terbarui."
  setPreview("")
  updatePriceSyncNote()
}

const fillEditor = (product) => {
  state.editingId = product.id
  productIdInput.value = product.id
  productNameInput.value = product.name
  productSkuInput.value = product.sku
  productCategorySelect.value = product.category
  productModelsInput.value = product.models.join(", ")
  productPriceDisplayInput.value = product.priceDisplay
  productPriceInput.value = product.price > 0 ? formatRupiah(product.price) : ""
  productStockInput.value = String(product.stock)
  productWeightInput.value = product.weightKg ? String(product.weightKg) : ""
  productImageUrlInput.value = product.imageUrl || ""
  editorTitle.textContent = `Edit Produk Live: ${product.sku}`
  editorSubtitle.textContent =
    "Perubahan yang disimpan akan langsung dikirim ke inventory live Google Sheet."
  setPreview(product.imageUrl || "")
  updatePriceSyncNote()
}

const getFilteredProducts = () => {
  const query = state.search

  return [...state.products]
    .filter((product) => !query || product.searchIndex.includes(query))
    .sort((left, right) => left.name.localeCompare(right.name, "id"))
}

const getTotalPages = (totalItems) =>
  Math.max(1, Math.ceil(totalItems / tablePageSize))

const renderManagerTable = () => {
  const filteredProducts = getFilteredProducts()
  const totalPages = getTotalPages(filteredProducts.length)
  state.page = Math.min(state.page, totalPages)
  const startIndex = (state.page - 1) * tablePageSize
  const currentItems = filteredProducts.slice(startIndex, startIndex + tablePageSize)

  managerTableBody.innerHTML = ""
  managerMobileList.innerHTML = ""
  managerEmpty.hidden = filteredProducts.length !== 0

  if (filteredProducts.length === 0) {
    managerSummary.textContent = "0 produk"
    managerPageLabel.textContent = "Hal 1 dari 1"
    managerPrevButton.disabled = true
    managerNextButton.disabled = true
    return
  }

  const fragment = document.createDocumentFragment()
  const mobileFragment = document.createDocumentFragment()

  currentItems.forEach((product) => {
    const row = document.createElement("tr")
    row.innerHTML = `
      <td><span class="table-muted">${escapeHtml(product.sku)}</span></td>
      <td>
        <strong>${escapeHtml(product.name)}</strong>
        <span class="table-muted">${escapeHtml(product.models.join(", ") || "Universal")}</span>
      </td>
      <td><span class="table-muted">${escapeHtml(getCategoryLabel(product.category))}</span></td>
      <td><span class="table-muted">${escapeHtml(formatProductPrice(product))}</span></td>
      <td><span class="table-muted">${escapeHtml(String(product.stock))}</span></td>
      <td>
        <span class="table-status ${product.availability}">
          ${escapeHtml(product.availabilityLabel)}
        </span>
      </td>
      <td>
        <div class="row-actions">
          <button class="row-action" type="button" data-action="edit" data-product-id="${escapeHtml(
            product.id
          )}">
            Edit
          </button>
          <button class="row-action" type="button" data-action="deactivate" data-product-id="${escapeHtml(
            product.id
          )}">
            Nonaktifkan
          </button>
          <button class="row-action danger" type="button" data-action="delete" data-product-id="${escapeHtml(
            product.id
          )}">
            Hapus
          </button>
        </div>
      </td>
    `
    fragment.appendChild(row)

    const mobileCard = document.createElement("article")
    mobileCard.className = "manager-mobile-card"
    mobileCard.innerHTML = `
      <div class="manager-mobile-top">
        <div>
          <span class="table-muted">${escapeHtml(product.sku)}</span>
          <strong>${escapeHtml(product.name)}</strong>
        </div>
        <span class="table-status ${product.availability}">
          ${escapeHtml(product.availabilityLabel)}
        </span>
      </div>
      <div class="manager-mobile-meta">
        <span>${escapeHtml(getCategoryLabel(product.category))}</span>
        <span>${escapeHtml(formatProductPrice(product))}</span>
        <span>stok ${escapeHtml(String(product.stock))}</span>
      </div>
      <div class="row-actions">
        <button class="row-action" type="button" data-action="edit" data-product-id="${escapeHtml(
          product.id
        )}">
          Edit
        </button>
        <button class="row-action" type="button" data-action="deactivate" data-product-id="${escapeHtml(
          product.id
        )}">
          Nonaktifkan
        </button>
        <button class="row-action danger" type="button" data-action="delete" data-product-id="${escapeHtml(
          product.id
        )}">
          Hapus
        </button>
      </div>
    `
    mobileFragment.appendChild(mobileCard)
  })

  managerTableBody.appendChild(fragment)
  managerMobileList.appendChild(mobileFragment)
  managerSummary.textContent = `${formatItemCount(filteredProducts.length)} produk live ditemukan`
  managerPageLabel.textContent = `Hal ${state.page} dari ${totalPages}`
  managerPrevButton.disabled = state.page === 1
  managerNextButton.disabled = state.page === totalPages
}

const renderDashboard = () => {
  renderSummary()
  renderOrdersTable()
  renderManagerTable()
  renderMarketplaceSection()
  renderOrderNotifications()
  const credentials = readAdminCredentials()
  currentAdminUser.textContent = credentials?.username || "-"
  credentialsUsernameInput.value = credentials?.username || ""
}

const loadCatalogState = async ({ force = false } = {}) => {
  if (!force && state.products.length && state.dashboardSummary) {
    return
  }

  const [catalog, summary] = await Promise.all([
    fetchLiveCatalog({ force }),
    fetchLiveDashboardSummary({ force })
  ])

  applyCatalog(catalog.products)
  state.dashboardSummary = summary
}

const hydrateCatalogStateFromCache = () => {
  let hasCachedState = false
  const cachedCatalog = readCachedLiveCatalog()
  const cachedSummary = readCachedLiveDashboardSummary()

  if (cachedCatalog?.products?.length) {
    applyCatalog(cachedCatalog.products)
    hasCachedState = true
  }

  if (cachedSummary) {
    state.dashboardSummary = cachedSummary
    hasCachedState = true
  }

  return hasCachedState
}

const hydrateOrdersStateFromCache = () => {
  if (!hasAdminApiToken()) {
    return false
  }

  const cachedOrders = readCachedAdminOrders()

  if (!cachedOrders) {
    return false
  }

  state.orders = Array.isArray(cachedOrders.orders) ? cachedOrders.orders : []
  state.orderSummary = cachedOrders.summary || null
  state.topSellingProducts = Array.isArray(cachedOrders.top_products)
    ? cachedOrders.top_products
    : []
  state.orderMeta = {
    total: cachedOrders.total || 0,
    page: cachedOrders.page || 1,
    limit: cachedOrders.limit || ordersPageSize,
    total_pages: cachedOrders.total_pages || 1
  }
  state.orderLoadError = ""

  if (!state.notificationsInitialized) {
    syncNotificationBaseline(state.orders, { markAsRead: true })
  }

  return true
}

const hydrateDashboardStateFromCache = () => {
  const hasCatalogCache = hydrateCatalogStateFromCache()
  const hasOrdersCache = hydrateOrdersStateFromCache()
  const hasCachedState = hasCatalogCache || hasOrdersCache

  if (hasCachedState) {
    renderDashboard()
  }

  return hasCachedState
}

const loadOrdersState = async ({ force = false } = {}) => {
  if (!hasAdminApiToken()) {
    resetOrdersState()
    renderDashboard()
    return
  }

  try {
    const ordersPayload = await fetchAdminOrdersList({
      search: state.orderSearch,
      page: state.orderPage,
      limit: ordersPageSize,
      force
    })

    state.orders = Array.isArray(ordersPayload.orders) ? ordersPayload.orders : []
    state.orderSummary = ordersPayload.summary || null
    state.topSellingProducts = Array.isArray(ordersPayload.top_products)
      ? ordersPayload.top_products
      : []
    state.orderLoadError = ""
    state.orderMeta = {
      total: ordersPayload.total || 0,
      page: ordersPayload.page || 1,
      limit: ordersPayload.limit || ordersPageSize,
      total_pages: ordersPayload.total_pages || 1
    }

    if (!state.notificationsInitialized && !state.orderSearch && state.orderPage === 1) {
      syncNotificationBaseline(state.orders, { markAsRead: true })
    }
  } catch (error) {
    console.error(error)
    resetOrdersState()
    state.orderLoadError = getOrdersLoadErrorMessage(error)
    setStatus(state.orderLoadError)
  }

  renderDashboard()
}

const loadLiveState = async ({ forceCatalog = false, includeOrders = true } = {}) => {
  await loadCatalogState({ force: forceCatalog })

  if (includeOrders) {
    await loadOrdersState()
  } else {
    renderDashboard()
  }

  await loadMarketplaceHistory()
  renderDashboard()
}

const buildEditorPayload = () => {
  const editingId = state.editingId
  const name = productNameInput.value.trim()
  const sku = productSkuInput.value.trim().toUpperCase()
  const category = productCategorySelect.value
  const models = productModelsInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  const price = Math.max(0, parseRupiahNumber(productPriceInput.value) || 0)
  const stock = Math.max(0, Number(productStockInput.value) || 0)
  const weight = parseWeightKgInput(productWeightInput.value)
  const imageUrl = productImageUrlInput.value.trim()
  let priceDisplay = productPriceDisplayInput.value.trim()

  if (!name) {
    throw new Error("Nama produk wajib diisi.")
  }

  if (!sku) {
    throw new Error("SKU wajib diisi.")
  }

  const duplicateSku = state.products.find(
    (product) =>
      normalizeText(product.sku) === normalizeText(sku) && product.id !== editingId
  )

  if (duplicateSku) {
    throw new Error("SKU sudah dipakai produk lain. Pakai SKU yang berbeda.")
  }

  if (!priceDisplay) {
    priceDisplay = price > 0 ? formatRupiah(price) : "Hubungi admin"
  } else if (normalizeText(priceDisplay).includes("hubungi")) {
    priceDisplay = "Hubungi admin"
  } else if (isRupiahLikeValue(priceDisplay)) {
    priceDisplay = price > 0 ? formatRupiah(price) : "Hubungi admin"
  }

  return {
    identifier: editingId || "",
    sku,
    nama_produk: name,
    kategori: getCategoryLabel(category),
    model_vespa: models.join(", "),
    deskripsi_singkat: "",
    harga_jual: price > 0 ? price : "",
    stok_aktif: stock,
    minimum_stok: 1,
    status_produk: "AKTIF",
    image_url: imageUrl,
    berat: weight,
    lokasi_rak: "",
    harga_tampilan: priceDisplay
  }
}

const saveProduct = async () => {
  const payload = buildEditorPayload()
  const isEditing = Boolean(state.editingId)

  if (isEditing) {
    await updateAdminProduct({
      product_id: payload.identifier,
      sku: payload.sku,
      nama_produk: payload.nama_produk,
      kategori: payload.kategori,
      model_vespa: payload.model_vespa,
      harga_jual: payload.harga_jual,
      stok_aktif: payload.stok_aktif,
      berat: payload.berat,
      image_url: payload.image_url,
      status_produk: "AKTIF"
    })
  } else {
    await createAdminProduct({
      sku: payload.sku,
      nama_produk: payload.nama_produk,
      kategori: payload.kategori,
      model_vespa: payload.model_vespa,
      deskripsi_singkat: "",
      harga_modal: "",
      harga_jual: payload.harga_jual,
      stok_aktif: payload.stok_aktif,
      minimum_stok: 1,
      status_produk: "AKTIF",
      image_url: payload.image_url,
      berat: payload.berat,
      lokasi_rak: ""
    })
  }

  await loadLiveState({ forceCatalog: true, includeOrders: false })
  clearEditor()
  setStatus(
    `${payload.nama_produk} berhasil ${isEditing ? "diperbarui" : "ditambahkan"} ke inventory live.`,
    {
      toast: true
    }
  )
}

const deactivateProduct = async (productId) => {
  const product = state.productLookup.get(productId)

  if (!product) {
    return
  }

  const confirmed = window.confirm(
    `Nonaktifkan produk "${product.name}" dari katalog live?`
  )

  if (!confirmed) {
    return
  }

  await deactivateAdminProduct({
    productId: product.id,
    sku: product.sku
  })
  await loadLiveState({ forceCatalog: true, includeOrders: false })

  if (state.editingId === productId) {
    clearEditor()
  }

  setStatus(`${product.name} berhasil dinonaktifkan dari katalog live.`, {
    toast: true
  })
}

const deleteProductPermanently = async (productId) => {
  const product = state.productLookup.get(productId)

  if (!product) {
    return
  }

  const confirmed = window.confirm(
    `Delete permanen produk "${product.name}" dari MASTER_PRODUCTS?\n\nPakai ini hanya untuk produk salah input atau dummy. Kalau produk pernah dipakai transaksi, sistem akan menolak dan kamu harus pakai Nonaktifkan.`
  )

  if (!confirmed) {
    return
  }

  try {
    await deleteAdminProduct({
      productId: product.id,
      sku: product.sku,
      actor: "ADMIN_WEB"
    })
  } catch (error) {
    if (error.code !== "PRODUCT_DELETE_BLOCKED") {
      throw error
    }

    const reasons = Array.isArray(error.details?.reasons)
      ? `\n\nRiwayat terdeteksi:\n- ${error.details.reasons.join("\n- ")}`
      : ""
    const forceConfirmed = window.confirm(
      `Produk "${product.name}" punya riwayat transaksi.${reasons}\n\nKalau ini memang produk dummy/test, lanjut HAPUS PAKSA dari MASTER_PRODUCTS? Riwayat lama tetap tersimpan sebagai log, tapi produk tidak muncul lagi di katalog.`
    )

    if (!forceConfirmed) {
      setStatus("Hapus produk dibatalkan. Untuk produk real, pakai Nonaktifkan saja.", {
        toast: true
      })
      return
    }

    await deleteAdminProduct({
      productId: product.id,
      sku: product.sku,
      actor: "ADMIN_WEB",
      forceDelete: true
    })
  }

  removeProductFromCurrentState(productId)
  renderDashboard()
  void loadCatalogState({ force: true }).then(renderDashboard).catch(console.error)

  if (state.editingId === productId) {
    clearEditor()
  }

  setStatus(`${product.name} berhasil dihapus permanen dari MASTER_PRODUCTS.`, {
    toast: true
  })
}

const exportCatalog = () => {
  const payload = {
    source: "live-api",
    updatedAt: new Date().toISOString(),
    count: state.products.length,
    products: state.products
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `toko-vespa-jogja-live-snapshot-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  setStatus("Snapshot live berhasil diexport ke file JSON.", {
    toast: true
  })
}

const showSetup = () => {
  stopOrderNotificationPolling()
  resetOrderNotifications()
  accessCard.hidden = false
  setupView.hidden = false
  loginView.hidden = true
  dashboard.hidden = true
  logoutButton.hidden = true
  accessNote.textContent =
    "Buat username dan password admin untuk browser ini. Setelah login, isi token admin live satu kali supaya dashboard bisa menulis ke inventory live."
  renderOrderNotifications()
}

const showLogin = () => {
  stopOrderNotificationPolling()
  resetOrderNotifications()
  accessCard.hidden = false
  setupView.hidden = true
  loginView.hidden = false
  dashboard.hidden = true
  logoutButton.hidden = true
  accessNote.textContent =
    "Masuk dulu dengan login lokal admin, lalu simpan token admin browser untuk mengaktifkan write access ke inventory live."
  renderOrderNotifications()
}

const showDashboard = async () => {
  accessCard.hidden = true
  dashboard.hidden = false
  logoutButton.hidden = false

  const hydratedFromCache = hydrateDashboardStateFromCache()

  if (hydratedFromCache) {
    setStatus("Menampilkan data tersimpan terakhir sambil sinkronisasi live...")
  } else {
    setStatus("Dashboard live sedang sinkronisasi ke Google Sheet...")
  }

  startOrderNotificationPolling()
  void loadLiveState({ forceCatalog: false, includeOrders: true })
    .then(() => {
      setStatus("Dashboard live berhasil diperbarui.")
      startOrderNotificationPolling()
    })
    .catch((error) => {
      console.error(error)
      setStatus(error.message || "Dashboard live gagal dimuat.")
    })
}

const refreshAuthView = async () => {
  const credentials = readAdminCredentials()

  if (!credentials) {
    showSetup()
    return
  }

  if (hasValidAdminSession()) {
    await showDashboard()
    return
  }

  showLogin()
}

const bindEvents = () => {
  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault()

    const username = setupUsernameInput.value.trim()
    const password = setupPasswordInput.value
    const confirmPassword = setupConfirmInput.value

    if (!username) {
      setStatus("Username admin wajib diisi.")
      return
    }

    if (password !== confirmPassword) {
      setStatus("Ulangi password dengan nilai yang sama.")
      return
    }

    try {
      const passwordHash = await hashText(password)
      saveAdminCredentials({ username, passwordHash })
      setAdminSession(username)
      setupForm.reset()
      await refreshAuthView()
      setStatus("Login admin lokal berhasil dibuat dan dashboard live siap dipakai.", {
        toast: true
      })
    } catch (error) {
      console.error(error)
      setStatus("Setup login admin gagal. Coba lagi.", {
        toast: true,
        tone: "error"
      })
    }
  })

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault()

    const username = loginUsernameInput.value.trim()
    const password = loginPasswordInput.value
    const credentials = readAdminCredentials()

    if (!credentials) {
      await refreshAuthView()
      return
    }

    try {
      const passwordHash = await hashText(password)
      const isValid =
        username === credentials.username && passwordHash === credentials.passwordHash

      if (!isValid) {
        setStatus("Username atau password admin belum cocok.")
        return
      }

      setAdminSession(username)
      loginForm.reset()
      await refreshAuthView()
      setStatus("Berhasil masuk ke dashboard admin live.", {
        toast: true
      })
    } catch (error) {
      console.error(error)
      setStatus("Login admin gagal diproses.", {
        toast: true,
        tone: "error"
      })
    }
  })

  logoutButton.addEventListener("click", async () => {
    stopOrderNotificationPolling()
    resetOrderNotifications()
    clearAdminApiSession()
    clearAdminSession()
    await refreshAuthView()
    setStatus("Kamu sudah keluar dari dashboard admin live.", {
      toast: true
    })
  })

  connectorForm.addEventListener("submit", (event) => {
    event.preventDefault()

    const token = adminApiTokenInput.value.trim()

    if (!token) {
      setStatus("Isi admin API token dulu.")
      return
    }

    saveAdminApiToken(token)
    adminApiTokenInput.value = ""
    refreshConnectorState()
    renderSummary()
    resetOrderNotifications()
    loadOrdersState()
      .then(() => {
        return loadMarketplaceHistory()
      })
      .then(() => {
        renderDashboard()
        startOrderNotificationPolling()
        setStatus("Token admin berhasil disimpan di browser ini.", {
          toast: true
        })
      })
      .catch((error) => {
        console.error(error)
        setStatus(error.message || "Token tersimpan, tapi data admin live belum bisa dimuat.", {
          toast: true,
          tone: "error"
        })
      })
  })

  clearTokenButton.addEventListener("click", () => {
    clearAdminApiToken()
    adminApiTokenInput.value = ""
    refreshConnectorState()
    resetOrdersState()
    state.marketplaceHistory = []
    state.marketplaceHistoryError = ""
    stopOrderNotificationPolling()
    resetOrderNotifications()
    renderDashboard()
    setStatus("Token admin browser berhasil dihapus.", {
      toast: true
    })
  })

  notificationButton?.addEventListener("click", (event) => {
    event.stopPropagation()
    state.notificationDropdownOpen = !state.notificationDropdownOpen

    if (state.notificationDropdownOpen) {
      markNotificationsAsRead()
    } else {
      renderOrderNotifications()
    }
  })

  notificationSoundToggle?.addEventListener("click", async (event) => {
    event.stopPropagation()
    state.notificationSoundEnabled = !state.notificationSoundEnabled
    writeOrderNotificationSoundPreference(state.notificationSoundEnabled)

    if (state.notificationSoundEnabled) {
      await ensureNotificationAudioContext()
    }

    renderOrderNotifications()
    setStatus(
      state.notificationSoundEnabled
        ? "Bunyi notifikasi order diaktifkan."
        : "Bunyi notifikasi order dimatikan.",
      {
        toast: true,
        tone: "info"
      }
    )
  })

  notificationList?.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-order-notification]")

    if (!trigger) {
      return
    }

    const orderId = trigger.dataset.orderNotification
    void focusOrderFromNotification(orderId)
  })

  document.addEventListener("click", (event) => {
    if (!state.notificationDropdownOpen) {
      return
    }

    if (event.target.closest("#admin-notification-wrap")) {
      return
    }

    state.notificationDropdownOpen = false
    renderOrderNotifications()
  })

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      return
    }

    if (!dashboard.hidden && hasValidAdminSession() && hasAdminApiToken()) {
      void pollOrderNotifications()
    }
  })

  window.addEventListener(
    "pointerdown",
    () => {
      void ensureNotificationAudioContext()
    },
    { passive: true }
  )

  newProductButton.addEventListener("click", () => {
    clearEditor()
    editorCard.scrollIntoView({ behavior: "smooth", block: "start" })
  })

  refreshLiveButton.addEventListener("click", async () => {
    try {
      await loadLiveState({ forceCatalog: true, includeOrders: true })
      setStatus("Data inventory live berhasil diperbarui.", {
        toast: true
      })
    } catch (error) {
      console.error(error)
      setStatus(error.message || "Gagal refresh data inventory live.", {
        toast: true,
        tone: "error"
      })
    }
  })

  marketplaceProductSearchInput?.addEventListener("input", (event) => {
    state.marketplaceSearch = event.target.value
    renderMarketplaceProductOptions()

    const product = getSelectedMarketplaceProduct()
    if (product) {
      syncMarketplacePriceFromProduct(product)
    }
    renderMarketplacePreview()
  })

  marketplaceProductSelect?.addEventListener("change", (event) => {
    state.marketplaceSelectedProductId = event.target.value || ""
    syncMarketplacePriceFromProduct(getSelectedMarketplaceProduct(), { force: true })
    renderMarketplacePreview()
  })

  marketplaceQtyInput?.addEventListener("input", () => {
    renderMarketplacePreview()
  })

  marketplaceChannelSelect?.addEventListener("change", () => {
    renderMarketplacePreview()
  })

  marketplacePriceInput?.addEventListener("blur", () => {
    marketplacePriceInput.value = marketplacePriceInput.value.trim()
      ? formatRupiahInput(marketplacePriceInput.value)
      : ""
  })

  marketplaceRefreshButton?.addEventListener("click", async () => {
    try {
      const isSuccess = await loadMarketplaceHistory()
      renderMarketplaceSection()

      if (!isSuccess) {
        throw new Error(state.marketplaceHistoryError || "Riwayat marketplace gagal dimuat ulang.")
      }

      setStatus("Riwayat marketplace terbaru berhasil dimuat ulang.", {
        toast: true
      })
    } catch (error) {
      console.error(error)
      setStatus(error.message || "Riwayat marketplace gagal dimuat ulang.", {
        toast: true,
        tone: "error"
      })
    }
  })

  marketplaceForm?.addEventListener("submit", async (event) => {
    event.preventDefault()

    try {
      await submitMarketplaceOrder()
    } catch (error) {
      console.error(error)
      updateMarketplaceInlineStatus(
        error.message || "Order marketplace gagal dicatat ke inventory live.",
        "error"
      )
      setStatus(
        getAdminActionErrorMessage(error) || "Order marketplace gagal dicatat ke inventory live.",
        {
          toast: true,
          tone: "error"
        }
      )
    }
  })

  cancelEditButton.addEventListener("click", () => {
    clearEditor()
  })

  managerSearchInput.addEventListener("input", (event) => {
    state.search = normalizeText(event.target.value)
    state.page = 1
    renderManagerTable()
  })

  ordersSearchInput.addEventListener("input", async (event) => {
    state.orderSearch = event.target.value.trim()
    state.orderPage = 1

    if (!hasAdminApiToken()) {
      renderOrdersTable()
      return
    }

    window.clearTimeout(ordersSearchTimer)
    ordersSearchTimer = window.setTimeout(async () => {
      try {
        await loadOrdersState()
      } catch (error) {
        console.error(error)
        setStatus(error.message || "Pencarian order gagal diproses.")
      }
    }, 240)
  })

  managerPrevButton.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1)
    renderManagerTable()
  })

  managerNextButton.addEventListener("click", () => {
    const totalPages = getTotalPages(getFilteredProducts().length)
    state.page = Math.min(totalPages, state.page + 1)
    renderManagerTable()
  })

  ordersPrevButton.addEventListener("click", async () => {
    state.orderPage = Math.max(1, state.orderPage - 1)

    try {
      await loadOrdersState()
    } catch (error) {
      console.error(error)
      setStatus(error.message || "Halaman order sebelumnya gagal dimuat.")
    }
  })

  ordersNextButton.addEventListener("click", async () => {
    const totalPages = getOrderMetaValue("total_pages", 1)
    state.orderPage = Math.min(totalPages, state.orderPage + 1)

    try {
      await loadOrdersState()
    } catch (error) {
      console.error(error)
      setStatus(error.message || "Halaman order berikutnya gagal dimuat.")
    }
  })

  const handleManagerAction = async (event) => {
    const trigger = event.target.closest("[data-action]")

    if (!trigger) {
      return
    }

    const productId = trigger.dataset.productId
    const action = trigger.dataset.action

    if (action === "edit") {
      const product = state.productLookup.get(productId)

      if (!product) {
        return
      }

      fillEditor(product)
      editorCard.scrollIntoView({ behavior: "smooth", block: "start" })
    }

    if (action === "deactivate") {
      try {
        await deactivateProduct(productId)
      } catch (error) {
        console.error(error)
        setStatus(getAdminActionErrorMessage(error) || "Produk gagal dinonaktifkan.", {
          toast: true,
          tone: "error"
        })
      }
    }

    if (action === "delete") {
      try {
        await deleteProductPermanently(productId)
      } catch (error) {
        console.error(error)
        setStatus(getAdminActionErrorMessage(error) || "Produk gagal dihapus permanen.", {
          toast: true,
          tone: "error"
        })
      }
    }
  }

  managerTableBody.addEventListener("click", handleManagerAction)
  managerMobileList.addEventListener("click", handleManagerAction)

  const handleOrderAction = async (event) => {
    const trigger = event.target.closest("[data-order-action]")

    if (!trigger) {
      return
    }

    const orderId = trigger.dataset.orderId
    const action = trigger.dataset.orderAction

    if (!orderId) {
      return
    }

    if (getPendingOrderActionLabel(orderId)) {
      return
    }

    try {
      let shouldRefreshCatalogInBackground = false
      let pendingLabel = "Memproses..."

      if (action === "toggle-payment") {
        pendingLabel = "Update payment..."
      } else if (action === "set-process") {
        pendingLabel = "Set process..."
      } else if (action === "set-done") {
        pendingLabel = "Set done..."
      } else if (action === "cancel") {
        pendingLabel = "Membatalkan order..."
      } else if (action === "delete-history") {
        pendingLabel = "Menghapus riwayat..."
      }

      setPendingOrderAction(orderId, pendingLabel)
      renderOrdersTable()

      if (action === "toggle-payment") {
        const order = state.orders.find((item) => item.order_id === orderId)
        const nextPaymentStatus =
          normalizeText(order?.payment_status) === "paid" ? "UNPAID" : "PAID"

        await updateAdminOrder({
          order_id: orderId,
          payment_status: nextPaymentStatus,
          actor: "ADMIN_WEB",
          note: `Payment status diubah ke ${nextPaymentStatus}`
        })
        patchOrderInCurrentState(orderId, {
          payment_status: nextPaymentStatus
        })
        setStatus(`Payment status ${orderId} diubah ke ${nextPaymentStatus}.`, {
          toast: true
        })
      }

      if (action === "set-process") {
        await updateAdminOrder({
          order_id: orderId,
          status_order: "PROCESS",
          actor: "ADMIN_WEB",
          note: "Order dipindahkan ke PROCESS dari admin panel."
        })
        patchOrderInCurrentState(orderId, {
          status_order: "PROCESS"
        })
        setStatus(`Status ${orderId} diubah ke PROCESS.`, {
          toast: true
        })
      }

      if (action === "set-done") {
        await updateAdminOrder({
          order_id: orderId,
          status_order: "DONE",
          payment_status: "PAID",
          actor: "ADMIN_WEB",
          note: "Order ditutup dari admin panel."
        })
        patchOrderInCurrentState(orderId, {
          status_order: "DONE",
          payment_status: "PAID"
        })
        setStatus(`Status ${orderId} diubah ke DONE dan PAID.`, {
          toast: true
        })
      }

      if (action === "cancel") {
        const confirmed = window.confirm(
          `Batalkan order ${orderId} dan kembalikan stok ke inventory live?`
        )

        if (!confirmed) {
          return
        }

        const cancelResult = await cancelAdminOrder({
          orderId,
          actor: "ADMIN_WEB",
          note: "Order dibatalkan dari admin panel."
        })
        restoreOrderItemsToLocalCatalog(orderId)
        patchOrderInCurrentState(orderId, {
          status_order: "CANCEL"
        })
        shouldRefreshCatalogInBackground = true
        setStatus(
          cancelResult?.reconciled
            ? `Order ${orderId} berhasil dipastikan CANCEL setelah koneksi sempat lambat.`
            : `Order ${orderId} berhasil dibatalkan dan stok dikembalikan.`,
          {
          toast: true
          }
        )
      }

      if (action === "delete-history") {
        const confirmed = window.confirm(
          `Hapus riwayat order ${orderId} dari sheet?\n\nGunakan hanya untuk data test atau order yang memang sudah berstatus CANCEL. Stok tidak akan berubah lagi.`
        )

        if (!confirmed) {
          return
        }

        const deleteResult = await deleteAdminOrder({
          orderId,
          actor: "ADMIN_WEB"
        })
        removeOrderFromCurrentState(orderId)
        setStatus(
          deleteResult?.reconciled
            ? `Riwayat order ${orderId} berhasil dipastikan terhapus setelah koneksi sempat lambat.`
            : `Riwayat order ${orderId} berhasil dihapus dari sheet.`,
          {
          toast: true
          }
        )
      }

      renderDashboard()
      void loadOrdersState().catch(console.error)
      if (shouldRefreshCatalogInBackground) {
        void loadCatalogState({ force: true }).then(renderDashboard).catch(console.error)
      }
    } catch (error) {
      console.error(error)
      setStatus(getAdminActionErrorMessage(error) || "Aksi order gagal diproses.", {
        toast: true,
        tone: "error"
      })
      if (error?.code === "ADMIN_ACTION_PENDING_CHECK") {
        await loadOrdersState({ force: true })
        void loadCatalogState({ force: true }).then(renderDashboard).catch(console.error)
      }
    } finally {
      setPendingOrderAction(orderId, "")
      renderOrdersTable()
    }
  }

  ordersTableBody.addEventListener("click", handleOrderAction)
  ordersMobileList.addEventListener("click", handleOrderAction)

  productPriceInput.addEventListener("input", () => {
    syncDisplayFromNumeric()
  })

  productPriceDisplayInput.addEventListener("input", () => {
    syncNumericFromDisplay()
  })

  productImageUrlInput.addEventListener("input", (event) => {
    setPreview(event.target.value.trim())
  })

  productImageUpload.addEventListener("change", async (event) => {
    const [file] = event.target.files || []

    if (!file) {
      return
    }

    try {
      const result = await fileToDataUrl(file)
      productImageUrlInput.value = result
      setPreview(result)
      setStatus(`Foto ${file.name} berhasil dimuat ke editor produk.`, {
        toast: true
      })
    } catch (error) {
      console.error(error)
      setStatus("Foto produk gagal dimuat.", {
        toast: true,
        tone: "error"
      })
    }
  })

  productForm.addEventListener("submit", async (event) => {
    event.preventDefault()

    try {
      await saveProduct()
    } catch (error) {
      console.error(error)
      setStatus(getAdminActionErrorMessage(error) || "Produk gagal disimpan ke inventory live.", {
        toast: true,
        tone: "error"
      })
    }
  })

  exportButton.addEventListener("click", () => {
    exportCatalog()
  })

  credentialsForm.addEventListener("submit", async (event) => {
    event.preventDefault()

    const username = credentialsUsernameInput.value.trim()
    const password = credentialsPasswordInput.value
    const confirmPassword = credentialsConfirmInput.value

    if (!username) {
      setStatus("Username baru wajib diisi.")
      return
    }

    if (password !== confirmPassword) {
      setStatus("Password baru dan ulangi password harus sama.")
      return
    }

    try {
      const passwordHash = await hashText(password)
      saveAdminCredentials({ username, passwordHash })
      setAdminSession(username)
      credentialsPasswordInput.value = ""
      credentialsConfirmInput.value = ""
      await refreshAuthView()
      setStatus("Login admin lokal berhasil diperbarui.", {
        toast: true
      })
    } catch (error) {
      console.error(error)
      setStatus("Login admin gagal diperbarui.", {
        toast: true,
        tone: "error"
      })
    }
  })
}

const init = async () => {
  populateCategoryOptions()
  clearEditor()
  initReveal()
  bindEvents()
  refreshConnectorState()

  try {
    await refreshAuthView()
  } catch (error) {
    console.error(error)
    accessNote.textContent =
      "Dashboard live belum bisa dimuat. Jalankan server lokal dulu lalu refresh halaman admin."
    setStatus(error.message || "Dashboard admin live gagal dimuat.")
  }
}

init()

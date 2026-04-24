import {
  escapeHtml,
  formatCartCount,
  formatCartLinePrice,
  formatDateId,
  formatItemCount,
  formatProductPrice,
  formatRupiah,
  getFeaturedProducts,
  getInventorySummary,
  getProductImageSrc,
  getSearchScore,
  loadCatalog,
  makeProductLookup,
  syncCartWithInventory
} from "./catalog-store.js"
import {
  buildOrderFollowupLink,
  createWebsiteOrder,
  fetchLiveCatalog,
  readCachedLiveCatalog
} from "./live-api-client.js"

const pageSize = 18

const header = document.querySelector(".site-header")
const navToggle = document.querySelector(".nav-toggle")
const revealBlocks = document.querySelectorAll(".reveal")
const yearSlot = document.querySelector("#year")

const heroSearchForm = document.querySelector("#hero-search-form")
const heroSearchInput = document.querySelector("#hero-search-input")
const heroFeaturedGrid = document.querySelector("#hero-featured-grid")
const heroLastUpdated = document.querySelector("#hero-last-updated")
const heroSourceLabel = document.querySelector("#hero-source-label")

const catalogSection = document.querySelector("#katalog")
const catalogSearchInput = document.querySelector("#catalog-search")
const applySearchButton = document.querySelector("#apply-search")
const resetSearchButton = document.querySelector("#reset-search")
const productCount = document.querySelector("#product-count")
const visibleCount = document.querySelector("#visible-count")
const resultSummary = document.querySelector("#result-summary")
const activeFilterText = document.querySelector("#active-filter-text")
const statusLiveRegion = document.querySelector("#catalog-status")
const productGrid = document.querySelector("#product-grid")
const emptyState = document.querySelector("#empty-state")
const loadMoreButton = document.querySelector("#load-more-button")

const cartLink = document.querySelector("#cart-link")
const headerCartCount = document.querySelector("#header-cart-count")
const cartList = document.querySelector("#cart-list")
const cartItemTotal = document.querySelector("#cart-item-total")
const cartTotal = document.querySelector("#cart-total")
const cartSummaryNote = document.querySelector("#cart-summary-note")
const checkoutButton = document.querySelector("#checkout-button")
const clearCartButton = document.querySelector("#clear-cart")
const checkoutForm = document.querySelector("#checkout-form")
const checkoutNameInput = document.querySelector("#checkout-name")
const checkoutWhatsappInput = document.querySelector("#checkout-whatsapp")
const checkoutAddressInput = document.querySelector("#checkout-address")
const checkoutFeedback = document.querySelector("#checkout-feedback")
const whatsappFollowupLink = document.querySelector("#whatsapp-followup-link")
const orderSuccessModal = document.querySelector("#order-success-modal")
const orderSuccessCopy = document.querySelector("#order-success-copy")
const orderSuccessId = document.querySelector("#order-success-id")
const orderSuccessItems = document.querySelector("#order-success-items")
const orderSuccessTotal = document.querySelector("#order-success-total")
const orderSuccessWhatsappButton = document.querySelector("#order-success-whatsapp-button")
const orderSuccessCloseButton = document.querySelector("#order-success-close-button")
const orderModalCloseTargets = document.querySelectorAll("[data-order-modal-close]")

const quickSearchButtons = document.querySelectorAll(".quick-search")
const CHECKOUT_NOTE =
  "Harga produk belum termasuk ongkir. Ongkir final akan dikonfirmasi admin setelah alamat tujuan dicek."
const ADD_TO_CART_LOCK_MS = 900
const CART_FLY_DURATION_MS = 640
const CART_HIGHLIGHT_DURATION_MS = 860
const ORDER_MODAL_CLOSE_MS = 180
const ORDER_PENDING_RETRY_HOLD_MS = 12000
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

const state = {
  products: [],
  productLookup: new Map(),
  search: "",
  visibleItems: pageSize,
  updatedAt: "",
  dataSource: "sheet",
  lastOrder: null,
  pendingCartProductIds: new Set(),
  isSubmittingOrder: false,
  isRedirectingFollowup: false,
  orderModalCloseTimer: 0,
  orderRetryHoldUntil: 0,
  orderRetryHoldTimer: 0
}

const cart = new Map()

const resetLastOrderState = () => {
  state.lastOrder = null
  whatsappFollowupLink.hidden = true
  setCheckoutFeedback("", "")
}

const isOrderRetryHoldActive = () => Date.now() < state.orderRetryHoldUntil

const scheduleOrderRetryHoldRender = () => {
  window.clearTimeout(state.orderRetryHoldTimer)

  if (!isOrderRetryHoldActive()) {
    state.orderRetryHoldUntil = 0
    renderCart()
    return
  }

  state.orderRetryHoldTimer = window.setTimeout(() => {
    state.orderRetryHoldUntil = 0
    renderCart()
    statusLiveRegion.textContent =
      "Pengecekan order sebelumnya selesai. Kamu bisa lanjut checkout lagi jika diperlukan."
  }, Math.max(0, state.orderRetryHoldUntil - Date.now()))
}

const applyOrderRetryHold = (message, holdMs = ORDER_PENDING_RETRY_HOLD_MS) => {
  state.orderRetryHoldUntil = Date.now() + holdMs
  setCheckoutFeedback(message, "")
  statusLiveRegion.textContent = message
  scheduleOrderRetryHoldRender()
}

const lockProductAdd = (productId) => {
  if (state.pendingCartProductIds.has(productId)) {
    return false
  }

  state.pendingCartProductIds.add(productId)
  window.setTimeout(() => {
    state.pendingCartProductIds.delete(productId)
  }, ADD_TO_CART_LOCK_MS)

  return true
}

const triggerCartAttention = () => {
  cartLink.classList.remove("is-cart-highlight")
  headerCartCount.classList.remove("is-cart-bump")

  void cartLink.offsetWidth

  cartLink.classList.add("is-cart-highlight")
  headerCartCount.classList.add("is-cart-bump")

  window.setTimeout(() => {
    cartLink.classList.remove("is-cart-highlight")
    headerCartCount.classList.remove("is-cart-bump")
  }, CART_HIGHLIGHT_DURATION_MS)
}

const playAddToCartFeedback = (button) => {
  if (!button) {
    triggerCartAttention()
    return
  }

  button.disabled = true
  button.classList.remove("is-added")
  button.classList.add("is-adding")
  button.dataset.feedback = "Memasukkan..."

  const finishFeedback = () => {
    if (!button.isConnected) {
      return
    }

    button.classList.remove("is-adding")
    button.classList.add("is-added")
    button.dataset.feedback = "Masuk ke keranjang \u2713"
    triggerCartAttention()

    window.setTimeout(() => {
      if (!button.isConnected) {
        return
      }

      button.classList.remove("is-added")
      button.removeAttribute("data-feedback")

      if (!button.classList.contains("is-disabled")) {
        button.disabled = false
      }
    }, 720)
  }

  if (prefersReducedMotion.matches) {
    window.setTimeout(finishFeedback, 80)
    return
  }

  const sourceVisual = button.querySelector("img")
  const sourceRect = (sourceVisual || button).getBoundingClientRect()
  const cartRect = cartLink.getBoundingClientRect()
  const startCenterX = sourceRect.left + sourceRect.width / 2
  const startCenterY = sourceRect.top + sourceRect.height / 2
  const endCenterX = cartRect.left + cartRect.width / 2
  const endCenterY = cartRect.top + cartRect.height / 2
  const ghostSize = Math.max(38, Math.min(sourceRect.width, sourceRect.height, 74))
  const ghost = document.createElement("div")

  ghost.className = "cart-fly-item"
  ghost.style.setProperty("--cart-fly-size", `${ghostSize}px`)
  ghost.style.setProperty("--cart-fly-start-left", `${startCenterX - ghostSize / 2}px`)
  ghost.style.setProperty("--cart-fly-start-top", `${startCenterY - ghostSize / 2}px`)
  ghost.style.setProperty("--cart-fly-x", `${endCenterX - startCenterX}px`)
  ghost.style.setProperty("--cart-fly-y", `${endCenterY - startCenterY}px`)

  if (sourceVisual?.currentSrc || sourceVisual?.src) {
    const ghostImage = document.createElement("img")
    ghostImage.src = sourceVisual.currentSrc || sourceVisual.src
    ghostImage.alt = ""
    ghost.appendChild(ghostImage)
  } else {
    ghost.textContent = "+"
  }

  document.body.appendChild(ghost)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ghost.classList.add("is-moving")
    })
  })

  window.setTimeout(() => {
    ghost.remove()
    finishFeedback()
  }, CART_FLY_DURATION_MS)
}

const setCheckoutSubmitting = (isSubmitting) => {
  state.isSubmittingOrder = isSubmitting
  document.body.classList.toggle("is-checkout-submitting", isSubmitting)
  const holdActive = isOrderRetryHoldActive()

  ;[
    checkoutNameInput,
    checkoutWhatsappInput,
    checkoutAddressInput,
    clearCartButton
  ].forEach((field) => {
    field.disabled = isSubmitting || holdActive
  })

  checkoutButton.disabled = isSubmitting || holdActive || getCartEntries().length === 0
  checkoutButton.classList.toggle("is-disabled", checkoutButton.disabled)
  checkoutButton.classList.toggle("is-loading", isSubmitting)
  checkoutButton.setAttribute("aria-busy", isSubmitting ? "true" : "false")
  checkoutButton.textContent = isSubmitting
    ? "Mengirim Order..."
    : holdActive
      ? "Cek order sebelumnya..."
      : "Kirim Order Sekarang"
}

const syncFollowupUiState = (isPending = false) => {
  const buttonLabel = isPending ? "Membuka WhatsApp..." : "Lanjut ke WhatsApp"
  const anchorLabel = isPending ? "Membuka WhatsApp..." : "Lanjut Konfirmasi ke WhatsApp"

  orderSuccessWhatsappButton.disabled = isPending
  orderSuccessWhatsappButton.textContent = buttonLabel
  whatsappFollowupLink.classList.toggle("is-disabled", isPending)
  whatsappFollowupLink.setAttribute("aria-disabled", isPending ? "true" : "false")
  whatsappFollowupLink.textContent = anchorLabel
}

const closeOrderSuccessModal = ({ restoreFocus = false } = {}) => {
  if (!orderSuccessModal || orderSuccessModal.hidden) {
    return
  }

  window.clearTimeout(state.orderModalCloseTimer)
  orderSuccessModal.classList.remove("is-visible")

  state.orderModalCloseTimer = window.setTimeout(() => {
    orderSuccessModal.hidden = true
    document.body.classList.remove("is-modal-open")

    if (restoreFocus) {
      whatsappFollowupLink.focus()
    }
  }, ORDER_MODAL_CLOSE_MS)
}

const openOrderSuccessModal = (orderSummary) => {
  if (!orderSuccessModal || !orderSummary) {
    return
  }

  orderSuccessId.innerHTML = escapeHtml(orderSummary.id || "-").replace(/-/g, "-<wbr>")
  orderSuccessItems.textContent = formatCartCount(orderSummary.totalItems || 0)
  orderSuccessTotal.textContent = formatRupiah(orderSummary.grandTotal || 0)
  orderSuccessCopy.textContent = orderSummary.reconciled
    ? "Koneksi sempat lambat, tapi pesanan berhasil ditemukan dan sudah tercatat di sistem Toko Vespa Jogja."
    : "Pesanan kamu sudah tercatat di sistem Toko Vespa Jogja. Lanjutkan ke WhatsApp supaya admin bisa cepat bantu closing."

  syncFollowupUiState(false)
  window.clearTimeout(state.orderModalCloseTimer)
  orderSuccessModal.hidden = false
  document.body.classList.add("is-modal-open")

  requestAnimationFrame(() => {
    orderSuccessModal.classList.add("is-visible")
  })
}

const openLastOrderWhatsApp = () => {
  if (!state.lastOrder?.followupLink || state.isRedirectingFollowup) {
    return
  }

  state.isRedirectingFollowup = true
  syncFollowupUiState(true)

  statusLiveRegion.textContent = `WhatsApp dibuka untuk order ${state.lastOrder.id}.`
  closeOrderSuccessModal()

  window.setTimeout(() => {
    window.location.assign(state.lastOrder.followupLink)
  }, 120)
}

const applyCatalogSnapshot = (catalog) => {
  if (!catalog || !Array.isArray(catalog.products)) {
    return false
  }

  state.products = catalog.products
  state.productLookup = makeProductLookup(catalog.products)
  state.updatedAt = catalog.updatedAt || state.updatedAt
  state.dataSource = catalog.dataSource || "sheet"
  syncCartWithInventory(cart, state.productLookup)
  renderHero()
  renderProducts()
  renderCart()
  return true
}

const createHeroProductCard = (product) => {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "hero-product-card"
  button.dataset.productId = product.id
  button.setAttribute("aria-label", `Masukkan ${product.name} ke keranjang`)
  button.innerHTML = `
    <div class="hero-product-thumb">
      <img
        src="${getProductImageSrc(product)}"
        alt="${escapeHtml(product.name)}"
        loading="lazy"
        decoding="async"
      />
    </div>
    <div class="hero-product-copy">
      <span>${escapeHtml(product.categoryLabel)}</span>
      <strong>${escapeHtml(product.name)}</strong>
      <div class="hero-product-price-row">
        <b>${escapeHtml(formatProductPrice(product))}</b>
        <small>stok ${escapeHtml(String(product.stock))}</small>
      </div>
    </div>
  `
  return button
}

const createProductCard = (product) => {
  const article = document.createElement("article")
  const outOfStockTag =
    product.availability === "out"
      ? ' <span class="product-title-tag">(stock habis)</span>'
      : ""
  article.className = `product-card ${product.availability === "out" ? "is-out" : ""}`
  article.innerHTML = `
    <button
      class="product-card-button ${product.availability === "out" ? "is-disabled" : ""}"
      type="button"
      data-product-id="${escapeHtml(product.id)}"
      aria-label="${escapeHtml(
        product.availability === "out"
          ? `${product.name} stock habis`
          : `Masukkan ${product.name} ke keranjang`
      )}"
      ${product.availability === "out" ? "disabled" : ""}
    >
      <div class="product-image-wrap">
        <img
          class="product-image"
          src="${getProductImageSrc(product)}"
          alt="${escapeHtml(product.name)}"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div class="product-badges">
        <span class="product-status ${product.availability}">
          ${escapeHtml(product.availabilityLabel)}
        </span>
        <span class="product-stock">stok ${escapeHtml(String(product.stock))}</span>
      </div>
      <div class="product-info">
        <h3 class="product-title">${escapeHtml(product.name)}${outOfStockTag}</h3>
        <div class="price-stack">
          <strong>${escapeHtml(formatProductPrice(product))}</strong>
        </div>
      </div>
    </button>
  `
  return article
}

const calculateCartTotals = (entries) => {
  const totalItems = entries.reduce((total, entry) => total + entry.quantity, 0)
  const subtotal = entries.reduce(
    (total, entry) => total + entry.product.price * entry.quantity,
    0
  )

  return {
    totalItems,
    subtotal
  }
}

const refreshCheckoutTotals = (entries) => {
  const { totalItems, subtotal } = calculateCartTotals(entries)

  cartItemTotal.textContent = formatCartCount(totalItems)
  cartTotal.textContent = formatRupiah(subtotal)

  if (state.isSubmittingOrder) {
    cartSummaryNote.textContent =
      "Order sedang diproses. Tunggu konfirmasi sistem supaya tidak terkirim dua kali."
  } else if (!entries.length) {
    cartSummaryNote.textContent = "Keranjang masih kosong. Harga produk belum termasuk ongkir."
  } else {
    cartSummaryNote.textContent = entries.some(({ product }) => product.price <= 0)
      ? "Ada item yang masih perlu konfirmasi harga admin. Harga produk belum termasuk ongkir."
      : CHECKOUT_NOTE
  }

  return {
    totalItems,
    subtotal,
    shippingAmount: 0,
    shippingLabel: "Ongkir belum dihitung di website",
    shippingNote: CHECKOUT_NOTE,
    grandTotal: subtotal
  }
}

const setHeroLoading = (message) => {
  heroFeaturedGrid.innerHTML = `<div class="loading-note">${escapeHtml(message)}</div>`
}

const setCatalogLoading = (message) => {
  productGrid.innerHTML = `<div class="loading-note">${escapeHtml(message)}</div>`
  emptyState.hidden = true
  loadMoreButton.hidden = true
  productCount.textContent = "Memuat katalog..."
  resultSummary.textContent = message
  activeFilterText.textContent = ""
  visibleCount.textContent = ""
}

const getFilteredProducts = () => {
  const query = state.search.toLowerCase()

  return [...state.products]
    .filter((product) => !query || product.searchIndex.includes(query))
    .sort((left, right) => {
      const scoreDiff = getSearchScore(right, state.search) - getSearchScore(left, state.search)

      if (scoreDiff !== 0) {
        return scoreDiff
      }

      if (left.availability !== right.availability) {
        return left.availability === "ready" ? -1 : 1
      }

      if (right.stock !== left.stock) {
        return right.stock - left.stock
      }

      return left.name.localeCompare(right.name, "id")
    })
}

const updateSummary = (filteredProducts) => {
  const totalFiltered = filteredProducts.length
  const renderedCount = Math.min(totalFiltered, state.visibleItems)
  const inventory = getInventorySummary(state.products)

  if (!state.search) {
    productCount.textContent = `${formatItemCount(state.products.length)} produk aktif`
    resultSummary.textContent = "Menampilkan seluruh katalog aktif Toko Vespa Jogja."
    activeFilterText.textContent =
      state.dataSource === "local"
        ? "Inventori website ini sedang memakai perubahan terakhir yang disimpan dari halaman admin."
        : `Ready stock ${formatItemCount(inventory.readyProducts)} item, stock habis ${formatItemCount(inventory.outProducts)} item.`
  } else if (totalFiltered === 0) {
    productCount.textContent = "0 hasil pencarian"
    resultSummary.textContent = "Belum ada produk yang cocok dengan pencarian."
    activeFilterText.textContent = `Kata kunci aktif: "${state.search}".`
  } else {
    productCount.textContent = `${formatItemCount(totalFiltered)} hasil pencarian`
    resultSummary.textContent = `${formatItemCount(totalFiltered)} produk cocok dengan kata kunci.`
    activeFilterText.textContent = `Kata kunci aktif: "${state.search}".`
  }

  visibleCount.textContent =
    totalFiltered === 0
      ? "0 item"
      : `Menampilkan ${formatItemCount(renderedCount)} dari ${formatItemCount(totalFiltered)} item`

  statusLiveRegion.textContent =
    totalFiltered === 0
      ? "Tidak ada produk yang cocok."
      : `${totalFiltered} produk cocok, ${renderedCount} kartu sedang ditampilkan.`
}

const renderHero = () => {
  heroLastUpdated.textContent = formatDateId(state.updatedAt)
  heroSourceLabel.textContent =
    state.dataSource === "local" ? "Perubahan admin" : "Inventori terbaru"

  heroFeaturedGrid.innerHTML = ""

  const featuredProducts = getFeaturedProducts(state.products, 3)

  if (!featuredProducts.length) {
    setHeroLoading("Produk unggulan belum tersedia.")
    return
  }

  featuredProducts.forEach((product) => {
    heroFeaturedGrid.appendChild(createHeroProductCard(product))
  })
}

const renderProducts = () => {
  if (state.products.length === 0) {
    return
  }

  const filteredProducts = getFilteredProducts()
  const itemsToRender = filteredProducts.slice(0, state.visibleItems)
  const fragment = document.createDocumentFragment()

  productGrid.innerHTML = ""
  itemsToRender.forEach((product) => fragment.appendChild(createProductCard(product)))
  productGrid.appendChild(fragment)

  emptyState.hidden = filteredProducts.length !== 0
  loadMoreButton.hidden = filteredProducts.length <= itemsToRender.length
  updateSummary(filteredProducts)
}

const getCartEntries = () =>
  Array.from(cart.entries())
    .map(([productId, quantity]) => ({
      product: state.productLookup.get(productId),
      quantity
    }))
    .filter((entry) => entry.product)

const renderCart = () => {
  const entries = getCartEntries()
  const fragment = document.createDocumentFragment()
  const holdActive = isOrderRetryHoldActive()

  cartList.innerHTML = ""

  if (entries.length === 0) {
    cartList.innerHTML = `
      <div class="cart-empty">
        <strong>Keranjang masih kosong.</strong>
        <p>Tap produk yang statusnya ready untuk menambahkannya ke pesanan.</p>
      </div>
    `
    checkoutButton.classList.add("is-disabled")
    checkoutButton.setAttribute("aria-disabled", "true")
    checkoutButton.disabled = true
    cartSummaryNote.textContent =
      "Keranjang masih kosong. Tap produk ready untuk mulai isi pesanan."
    clearCartButton.hidden = true
  } else {
    entries.forEach(({ product, quantity }) => {
      const itemControlsDisabled = state.isSubmittingOrder || holdActive ? "disabled" : ""
      const item = document.createElement("article")
      item.className = "cart-item"
      item.innerHTML = `
        <div class="cart-item-thumb">
          <img
            src="${getProductImageSrc(product)}"
            alt="${escapeHtml(product.name)}"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div class="cart-item-body">
          <div class="cart-item-top">
            <div class="cart-item-main">
              <span class="cart-item-badge">${escapeHtml(product.availabilityLabel)}</span>
              <h3 class="cart-item-title">${escapeHtml(product.name)}</h3>
              <p class="cart-item-meta">${escapeHtml(product.sku)} | stok ${escapeHtml(
                String(product.stock)
              )}</p>
            </div>
            <div class="cart-item-pricebox">
              <small class="cart-item-unit-price">${escapeHtml(formatProductPrice(product))}</small>
              <strong class="cart-item-subtotal">${escapeHtml(
                formatCartLinePrice(product, quantity)
              )}</strong>
            </div>
          </div>
          <div class="cart-item-bottom">
            <div class="cart-qty" role="group" aria-label="Jumlah ${escapeHtml(product.name)}">
              <button type="button" data-cart-action="decrease" data-product-id="${escapeHtml(
                product.id
              )}" ${itemControlsDisabled}>
                -
              </button>
              <span>${quantity}</span>
              <button
                type="button"
                data-cart-action="increase"
                data-product-id="${escapeHtml(product.id)}"
                ${state.isSubmittingOrder || holdActive || quantity >= product.stock ? "disabled" : ""}
              >
                +
              </button>
            </div>
            <button class="cart-remove" type="button" data-cart-action="remove" data-product-id="${escapeHtml(
              product.id
            )}" ${itemControlsDisabled}>
              Hapus
            </button>
          </div>
        </div>
      `
      fragment.appendChild(item)
    })

    cartList.appendChild(fragment)
    const canCheckout = !state.isSubmittingOrder && !holdActive
    checkoutButton.classList.toggle("is-disabled", !canCheckout)
    checkoutButton.classList.toggle("is-loading", state.isSubmittingOrder)
    checkoutButton.setAttribute("aria-disabled", canCheckout ? "false" : "true")
    checkoutButton.disabled = !canCheckout
    checkoutButton.textContent = state.isSubmittingOrder
      ? "Mengirim Order..."
      : holdActive
        ? "Cek order sebelumnya..."
      : "Kirim Order Sekarang"
    cartSummaryNote.textContent = state.isSubmittingOrder
      ? "Order sedang diproses. Tunggu konfirmasi sistem supaya tidak terkirim dua kali."
      : holdActive
        ? "Sistem sedang mengecek order terakhir yang sempat lambat. Jangan kirim ulang dulu."
      : entries.some(({ product }) => product.price <= 0)
        ? "Ada item yang masih perlu konfirmasi harga admin setelah order masuk."
        : "Isi data customer lalu kirim order agar langsung tercatat ke sistem toko."
    clearCartButton.hidden = false
  }

  clearCartButton.disabled = state.isSubmittingOrder || holdActive
  clearCartButton.classList.toggle("is-disabled", state.isSubmittingOrder || holdActive)
  const { totalItems } = refreshCheckoutTotals(entries)
  headerCartCount.textContent = totalItems.toLocaleString("id-ID")
  cartLink.setAttribute("aria-label", `Keranjang, ${formatCartCount(totalItems)}`)
}

const setCheckoutFeedback = (message, tone = "") => {
  checkoutFeedback.textContent = message
  checkoutFeedback.classList.remove("is-error", "is-success")

  if (tone) {
    checkoutFeedback.classList.add(tone)
  }
}

const buildOrderItemsFromCart = () =>
  getCartEntries().map(({ product, quantity }) => ({
    sku: product.sku,
    qty: quantity
  }))

const handleCheckoutSubmit = async (event) => {
  event.preventDefault()

  if (state.isSubmittingOrder || isOrderRetryHoldActive()) {
    return
  }

  const entries = getCartEntries()
  const customerName = checkoutNameInput.value.trim()
  const customerWhatsApp = checkoutWhatsappInput.value.trim()
  const customerAddress = checkoutAddressInput.value.trim()
  const totals = refreshCheckoutTotals(entries)

  if (!entries.length) {
    setCheckoutFeedback("Keranjang masih kosong. Tambahkan produk dulu.", "is-error")
    return
  }

  if (!customerName || !customerWhatsApp || !customerAddress) {
    setCheckoutFeedback("Isi nama, WhatsApp, dan alamat lengkap dulu ya.", "is-error")
    return
  }

  setCheckoutSubmitting(true)
  renderCart()
  whatsappFollowupLink.hidden = true
  setCheckoutFeedback("Order sedang dikirim ke sistem toko...", "")

  try {
    const orderResult = await createWebsiteOrder({
      customerName,
      customerWhatsApp,
      customerAddress,
      items: buildOrderItemsFromCart(),
      shippingAmount: totals.shippingAmount,
      shippingNote: `${totals.shippingLabel}. ${totals.shippingNote}`
    })

    const orderSummary = {
      id: orderResult.order_id,
      totalItems: Number(orderResult.qty_total || totals.totalItems || entries.length),
      grandTotal: Number(orderResult.grand_total || totals.grandTotal || 0),
      reconciled: Boolean(orderResult.reconciled),
      followupLink: buildOrderFollowupLink({
        entries,
        customerName,
        customerAddress,
        orderId: orderResult.order_id,
        shippingAmount: totals.shippingAmount,
        grandTotal: Number(orderResult.grand_total || totals.grandTotal || 0)
      })
    }

    state.lastOrder = {
      ...orderSummary,
      entries,
      customerName
    }

    whatsappFollowupLink.href = orderSummary.followupLink
    whatsappFollowupLink.hidden = false
    syncFollowupUiState(false)

    cart.clear()
    renderCart()
    setCheckoutFeedback(
      orderResult.reconciled
        ? `Order ${orderResult.order_id} berhasil ditemukan setelah koneksi sempat lambat. Lanjutkan ke WhatsApp untuk konfirmasi.`
        : `Order ${orderResult.order_id} berhasil masuk. Lanjutkan ke WhatsApp untuk konfirmasi yang lebih cepat.`,
      "is-success"
    )
    statusLiveRegion.textContent = `Order ${orderResult.order_id} berhasil dibuat.`
    openOrderSuccessModal(orderSummary)
  } catch (error) {
    if (error?.code === "ORDER_PENDING_CHECK") {
      applyOrderRetryHold(
        error.message ||
          "Sistem sedang mengecek order terakhir. Jangan klik kirim ulang dulu, tunggu beberapa detik."
      )
    } else {
      setCheckoutFeedback(error.message || "Order gagal dikirim.", "is-error")
      statusLiveRegion.textContent = error.message || "Order gagal dikirim."
    }
  } finally {
    setCheckoutSubmitting(false)
    renderCart()
  }
}

const addToCart = (productId, sourceButton) => {
  if (state.isSubmittingOrder || isOrderRetryHoldActive()) {
    setCheckoutFeedback(
      state.isSubmittingOrder
        ? "Order sedang diproses. Tunggu sebentar sampai sistem selesai memberi konfirmasi."
        : "Sistem sedang mengecek order terakhir. Tunggu sebentar sebelum menambah produk lagi.",
      ""
    )
    statusLiveRegion.textContent = state.isSubmittingOrder
      ? "Order sedang diproses. Tambah produk ditahan sementara."
      : "Pengecekan order terakhir masih berjalan. Tambah produk ditahan sementara."
    return
  }

  const product = state.productLookup.get(productId)

  if (!product || product.availability === "out") {
    return
  }

  const currentQty = cart.get(productId) || 0

  if (currentQty >= product.stock) {
    statusLiveRegion.textContent = `Stok maksimum untuk ${product.name} sudah tercapai.`
    return
  }

  if (!lockProductAdd(productId)) {
    triggerCartAttention()
    statusLiveRegion.textContent = `${product.name} baru saja masuk ke keranjang.`
    return
  }

  cart.set(productId, currentQty + 1)
  resetLastOrderState()
  renderCart()
  playAddToCartFeedback(sourceButton)
  statusLiveRegion.textContent = `${product.name} ditambahkan ke keranjang.`
}

const updateCartQuantity = (productId, nextQuantity) => {
  const product = state.productLookup.get(productId)

  if (!product) {
    return
  }

  if (nextQuantity <= 0) {
    cart.delete(productId)
    resetLastOrderState()
    renderCart()
    statusLiveRegion.textContent = `${product.name} dihapus dari keranjang.`
    return
  }

  cart.set(productId, Math.min(nextQuantity, product.stock))
  resetLastOrderState()
  renderCart()
}

const syncCatalogSearch = (value) => {
  state.search = value.trim().toLowerCase()
  state.visibleItems = pageSize
  catalogSearchInput.value = value.trim()
  heroSearchInput.value = value.trim()
  renderProducts()
}

const resetSearch = () => {
  state.search = ""
  state.visibleItems = pageSize
  catalogSearchInput.value = ""
  heroSearchInput.value = ""
  renderProducts()
}

const jumpToCatalog = () => {
  catalogSection.scrollIntoView({ behavior: "smooth", block: "start" })
  window.setTimeout(() => catalogSearchInput.focus(), 220)
}

const bindProductTap = (container) => {
  if (!container) {
    return
  }

  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-product-id]")

    if (!button || button.disabled) {
      return
    }

    addToCart(button.dataset.productId, button)
  })
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

const bindEvents = () => {
  if (navToggle) {
    navToggle.addEventListener("click", () => {
      const isOpen = header.classList.toggle("is-open")
      navToggle.setAttribute("aria-expanded", String(isOpen))
    })
  }

  document.querySelectorAll(".site-nav a").forEach((link) => {
    link.addEventListener("click", () => {
      header.classList.remove("is-open")
      navToggle?.setAttribute("aria-expanded", "false")
    })
  })

  heroSearchForm.addEventListener("submit", (event) => {
    event.preventDefault()
    syncCatalogSearch(heroSearchInput.value)
    jumpToCatalog()
  })

  catalogSearchInput.addEventListener("input", (event) => {
    syncCatalogSearch(event.target.value)
  })

  applySearchButton.addEventListener("click", () => {
    syncCatalogSearch(catalogSearchInput.value)
  })

  resetSearchButton.addEventListener("click", () => {
    resetSearch()
  })

  quickSearchButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const query = button.dataset.query || ""
      syncCatalogSearch(query)
      jumpToCatalog()
    })
  })

  loadMoreButton.addEventListener("click", () => {
    state.visibleItems += pageSize
    renderProducts()
  })

  bindProductTap(heroFeaturedGrid)
  bindProductTap(productGrid)

  cartList.addEventListener("click", (event) => {
    if (state.isSubmittingOrder || isOrderRetryHoldActive()) {
      return
    }

    const trigger = event.target.closest("[data-cart-action]")

    if (!trigger) {
      return
    }

    const { cartAction, productId } = trigger.dataset
    const currentQty = cart.get(productId) || 0

    if (cartAction === "increase") {
      updateCartQuantity(productId, currentQty + 1)
    }

    if (cartAction === "decrease") {
      updateCartQuantity(productId, currentQty - 1)
    }

    if (cartAction === "remove") {
      updateCartQuantity(productId, 0)
    }
  })

  clearCartButton.addEventListener("click", () => {
    if (state.isSubmittingOrder || isOrderRetryHoldActive()) {
      return
    }

    cart.clear()
    resetLastOrderState()
    renderCart()
    statusLiveRegion.textContent = "Keranjang dikosongkan."
  })

  checkoutAddressInput.addEventListener("input", () => {
    refreshCheckoutTotals(getCartEntries())
  })

  checkoutForm.addEventListener("submit", handleCheckoutSubmit)

  whatsappFollowupLink.addEventListener("click", (event) => {
    if (state.isRedirectingFollowup) {
      event.preventDefault()
      return
    }

    state.isRedirectingFollowup = true
    syncFollowupUiState(true)

    window.setTimeout(() => {
      state.isRedirectingFollowup = false
      syncFollowupUiState(false)
    }, 1200)
  })

  orderSuccessWhatsappButton.addEventListener("click", () => {
    openLastOrderWhatsApp()
  })

  orderSuccessCloseButton.addEventListener("click", () => {
    closeOrderSuccessModal({ restoreFocus: true })
  })

  orderModalCloseTargets.forEach((target) => {
    target.addEventListener("click", () => {
      closeOrderSuccessModal({ restoreFocus: true })
    })
  })

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !orderSuccessModal.hidden) {
      closeOrderSuccessModal({ restoreFocus: true })
    }
  })
}

const init = async () => {
  yearSlot.textContent = new Date().getFullYear()
  clearCartButton.hidden = true
  renderCart()
  initReveal()
  bindEvents()

  setHeroLoading("Menyiapkan produk unggulan...")
  setCatalogLoading("Menyiapkan katalog aktif toko...")

  try {
    let hasRenderedInitialSnapshot = false
    const cachedLiveCatalog = readCachedLiveCatalog()

    if (cachedLiveCatalog?.products?.length) {
      hasRenderedInitialSnapshot = applyCatalogSnapshot(cachedLiveCatalog)
      statusLiveRegion.textContent =
        "Menampilkan inventori terakhir yang tersimpan sambil sinkronisasi ke Google Sheet."
    } else {
      const fallbackCatalog = await loadCatalog()
      hasRenderedInitialSnapshot = applyCatalogSnapshot(fallbackCatalog)
      statusLiveRegion.textContent =
        "Menampilkan katalog lokal sambil sinkronisasi inventori live."
    }

    void fetchLiveCatalog()
      .then((catalog) => {
        applyCatalogSnapshot(catalog)
        statusLiveRegion.textContent =
          "Inventori live berhasil diperbarui dari Google Sheet."
      })
      .catch(async (liveError) => {
        console.warn("Live catalog fallback:", liveError)

        if (!hasRenderedInitialSnapshot) {
          const fallbackCatalog = await loadCatalog()
          applyCatalogSnapshot(fallbackCatalog)
        }

        statusLiveRegion.textContent =
          "Sinkronisasi live sedang lambat. Website menampilkan data tersimpan terakhir dulu."
      })
  } catch (error) {
    console.error(error)
    productGrid.innerHTML = `
      <div class="loading-note">
        Katalog belum bisa dimuat. Pastikan website dibuka lewat server lalu refresh halaman.
      </div>
    `
    heroFeaturedGrid.innerHTML = `
      <div class="loading-note">
        Produk unggulan belum bisa dimuat.
      </div>
    `
  }
}

init()

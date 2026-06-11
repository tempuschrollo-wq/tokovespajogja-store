import {
  escapeHtml,
  formatItemCount,
  formatRupiah,
  getCategoryLabel,
  hasValidAdminSession,
  normalizeText
} from "./catalog-store.js"
import {
  fetchAdminMarketplaceHistory,
  fetchAdminOrdersList,
  fetchCurrentReports,
  fetchLiveCatalog,
  fetchReportHistory,
  hasAdminApiToken,
  readCachedAdminOrders,
  readCachedLiveCatalog,
  refreshBackendReporting
} from "./live-api-client.js"

const reportLock = document.querySelector("#report-lock")
const reportsDashboard = document.querySelector("#reports-dashboard")
const refreshReportsButton = document.querySelector("#refresh-reports-button")
const reportSyncLabel = document.querySelector("#report-sync-label")
const reportTokenNote = document.querySelector("#report-token-note")
const reportsStatus = document.querySelector("#reports-status")

const kpiTodayRevenue = document.querySelector("#kpi-today-revenue")
const kpiTodayOrders = document.querySelector("#kpi-today-orders")
const kpiWeekRevenue = document.querySelector("#kpi-week-revenue")
const kpiWeekProfit = document.querySelector("#kpi-week-profit")
const kpiMonthRevenue = document.querySelector("#kpi-month-revenue")
const kpiMonthProfit = document.querySelector("#kpi-month-profit")
const kpiLowStock = document.querySelector("#kpi-low-stock")
const kpiOutStock = document.querySelector("#kpi-out-stock")

const dailySummaryNote = document.querySelector("#daily-summary-note")
const dailyStockOutList = document.querySelector("#daily-stockout-list")
const recentSoldNote = document.querySelector("#recent-sold-note")
const recentSoldList = document.querySelector("#recent-sold-list")
const stockoutOpenButton = document.querySelector("#stockout-open-button")
const stockoutModal = document.querySelector("#stockout-modal")
const lowStockNote = document.querySelector("#low-stock-note")
const lowStockList = document.querySelector("#low-stock-list")
const lowStockSummaryOut = document.querySelector("#low-stock-summary-out")
const lowStockSummaryLow = document.querySelector("#low-stock-summary-low")
const lowStockSummaryTotal = document.querySelector("#low-stock-summary-total")
const lowStockOpenButton = document.querySelector("#low-stock-open-button")
const lowStockExportButton = document.querySelector("#low-stock-export-button")
const lowStockModal = document.querySelector("#low-stock-modal")
const lowStockSearchInput = document.querySelector("#low-stock-search-input")
const lowStockFilterButtons = document.querySelectorAll("[data-low-stock-filter]")
const lowStockModalExportButton = document.querySelector("#low-stock-modal-export-button")
const lowStockTableMeta = document.querySelector("#low-stock-table-meta")
const lowStockTableBody = document.querySelector("#low-stock-table-body")
const weeklyPeriod = document.querySelector("#weekly-period")
const weeklyMetrics = document.querySelector("#weekly-metrics")
const monthlyPeriod = document.querySelector("#monthly-period")
const monthlyMetrics = document.querySelector("#monthly-metrics")
const monthlyTopProducts = document.querySelector("#monthly-top-products")
const monthlyTopCategories = document.querySelector("#monthly-top-categories")
const salesRankingNote = document.querySelector("#sales-ranking-note")
const salesRankingBody = document.querySelector("#sales-ranking-body")
const monthlyArchiveNote = document.querySelector("#monthly-archive-note")
const monthlyArchiveBody = document.querySelector("#monthly-archive-body")

const state = {
  products: [],
  orders: [],
  currentReports: null,
  reportHistory: null,
  loadedAt: null,
  error: "",
  lowStockSearch: "",
  lowStockFilter: "all"
}

const LOW_STOCK_PREVIEW_LIMIT = 5

const setStatus = (message) => {
  reportsStatus.textContent = message
}

const startOfDay = (date) => {
  const nextDate = new Date(date)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

const endOfDay = (date) => {
  const nextDate = new Date(date)
  nextDate.setHours(23, 59, 59, 999)
  return nextDate
}

const startOfWeek = (date) => {
  const nextDate = startOfDay(date)
  const day = nextDate.getDay() || 7
  nextDate.setDate(nextDate.getDate() - day + 1)
  return nextDate
}

const endOfWeek = (date) => {
  const nextDate = startOfWeek(date)
  nextDate.setDate(nextDate.getDate() + 6)
  return endOfDay(nextDate)
}

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1)

const endOfMonth = (date) => endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0))

const formatShortDate = (date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short"
  }).format(date)

const formatLongDate = (date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date)

const formatWeekday = (date) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "short"
  }).format(date)

const formatDateRange = (start, end) => `${formatLongDate(start)} - ${formatLongDate(end)}`

const isBetween = (date, start, end) => date >= start && date <= end

const getOrderValue = (order, keys, fallback = "") => {
  for (const key of keys) {
    if (order?.[key] !== undefined && order?.[key] !== null && order?.[key] !== "") {
      return order[key]
    }
  }

  return fallback
}

const toNumber = (value) => {
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

const pickReportNumber = (source, keys) => {
  if (!source) {
    return 0
  }

  for (const key of keys) {
    const value = source[key]
    if (value !== undefined && value !== null && value !== "") {
      const numberValue = Number(value)
      if (Number.isFinite(numberValue)) {
        return numberValue
      }
    }
  }

  return 0
}

// Reports money formatter that preserves negative values (estimated profit can be
// negative). The shared formatRupiah clamps to 0 on purpose for product prices.
const formatRupiahSigned = (value) => {
  const amount = Math.round(Number(value) || 0)
  return amount < 0 ? `-${formatRupiah(-amount)}` : formatRupiah(amount)
}

// Normalizes backend current weekly/monthly report data into the shape that
// renderMetrics consumes, accepting both camelCase aliases and raw sheet metric
// names.
const buildBackendPeriodMetrics = (source) => ({
  ordersCount: pickReportNumber(source, ["ordersCount", "Orders_Count"]),
  unitsSold: pickReportNumber(source, ["unitsSold", "Units_Sold"]),
  revenue: pickReportNumber(source, ["revenue", "Revenue"]),
  cogs: pickReportNumber(source, ["estimatedCogs", "Estimated_COGS"]),
  profit: pickReportNumber(source, ["estimatedGrossProfit", "Estimated_Gross_Profit"]),
  missingCostItems: pickReportNumber(source, ["missingHppItems", "Missing_HPP_Items"]),
  marketplaceOfflineCount: pickReportNumber(source, [
    "marketplaceOfflineCount",
    "Marketplace_Offline_Count"
  ]),
  stockInQty: pickReportNumber(source, ["stockInQty", "Stock_In_Qty"]),
  stockOutQty: pickReportNumber(source, ["stockOutQty", "Stock_Out_Qty"]),
  cancelCount: pickReportNumber(source, ["cancelCount", "Cancel_Count"]),
  topSku: String((source && (source.topSku ?? source.Top_SKU)) || "").trim()
})

const parseOrderItems = (order) => {
  let rawItems = getOrderValue(order, ["items", "Items", "item_json", "Item_JSON"], [])

  if (typeof rawItems === "string") {
    try {
      rawItems = JSON.parse(rawItems)
    } catch {
      rawItems = []
    }
  }

  if (!Array.isArray(rawItems)) {
    return []
  }

  return rawItems.map((item) => {
    const qty = toNumber(getOrderValue(item, ["qty", "Qty", "quantity", "Qty_Total"], 0))
    const price = toNumber(
      getOrderValue(item, ["harga_jual", "Harga_Jual", "price", "Harga_Jual_Satuan"], 0)
    )
    const subtotal =
      toNumber(getOrderValue(item, ["subtotal", "Subtotal", "line_total", "Line_Total"], 0)) ||
      qty * price

    return {
      ...item,
      sku: String(getOrderValue(item, ["sku", "SKU"], "")).trim(),
      nama_produk: String(getOrderValue(item, ["nama_produk", "Nama_Produk", "name"], "")).trim(),
      qty,
      harga_jual: price,
      subtotal
    }
  })
}

const parseOrderDate = (order) => {
  const rawDate = getOrderValue(order, ["created_at", "Created_At", "order_date", "Order_Date"], "")
  const rawValue = String(rawDate || "").trim()

  if (!rawValue) {
    return null
  }

  const match = rawValue.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  )

  if (match) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = match
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  }

  const parsedDate = new Date(rawValue)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

const normalizeOrder = (order) => {
  const items = parseOrderItems(order)
  const itemSubtotal = items.reduce((total, item) => total + toNumber(item.subtotal), 0)
  const qtyTotal =
    toNumber(getOrderValue(order, ["qty_total", "Qty_Total"], 0)) ||
    items.reduce((total, item) => total + toNumber(item.qty), 0)
  const subtotal = toNumber(getOrderValue(order, ["subtotal", "Subtotal"], 0))
  const grandTotal = toNumber(getOrderValue(order, ["grand_total", "Grand_Total"], 0))

  return {
    ...order,
    items,
    orderDate: parseOrderDate(order),
    statusOrder: String(getOrderValue(order, ["status_order", "Status_Order"], "")).trim().toUpperCase(),
    paymentStatus: String(getOrderValue(order, ["payment_status", "Payment_Status"], "")).trim().toUpperCase(),
    qtyTotal,
    productRevenue: grandTotal || subtotal || itemSubtotal,
    grandTotal: grandTotal || subtotal || itemSubtotal
  }
}

const normalizeMarketplaceSaleAsOrder = (sale) => {
  const qty = toNumber(getOrderValue(sale, ["qty_keluar", "Qty_Keluar"], 0))
  const unitPrice = toNumber(getOrderValue(sale, ["harga_jual_satuan", "Harga_Jual_Satuan"], 0))
  const totalPenjualan =
    toNumber(getOrderValue(sale, ["total_penjualan", "Total_Penjualan"], 0)) || qty * unitPrice
  const sku = String(getOrderValue(sale, ["sku", "SKU"], "")).trim()
  const namaProduk = String(getOrderValue(sale, ["nama_produk", "Nama_Produk"], sku)).trim()
  const channelLabel = String(getOrderValue(sale, ["channel_label", "channel"], "Marketplace")).trim()

  return normalizeOrder({
    order_id: getOrderValue(sale, ["referensi_id", "out_id"], ""),
    order_date: getOrderValue(sale, ["waktu", "tanggal", "Tanggal"], ""),
    customer_nama: channelLabel,
    items: [
      {
        sku,
        nama_produk: namaProduk,
        qty,
        harga_jual: unitPrice,
        subtotal: totalPenjualan
      }
    ],
    sku_list: sku,
    qty_total: qty,
    subtotal: totalPenjualan,
    grand_total: totalPenjualan,
    status_order: "DONE",
    payment_status: "PAID",
    source: getOrderValue(sale, ["channel", "sourceType"], "MARKETPLACE")
  })
}

const isActiveOrder = (order) => {
  const status = normalizeText(order.statusOrder)
  return !["cancel", "cancelled", "canceled", "dibatalkan", "deleted"].includes(status)
}

const makeProductSkuMap = (products) =>
  new Map(products.map((product) => [String(product.sku || "").toUpperCase(), product]))

const calculatePeriodReport = ({ orders, products, start, end }) => {
  const productBySku = makeProductSkuMap(products)
  const periodOrders = orders.filter(
    (order) => order.orderDate && isActiveOrder(order) && isBetween(order.orderDate, start, end)
  )
  const aggregates = {
    ordersCount: periodOrders.length,
    unitsSold: 0,
    revenue: 0,
    cogs: 0,
    profit: 0,
    missingCostItems: 0,
    paidOrders: 0,
    unpaidOrders: 0,
    topProducts: [],
    topCategories: []
  }
  const productSales = new Map()
  const categorySales = new Map()

  for (const order of periodOrders) {
    aggregates.revenue += order.productRevenue
    aggregates.unitsSold += order.qtyTotal

    if (order.paymentStatus === "PAID") {
      aggregates.paidOrders += 1
    } else {
      aggregates.unpaidOrders += 1
    }

    for (const item of order.items) {
      const sku = String(item.sku || "").toUpperCase()
      const qty = Number(item.qty || 0)
      const itemRevenue = Number(item.subtotal || 0)
      const product = productBySku.get(sku)
      const itemCost = Number(product?.costPrice || 0) * qty
      if (!product || Number(product.costPrice || 0) <= 0) {
        aggregates.missingCostItems += qty
      }
      const categoryLabel = product?.categoryLabel || getCategoryLabel(product?.category || "aksesoris")

      aggregates.cogs += itemCost

      if (!productSales.has(sku)) {
        productSales.set(sku, {
          sku,
          name: item.nama_produk || product?.name || sku,
          categoryLabel,
          qty: 0,
          revenue: 0
        })
      }

      const productEntry = productSales.get(sku)
      productEntry.qty += qty
      productEntry.revenue += itemRevenue

      if (!categorySales.has(categoryLabel)) {
        categorySales.set(categoryLabel, {
          categoryLabel,
          qty: 0,
          revenue: 0
        })
      }

      const categoryEntry = categorySales.get(categoryLabel)
      categoryEntry.qty += qty
      categoryEntry.revenue += itemRevenue
    }
  }

  aggregates.profit = aggregates.revenue - aggregates.cogs
  aggregates.topProducts = Array.from(productSales.values()).sort(sortSalesEntry).slice(0, 10)
  aggregates.topCategories = Array.from(categorySales.values()).sort(sortSalesEntry).slice(0, 6)
  return aggregates
}

const sortSalesEntry = (left, right) => {
  if (right.qty !== left.qty) {
    return right.qty - left.qty
  }

  return right.revenue - left.revenue
}

const getLowStockAuditStatus = (product) => {
  const status = normalizeText(product.stockStatus)
  return product.stock <= 0 || status.includes("out") ? "out" : "low"
}

const getLowStockProducts = (products) =>
  products
    .filter((product) => {
      const status = normalizeText(product.stockStatus)
      return (
        product.stock <= 0 ||
        status.includes("out") ||
        status.includes("low") ||
        product.stock <= Number(product.minimumStock || 1)
      )
    })
    .sort((left, right) => {
      const leftStatus = getLowStockAuditStatus(left)
      const rightStatus = getLowStockAuditStatus(right)
      if (leftStatus !== rightStatus) {
        return leftStatus === "out" ? -1 : 1
      }

      if (left.stock !== right.stock) {
        return left.stock - right.stock
      }

      if (left.minimumStock !== right.minimumStock) {
        return left.minimumStock - right.minimumStock
      }

      return String(left.sku || left.name).localeCompare(String(right.sku || right.name), "id")
    })

const getLowStockCounts = (products) =>
  products.reduce(
    (counts, product) => {
      if (getLowStockAuditStatus(product) === "out") {
        counts.out += 1
      } else {
        counts.low += 1
      }
      counts.total += 1
      return counts
    },
    { out: 0, low: 0, total: 0 }
  )

const getFilteredLowStockProducts = () => {
  const query = normalizeText(state.lowStockSearch)
  return getLowStockProducts(state.products).filter((product) => {
    const auditStatus = getLowStockAuditStatus(product)
    if (state.lowStockFilter !== "all" && auditStatus !== state.lowStockFilter) {
      return false
    }

    if (!query) {
      return true
    }

    return normalizeText(`${product.sku} ${product.name}`).includes(query)
  })
}

const renderMetrics = (target, report) => {
  // "Total order" harus mencakup semua flow yang masuk STOCK_OUT: order website
  // (Orders_Count) + transaksi marketplace/offline (Marketplace_Offline_Count).
  // Sebelumnya hanya Orders_Count (ORDERS_WEBSITE) sehingga angkanya 0 saat
  // penjualan periode itu hanya berasal dari marketplace/offline.
  const totalOrders = report.ordersCount + report.marketplaceOfflineCount
  const averageOrder = totalOrders ? Math.round(report.revenue / totalOrders) : 0
  target.innerHTML = [
    { label: "Total order", value: `${formatItemCount(totalOrders)} order` },
    { label: "Item keluar", value: `${formatItemCount(report.unitsSold)} item` },
    { label: "Omzet produk", value: formatRupiahSigned(report.revenue) },
    { label: "Estimasi modal", value: formatRupiahSigned(report.cogs) },
    { label: "Estimasi profit", value: formatRupiahSigned(report.profit) },
    { label: "HPP kosong", value: `${formatItemCount(report.missingCostItems)} item` },
    { label: "Rata-rata order", value: formatRupiahSigned(averageOrder) }
  ]
    .map(
      (item) => `
        <div class="report-metric">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `
    )
    .join("")
}

const renderRankList = (target, items, { emptyText = "Belum ada data.", limit = 5 } = {}) => {
  const visibleItems = items.slice(0, limit)

  if (!visibleItems.length) {
    target.innerHTML = `<div class="empty-report">${escapeHtml(emptyText)}</div>`
    return
  }

  target.innerHTML = visibleItems
    .map(
      (item, index) => `
        <article class="rank-item">
          <span class="rank-number">#${index + 1}</span>
          <span class="rank-copy">
            <strong>${escapeHtml(item.name || item.categoryLabel || item.sku || "-")}</strong>
            <small class="rank-meta">${escapeHtml(item.sku || item.categoryLabel || "")} · ${formatItemCount(item.qty || 0)} item</small>
          </span>
          <span class="rank-value">${formatRupiah(item.revenue || 0)}</span>
        </article>
      `
    )
    .join("")
}

const renderLowStockList = (products) => {
  const lowProducts = getLowStockProducts(products)
  const counts = getLowStockCounts(lowProducts)
  kpiLowStock.textContent = formatItemCount(lowProducts.length)
  kpiOutStock.textContent = `${formatItemCount(counts.out)} stok habis`
  lowStockSummaryOut.textContent = formatItemCount(counts.out)
  lowStockSummaryLow.textContent = formatItemCount(counts.low)
  lowStockSummaryTotal.textContent = formatItemCount(counts.total)
  lowStockNote.textContent =
    lowProducts.length > LOW_STOCK_PREVIEW_LIMIT
      ? `Menampilkan ${formatItemCount(LOW_STOCK_PREVIEW_LIMIT)} dari ${formatItemCount(lowProducts.length)} produk yang perlu dicek.`
      : "Prioritas stok habis dan stok rendah."

  lowStockOpenButton.disabled = lowProducts.length === 0
  lowStockExportButton.disabled = lowProducts.length === 0
  lowStockModalExportButton.disabled = lowProducts.length === 0

  if (!lowProducts.length) {
    lowStockList.innerHTML = `<div class="empty-report">Belum ada produk yang masuk alert stok.</div>`
    renderLowStockAuditTable()
    return
  }

  lowStockList.innerHTML = lowProducts
    .slice(0, LOW_STOCK_PREVIEW_LIMIT)
    .map((product) => {
      const isOut = getLowStockAuditStatus(product) === "out"
      return `
        <article class="low-stock-item">
          <span class="stock-badge ${isOut ? "danger" : "low"}">${isOut ? "Habis" : "Low"}</span>
          <span class="low-stock-copy">
            <strong>${escapeHtml(product.name)}</strong>
            <small class="low-stock-meta">${escapeHtml(product.sku)} · ${escapeHtml(product.categoryLabel)}</small>
          </span>
          <span class="low-stock-value">
            <strong>${formatItemCount(product.stock)}</strong>
            <small>min ${formatItemCount(product.minimumStock)}</small>
          </span>
        </article>
      `
    })
    .join("")
  renderLowStockAuditTable()
}

const renderLowStockAuditTable = () => {
  if (!lowStockTableBody) {
    return
  }

  const filteredProducts = getFilteredLowStockProducts()
  lowStockTableMeta.textContent = `${formatItemCount(filteredProducts.length)} produk ditampilkan`
  lowStockFilterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lowStockFilter === state.lowStockFilter)
  })

  if (!filteredProducts.length) {
    lowStockTableBody.innerHTML = `
      <tr>
        <td colspan="6">Tidak ada produk yang cocok dengan pencarian/filter.</td>
      </tr>
    `
    return
  }

  lowStockTableBody.innerHTML = filteredProducts
    .map((product) => {
      const auditStatus = getLowStockAuditStatus(product)
      const isOut = auditStatus === "out"
      return `
        <tr>
          <td><span class="stock-badge table-badge ${isOut ? "danger" : "low"}">${isOut ? "Habis" : "Low"}</span></td>
          <td>${escapeHtml(product.sku)}</td>
          <td>${escapeHtml(product.name)}</td>
          <td>${escapeHtml(product.categoryLabel || getCategoryLabel(product.category))}</td>
          <td>${formatItemCount(product.stock)}</td>
          <td>${formatItemCount(product.minimumStock)}</td>
        </tr>
      `
    })
    .join("")
}

const getAuditCsvDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const csvCell = (value) => {
  const text = String(value ?? "")
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const exportLowStockCsv = () => {
  const lowProducts = getLowStockProducts(state.products)
  if (!lowProducts.length) {
    setStatus("Tidak ada produk low/habis untuk diexport.")
    return
  }

  const rows = [
    ["Status", "SKU", "Nama Produk", "Kategori", "Stok Aktif", "Minimum Stok"],
    ...lowProducts.map((product) => [
      getLowStockAuditStatus(product) === "out" ? "Habis" : "Low",
      product.sku,
      product.name,
      product.categoryLabel || getCategoryLabel(product.category),
      product.stock,
      product.minimumStock
    ])
  ]
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `tvj-produk-perlu-dicek-${getAuditCsvDate()}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  setStatus(`CSV audit stok diexport: ${formatItemCount(lowProducts.length)} produk.`)
}

const openLowStockModal = () => {
  lowStockModal.hidden = false
  document.body.classList.add("is-modal-open")
  renderLowStockAuditTable()
  lowStockSearchInput.focus()
}

const closeLowStockModal = () => {
  lowStockModal.hidden = true
  document.body.classList.remove("is-modal-open")
  lowStockOpenButton.focus()
}

const openStockoutModal = () => {
  if (!stockoutModal) {
    return
  }
  // Render ulang dari data terbaru sebelum modal dibuka.
  renderDailyStockOut(state.orders, new Date())
  stockoutModal.hidden = false
  document.body.classList.add("is-modal-open")
}

const closeStockoutModal = () => {
  if (!stockoutModal) {
    return
  }
  stockoutModal.hidden = true
  document.body.classList.remove("is-modal-open")
  stockoutOpenButton?.focus()
}

// Daftar barang keluar per hari (7 hari terakhir, hari ini di atas).
// Tiap hari: list produk + qty + total nilai. Sumber: state.orders (semua channel).
const renderDailyStockOut = (orders, today) => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = startOfDay(today)
    date.setDate(date.getDate() - index)
    return { date, items: new Map(), units: 0, revenue: 0 }
  })
  const dayByTime = new Map(days.map((day) => [day.date.getTime(), day]))

  for (const order of orders) {
    if (!order.orderDate || !isActiveOrder(order)) {
      continue
    }

    const day = dayByTime.get(startOfDay(order.orderDate).getTime())
    if (!day) {
      continue
    }

    for (const item of order.items) {
      const key = String(item.sku || item.nama_produk || "").toUpperCase()
      if (!day.items.has(key)) {
        day.items.set(key, {
          sku: item.sku,
          name: item.nama_produk || item.sku || "-",
          qty: 0,
          revenue: 0
        })
      }
      const entry = day.items.get(key)
      const qty = Number(item.qty || 0)
      entry.qty += qty
      entry.revenue += Number(item.subtotal || 0)
      day.units += qty
      day.revenue += Number(item.subtotal || 0)
    }
  }

  const totalUnits = days.reduce((total, day) => total + day.units, 0)
  const totalRevenue = days.reduce((total, day) => total + day.revenue, 0)
  if (dailySummaryNote) {
    dailySummaryNote.textContent = `${formatItemCount(totalUnits)} item keluar · ${formatRupiah(totalRevenue)} dalam 7 hari`
  }

  if (!dailyStockOutList) {
    return
  }

  dailyStockOutList.innerHTML = days
    .map((day) => {
      const items = [...day.items.values()].sort((left, right) => right.qty - left.qty)
      const head = `
        <div class="daily-date">
          <strong>${escapeHtml(formatWeekday(day.date))}</strong>
          <small>${escapeHtml(formatShortDate(day.date))} · ${formatItemCount(day.units)} item</small>
        </div>
      `
      const body = items.length
        ? `<div class="rank-list">${items
            .map(
              (item) => `
                <article class="rank-item">
                  <span class="rank-copy">
                    <strong>${escapeHtml(item.name)}</strong>
                    <small class="rank-meta">${escapeHtml(item.sku || "")} · ${formatItemCount(item.qty)} item</small>
                  </span>
                  <span class="rank-value">${formatRupiah(item.revenue)}</span>
                </article>
              `
            )
            .join("")}</div>`
        : `<div class="empty-report">Tidak ada barang keluar.</div>`
      return `<div class="daily-stockout-day">${head}${body}</div>`
    })
    .join("")
}

// 10 produk terakhir yang laku (paling baru terjual), dedup per produk.
// Sumber: state.orders (website + marketplace + offline). Detail 7-hari ada di <details>.
const renderRecentSoldProducts = (orders) => {
  const sales = []
  for (const order of orders) {
    if (!order.orderDate || !isActiveOrder(order)) {
      continue
    }
    for (const item of order.items) {
      sales.push({
        sku: String(item.sku || "").toUpperCase(),
        name: item.nama_produk || item.sku || "-",
        qty: Number(item.qty || 0),
        revenue: Number(item.subtotal || 0),
        date: order.orderDate
      })
    }
  }

  sales.sort((left, right) => right.date - left.date)

  const seen = new Set()
  const recent = []
  for (const sale of sales) {
    const key = sale.sku || sale.name
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    recent.push(sale)
    if (recent.length >= 10) {
      break
    }
  }

  if (recentSoldNote) {
    recentSoldNote.textContent = recent.length
      ? `${formatItemCount(recent.length)} produk terakhir terjual (semua channel).`
      : "Belum ada produk terjual."
  }

  if (!recentSoldList) {
    return
  }

  if (!recent.length) {
    recentSoldList.innerHTML = `<div class="empty-report">Belum ada penjualan tercatat.</div>`
    return
  }

  recentSoldList.innerHTML = recent
    .map(
      (sale, index) => `
        <article class="rank-item">
          <span class="rank-number">#${index + 1}</span>
          <span class="rank-copy">
            <strong>${escapeHtml(sale.name)}</strong>
            <small class="rank-meta">${escapeHtml(sale.sku || "")} · ${formatItemCount(sale.qty)} item · ${escapeHtml(formatShortDate(sale.date))}</small>
          </span>
          <span class="rank-value">${formatRupiah(sale.revenue)}</span>
        </article>
      `
    )
    .join("")
}

const renderSalesRanking = (orders, products) => {
  const report = calculatePeriodReport({
    orders,
    products,
    start: new Date(2000, 0, 1),
    end: new Date(2999, 11, 31)
  })
  salesRankingNote.textContent = `${formatItemCount(report.topProducts.length)} produk terlaris dari order aktif.`

  if (!report.topProducts.length) {
    salesRankingBody.innerHTML = `
      <tr>
        <td colspan="6"><span class="table-muted">Belum ada produk terjual dari order aktif.</span></td>
      </tr>
    `
    return
  }

  salesRankingBody.innerHTML = report.topProducts
    .map(
      (item, index) => `
        <tr>
          <td>#${index + 1}</td>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td>${escapeHtml(item.sku)}</td>
          <td>${formatItemCount(item.qty)}</td>
          <td>${formatRupiah(item.revenue)}</td>
          <td>${escapeHtml(item.categoryLabel)}</td>
        </tr>
      `
    )
    .join("")
}

const renderMonthlyArchive = () => {
  if (!monthlyArchiveBody) {
    return
  }

  const monthlyHistory = Array.isArray(state.reportHistory?.monthly)
    ? state.reportHistory.monthly
    : []

  if (monthlyArchiveNote) {
    monthlyArchiveNote.textContent = monthlyHistory.length
      ? `${formatItemCount(monthlyHistory.length)} arsip bulan tersimpan.`
      : "Belum ada arsip bulan tersimpan."
  }

  if (!monthlyHistory.length) {
    monthlyArchiveBody.innerHTML = `
      <tr>
        <td colspan="5"><span class="table-muted">Belum ada arsip laporan bulanan.</span></td>
      </tr>
    `
    return
  }

  monthlyArchiveBody.innerHTML = monthlyHistory
    .slice(0, 12)
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(String(row.period_key || row.period || "-"))}</td>
          <td>${formatRupiahSigned(toNumber(row.revenue))}</td>
          <td>${formatItemCount(toNumber(row.units_sold))}</td>
          <td>${formatRupiahSigned(toNumber(row.estimated_gross_profit))}</td>
          <td>${formatItemCount(toNumber(row.stock_out_qty))}</td>
        </tr>
      `
    )
    .join("")
}

const renderReports = () => {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const weekStart = startOfWeek(now)
  const weekEnd = endOfWeek(now)
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const orders = state.orders
  const products = state.products
  const todayReport = calculatePeriodReport({
    orders,
    products,
    start: todayStart,
    end: todayEnd
  })
  const monthReport = calculatePeriodReport({
    orders,
    products,
    start: monthStart,
    end: monthEnd
  })

  const dashboardReport = state.currentReports?.dashboard || {}
  const weeklyBackend = state.currentReports?.weekly || {}
  const monthlyBackend = state.currentReports?.monthly || {}

  const todayRevenue = pickReportNumber(dashboardReport, ["omzetHariIni", "Omzet Hari Ini"])
  const todayProfit = pickReportNumber(dashboardReport, ["profitHariIni", "Profit Hari Ini"])
  const weekRevenue = pickReportNumber(weeklyBackend, ["revenue", "Revenue"])
  const weekProfit = pickReportNumber(weeklyBackend, ["estimatedGrossProfit", "Estimated_Gross_Profit"])
  const monthRevenue = pickReportNumber(monthlyBackend, ["revenue", "Revenue"])
  const monthProfit = pickReportNumber(monthlyBackend, ["estimatedGrossProfit", "Estimated_Gross_Profit"])

  kpiTodayRevenue.textContent = formatRupiah(todayRevenue)
  // Hindari "0 order · 0 item": tampilkan hitungan bila ada transaksi hari ini
  // (state.orders = website + marketplace + offline), atau fallback ke omzet/empty.
  const todayOrders = todayReport.ordersCount
  const todayUnits = todayReport.unitsSold
  if (todayOrders > 0 || todayUnits > 0) {
    kpiTodayOrders.textContent = `${formatItemCount(todayOrders)} order · ${formatItemCount(todayUnits)} item · profit ${formatRupiahSigned(todayProfit)}`
  } else if (todayRevenue > 0) {
    kpiTodayOrders.textContent = `Omzet ${formatRupiah(todayRevenue)} · profit ${formatRupiahSigned(todayProfit)}`
  } else {
    kpiTodayOrders.textContent = "Belum ada penjualan hari ini"
  }
  kpiWeekRevenue.textContent = formatRupiah(weekRevenue)
  kpiWeekProfit.textContent = `Profit estimasi ${formatRupiahSigned(weekProfit)}`
  kpiMonthRevenue.textContent = formatRupiah(monthRevenue)
  kpiMonthProfit.textContent = `Profit estimasi ${formatRupiahSigned(monthProfit)}`

  weeklyPeriod.textContent = formatDateRange(weekStart, weekEnd)
  monthlyPeriod.textContent = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric"
  }).format(now)
  renderMetrics(weeklyMetrics, buildBackendPeriodMetrics(weeklyBackend))
  renderMetrics(monthlyMetrics, buildBackendPeriodMetrics(monthlyBackend))
  renderRankList(monthlyTopProducts, monthReport.topProducts, {
    emptyText: "Belum ada penjualan bulan ini.",
    limit: 10
  })
  renderRankList(monthlyTopCategories, monthReport.topCategories, {
    emptyText: "Kategori bulan ini belum terbaca.",
    limit: 5
  })
  renderLowStockList(products)
  renderRecentSoldProducts(orders)
  renderDailyStockOut(orders, now)
  renderSalesRanking(orders, products)
  renderMonthlyArchive()
  reportSyncLabel.textContent = state.loadedAt
    ? `Update ${new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(state.loadedAt)}`
    : "Data siap"
}

const hydrateFromCache = () => {
  const cachedCatalog = readCachedLiveCatalog()
  const cachedOrders = readCachedAdminOrders()
  let hasAnyCache = false

  if (cachedCatalog?.products?.length) {
    state.products = cachedCatalog.products
    hasAnyCache = true
  }

  if (
    cachedOrders?.orders?.length &&
    Number(cachedOrders.total || 0) <= cachedOrders.orders.length
  ) {
    state.orders = cachedOrders.orders.map(normalizeOrder)
    hasAnyCache = true
  }

  if (hasAnyCache) {
    renderReports()
  }
}

const fetchAllAdminOrders = async () => {
  if (!hasAdminApiToken()) {
    throw new Error("Token admin belum tersimpan. Buka halaman admin utama, simpan token, lalu refresh laporan.")
  }

  const limit = 1000
  const firstPage = await fetchAdminOrdersList({
    page: 1,
    limit
  })
  const totalPages = Number(firstPage.total_pages || 1)
  const orders = Array.isArray(firstPage.orders) ? [...firstPage.orders] : []

  if (totalPages > 1) {
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2)
    const pagePayloads = await Promise.all(
      remainingPages.map((page) =>
        fetchAdminOrdersList({
          page,
          limit
        })
      )
    )

    for (const payload of pagePayloads) {
      orders.push(...(Array.isArray(payload.orders) ? payload.orders : []))
    }
  }

  return orders.map(normalizeOrder)
}

const loadReports = async ({ force = false } = {}) => {
  refreshReportsButton.disabled = true
  reportSyncLabel.textContent = force ? "Refresh data..." : "Memuat laporan..."
  setStatus("Memuat laporan toko.")

  if (force && hasAdminApiToken()) {
    reportSyncLabel.textContent = "Refresh laporan backend..."
    try {
      await refreshBackendReporting()
    } catch (error) {
      // Best-effort: backend mungkin lambat/timeout, tetap lanjut baca sheet terakhir.
      console.error(error)
    }
  }

  try {
    const catalogPayload = await fetchLiveCatalog({ force })
    state.products = catalogPayload.products || []
  } catch (error) {
    console.error(error)
    state.error = error.message || "Katalog live gagal dimuat."
    reportTokenNote.textContent = state.error
  }

  try {
    state.currentReports = await fetchCurrentReports({ force })
  } catch (error) {
    console.error(error)
    state.error = error.message || "Laporan terkini gagal dimuat."
    reportTokenNote.textContent = state.error
  }

  try {
    state.reportHistory = await fetchReportHistory({ force })
  } catch (error) {
    // Arsip bulanan opsional; kegagalan tidak memblokir kartu KPI.
    console.error(error)
  }

  // Order & item harian/7-hari dihitung dari gabungan SEMUA flow yang masuk STOCK_OUT:
  // order website (ORDERS_WEBSITE) + marketplace/offline (STOCK_OUT bertag).
  // Kedua feed di-fetch independen supaya kegagalan salah satu tidak mengosongkan
  // state.orders (penyebab umum metrik 0 padahal STOCK_OUT ada datanya).
  const mergedOrders = []
  const orderWarnings = []

  try {
    mergedOrders.push(...(await fetchAllAdminOrders()))
  } catch (error) {
    console.error(error)
    orderWarnings.push(error.message || "Order website belum bisa dimuat.")
  }

  try {
    const marketplacePayload = await fetchAdminMarketplaceHistory({
      limit: 1000
    })
    if (Array.isArray(marketplacePayload.items)) {
      mergedOrders.push(...marketplacePayload.items.map(normalizeMarketplaceSaleAsOrder))
    }
  } catch (error) {
    console.error(error)
    orderWarnings.push(
      "Riwayat marketplace/offline belum terbaca, jadi laporan bisa berbeda dari Sheet."
    )
  }

  state.orders = mergedOrders
  if (!mergedOrders.length && orderWarnings.length) {
    state.error = orderWarnings[0]
  }
  reportTokenNote.textContent = orderWarnings.length
    ? `${orderWarnings.join(" ")} Profit tetap estimasi dan HPP kosong dihitung 0.`
    : "Profit masih estimasi karena memakai harga modal aktif produk saat laporan dibaca. HPP kosong dihitung 0."

  try {
    state.loadedAt = new Date()
    renderReports()
    setStatus(state.error || "Laporan berhasil dimuat.")
  } catch (error) {
    console.error(error)
    state.error = error.message || "Laporan gagal dirender."
    reportSyncLabel.textContent = "Data belum lengkap"
    reportTokenNote.textContent = state.error
    setStatus(state.error)
  } finally {
    refreshReportsButton.disabled = false
  }
}

const init = () => {
  if (!hasValidAdminSession()) {
    reportLock.hidden = false
    reportsDashboard.hidden = true
    return
  }

  reportLock.hidden = true
  reportsDashboard.hidden = false
  hydrateFromCache()
  refreshReportsButton.addEventListener("click", () => {
    void loadReports({ force: true })
  })
  lowStockOpenButton.addEventListener("click", openLowStockModal)
  lowStockExportButton.addEventListener("click", exportLowStockCsv)
  lowStockModalExportButton.addEventListener("click", exportLowStockCsv)
  lowStockSearchInput.addEventListener("input", (event) => {
    state.lowStockSearch = event.target.value
    renderLowStockAuditTable()
  })
  lowStockFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.lowStockFilter = button.dataset.lowStockFilter || "all"
      renderLowStockAuditTable()
    })
  })
  lowStockModal.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.matches("[data-low-stock-close]")) {
      closeLowStockModal()
    }
  })
  stockoutOpenButton?.addEventListener("click", openStockoutModal)
  stockoutModal?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.matches("[data-stockout-close]")) {
      closeStockoutModal()
    }
  })
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lowStockModal.hidden) {
      closeLowStockModal()
    }
  })
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && stockoutModal && !stockoutModal.hidden) {
      closeStockoutModal()
    }
  })
  void loadReports()
}

init()

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
  fetchLiveCatalog,
  hasAdminApiToken,
  readCachedAdminOrders,
  readCachedLiveCatalog
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
const dailyChart = document.querySelector("#daily-chart")
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
const weeklyTopProducts = document.querySelector("#weekly-top-products")
const weeklyTopCategories = document.querySelector("#weekly-top-categories")
const monthlyPeriod = document.querySelector("#monthly-period")
const monthlyMetrics = document.querySelector("#monthly-metrics")
const monthlyTopProducts = document.querySelector("#monthly-top-products")
const monthlyTopCategories = document.querySelector("#monthly-top-categories")
const salesRankingNote = document.querySelector("#sales-ranking-note")
const salesRankingBody = document.querySelector("#sales-ranking-body")

const state = {
  products: [],
  orders: [],
  loadedAt: null,
  error: "",
  lowStockSearch: "",
  lowStockFilter: "all"
}

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

const getLastSevenDayStats = (orders, today) => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = startOfDay(today)
    date.setDate(date.getDate() - (6 - index))
    return {
      date,
      orders: 0,
      units: 0,
      revenue: 0
    }
  })

  for (const order of orders) {
    if (!order.orderDate || !isActiveOrder(order)) {
      continue
    }

    const orderDay = startOfDay(order.orderDate).getTime()
    const targetDay = days.find((day) => day.date.getTime() === orderDay)

    if (!targetDay) {
      continue
    }

    targetDay.orders += 1
    targetDay.units += order.qtyTotal
    targetDay.revenue += order.productRevenue
  }

  return days
}

const renderMetrics = (target, report) => {
  const averageOrder = report.ordersCount ? Math.round(report.revenue / report.ordersCount) : 0
  target.innerHTML = [
    { label: "Total order", value: `${formatItemCount(report.ordersCount)} order` },
    { label: "Item keluar", value: `${formatItemCount(report.unitsSold)} item` },
    { label: "Omzet produk", value: formatRupiah(report.revenue) },
    { label: "Estimasi modal", value: formatRupiah(report.cogs) },
    { label: "Estimasi profit", value: formatRupiah(report.profit) },
    { label: "HPP kosong", value: `${formatItemCount(report.missingCostItems)} item` },
    { label: "Rata-rata order", value: formatRupiah(averageOrder) }
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
    lowProducts.length > 12
      ? `Menampilkan 12 dari ${formatItemCount(lowProducts.length)} produk yang perlu dicek.`
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
    .slice(0, 12)
    .map((product) => {
      const isOut = getLowStockAuditStatus(product) === "out"
      return `
        <article class="low-stock-item">
          <span class="stock-badge ${isOut ? "danger" : "low"}">${isOut ? "Habis" : "Low"}</span>
          <span class="low-stock-copy">
            <strong>${escapeHtml(product.name)}</strong>
            <small class="low-stock-meta">${escapeHtml(product.sku)} · ${escapeHtml(product.categoryLabel)}</small>
          </span>
          <span class="low-stock-value">stok ${formatItemCount(product.stock)} / min ${formatItemCount(product.minimumStock)}</span>
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

const renderDailyChart = (orders, today) => {
  const stats = getLastSevenDayStats(orders, today)
  const maxRevenue = Math.max(1, ...stats.map((day) => day.revenue))
  const totalRevenue = stats.reduce((total, day) => total + day.revenue, 0)
  const totalOrders = stats.reduce((total, day) => total + day.orders, 0)
  dailySummaryNote.textContent = `${formatItemCount(totalOrders)} order · ${formatRupiah(totalRevenue)} omzet produk`

  dailyChart.innerHTML = stats
    .map((day) => {
      const width = Math.max(4, Math.round((day.revenue / maxRevenue) * 100))
      return `
        <div class="daily-row">
          <span class="daily-date">
            <strong>${formatWeekday(day.date)}</strong>
            <small>${formatShortDate(day.date)}</small>
          </span>
          <span class="daily-bar-track" aria-hidden="true">
            <span class="daily-bar" style="--bar-width: ${width}%"></span>
          </span>
          <span class="daily-value">
            <strong>${formatRupiah(day.revenue)}</strong>
            <small>${formatItemCount(day.orders)} order · ${formatItemCount(day.units)} item</small>
          </span>
        </div>
      `
    })
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
  const weekReport = calculatePeriodReport({
    orders,
    products,
    start: weekStart,
    end: weekEnd
  })
  const monthReport = calculatePeriodReport({
    orders,
    products,
    start: monthStart,
    end: monthEnd
  })

  kpiTodayRevenue.textContent = formatRupiah(todayReport.revenue)
  kpiTodayOrders.textContent = `${formatItemCount(todayReport.ordersCount)} order · ${formatItemCount(todayReport.unitsSold)} item · profit ${formatRupiah(todayReport.profit)}`
  kpiWeekRevenue.textContent = formatRupiah(weekReport.revenue)
  kpiWeekProfit.textContent = `Profit estimasi ${formatRupiah(weekReport.profit)}`
  kpiMonthRevenue.textContent = formatRupiah(monthReport.revenue)
  kpiMonthProfit.textContent = `Profit estimasi ${formatRupiah(monthReport.profit)}`

  weeklyPeriod.textContent = formatDateRange(weekStart, weekEnd)
  monthlyPeriod.textContent = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric"
  }).format(now)
  renderMetrics(weeklyMetrics, weekReport)
  renderMetrics(monthlyMetrics, monthReport)
  renderRankList(weeklyTopProducts, weekReport.topProducts, {
    emptyText: "Belum ada penjualan minggu ini.",
    limit: 5
  })
  renderRankList(weeklyTopCategories, weekReport.topCategories, {
    emptyText: "Kategori minggu ini belum terbaca.",
    limit: 5
  })
  renderRankList(monthlyTopProducts, monthReport.topProducts, {
    emptyText: "Belum ada penjualan bulan ini.",
    limit: 10
  })
  renderRankList(monthlyTopCategories, monthReport.topCategories, {
    emptyText: "Kategori bulan ini belum terbaca.",
    limit: 5
  })
  renderLowStockList(products)
  renderDailyChart(orders, now)
  renderSalesRanking(orders, products)
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

  try {
    const catalogPayload = await fetchLiveCatalog({ force })
    state.products = catalogPayload.products || []
  } catch (error) {
    console.error(error)
    state.error = error.message || "Katalog live gagal dimuat."
    reportTokenNote.textContent = state.error
  }

  try {
    const websiteOrders = await fetchAllAdminOrders()
    let marketplaceOrders = []
    let marketplaceWarning = ""

    try {
      const marketplacePayload = await fetchAdminMarketplaceHistory({
        limit: 1000
      })
      marketplaceOrders = Array.isArray(marketplacePayload.items)
        ? marketplacePayload.items.map(normalizeMarketplaceSaleAsOrder)
        : []
    } catch (error) {
      console.error(error)
      marketplaceWarning =
        "Riwayat marketplace/offline belum terbaca, jadi laporan website bisa berbeda dari Sheet."
    }

    state.orders = [...websiteOrders, ...marketplaceOrders]
    reportTokenNote.textContent = marketplaceWarning
      ? `${marketplaceWarning} Profit tetap estimasi dan HPP kosong dihitung 0.`
      : "Profit masih estimasi karena memakai harga modal aktif produk saat laporan dibaca. HPP kosong dihitung 0."
  } catch (error) {
    console.error(error)
    state.orders = []
    state.error = error.message || "Data order belum bisa dimuat."
    reportTokenNote.textContent = state.error
  }

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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lowStockModal.hidden) {
      closeLowStockModal()
    }
  })
  void loadReports()
}

init()

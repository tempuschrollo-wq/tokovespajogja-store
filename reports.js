import {
  escapeHtml,
  formatItemCount,
  formatRupiah,
  getCategoryLabel,
  hasValidAdminSession,
  normalizeText
} from "./catalog-store.js"
import {
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
  error: ""
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

const parseOrderDate = (order) => {
  const rawValue = String(order.created_at || order.order_date || "").trim()

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
  const items = Array.isArray(order.items) ? order.items : []
  const itemSubtotal = items.reduce((total, item) => total + Number(item.subtotal || 0), 0)
  const qtyTotal =
    Number(order.qty_total || 0) ||
    items.reduce((total, item) => total + Number(item.qty || 0), 0)

  return {
    ...order,
    items,
    orderDate: parseOrderDate(order),
    statusOrder: String(order.status_order || "").trim().toUpperCase(),
    paymentStatus: String(order.payment_status || "").trim().toUpperCase(),
    qtyTotal,
    productRevenue: Number(order.subtotal || 0) || itemSubtotal || Number(order.grand_total || 0),
    grandTotal: Number(order.grand_total || 0) || Number(order.subtotal || 0) || itemSubtotal
  }
}

const isActiveOrder = (order) => normalizeText(order.statusOrder) !== "cancel"

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
      const leftOut = left.stock <= 0 ? 0 : 1
      const rightOut = right.stock <= 0 ? 0 : 1
      if (leftOut !== rightOut) {
        return leftOut - rightOut
      }

      return left.stock - right.stock
    })

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
  kpiLowStock.textContent = formatItemCount(lowProducts.length)
  kpiOutStock.textContent = `${formatItemCount(lowProducts.filter((product) => product.stock <= 0).length)} stok habis`
  lowStockNote.textContent =
    lowProducts.length > 12
      ? `Menampilkan 12 dari ${formatItemCount(lowProducts.length)} produk yang perlu dicek.`
      : "Prioritas stok habis dan stok rendah."

  if (!lowProducts.length) {
    lowStockList.innerHTML = `<div class="empty-report">Belum ada produk yang masuk alert stok.</div>`
    return
  }

  lowStockList.innerHTML = lowProducts
    .slice(0, 12)
    .map((product) => {
      const isOut = product.stock <= 0
      return `
        <article class="low-stock-item">
          <span class="stock-badge ${isOut ? "danger" : "low"}">${isOut ? "Habis" : "Low"}</span>
          <span class="low-stock-copy">
            <strong>${escapeHtml(product.name)}</strong>
            <small class="low-stock-meta">${escapeHtml(product.sku)} · ${escapeHtml(product.categoryLabel)}</small>
          </span>
          <span class="low-stock-value">stok ${formatItemCount(product.stock)}</span>
        </article>
      `
    })
    .join("")
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
  kpiTodayOrders.textContent = `${formatItemCount(todayReport.ordersCount)} order · ${formatItemCount(todayReport.unitsSold)} item`
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
    const orders = await fetchAllAdminOrders()
    state.orders = orders
    reportTokenNote.textContent =
      "Profit masih estimasi karena memakai harga modal aktif produk saat laporan dibaca."
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
  void loadReports()
}

init()

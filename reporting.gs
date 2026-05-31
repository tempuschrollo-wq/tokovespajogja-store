/**
 * Refreshes DASHBOARD with inventory, sales, profit, and recent activity.
 */
function refreshDashboard(context) {
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.dashboard, false);
  if (!sheet) {
    sheet = getSpreadsheet_().insertSheet(cfg.sheets.dashboard);
  }
  context = context || buildReportingContext_();
  var metrics = getDashboardMetrics_(context);
  sheet.clearContents();
  sheet.clearFormats();

  var rows = [
    ['Metric', 'Value'],
    ['Generated_At', new Date()],
    ['Total Produk Aktif', metrics.totalProdukAktif],
    ['Total SKU', metrics.totalSku],
    ['Total Stok Unit', metrics.totalStokUnit],
    ['Nilai Inventory Modal', metrics.nilaiInventoryModal],
    ['Nilai Inventory Jual', metrics.nilaiInventoryJual],
    ['READY', metrics.ready],
    ['LOW', metrics.low],
    ['OUT_OF_STOCK', metrics.outOfStock],
    ['Profit Hari Ini', metrics.profitHariIni],
    ['Omzet Hari Ini', metrics.omzetHariIni],
    ['HPP Kosong Hari Ini', metrics.missingHppHariIni],
    ['Profit Warning Hari Ini', metrics.profitWarningHariIni],
    ['', ''],
    ['Recent Activity', ''],
    ['Timestamp', 'SKU', 'Nama_Produk', 'Tipe_Log', 'Qty_Change', 'Reference_ID', 'Actor']
  ];
  var recent = getRecentInventoryActivity_(cfg.recentActivityLimit);
  for (var i = 0; i < recent.length; i++) {
    rows.push([
      recent[i].Timestamp || '',
      recent[i].SKU || '',
      recent[i].Nama_Produk || '',
      recent[i].Tipe_Log || '',
      safeToNumber_(recent[i].Qty_Change),
      recent[i].Reference_ID || '',
      recent[i].Actor || ''
    ]);
  }
  sheet.getRange(1, 1, rows.length, 7).setValues(padRows_(rows, 7));
  applyDashboardFormats_(sheet, rows.length);
  sheet.autoResizeColumns(1, 7);
  setSettingValue_('Last_Refreshed_DASHBOARD', new Date(), 'Last dashboard reporting refresh timestamp');
  return notifyUser_('Refresh DASHBOARD complete.');
}

/**
 * Refreshes dashboard, weekly report, and monthly report.
 */
function refreshAllReporting() {
  var context = buildReportingContext_();
  refreshDashboard(context);
  refreshWeeklyReport(context);
  refreshMonthlyReport(context);
  return notifyUser_('Refresh semua reporting complete.');
}

/**
 * Refreshes WEEKLY_REPORT for the current configured week.
 */
function refreshWeeklyReport(context) {
  context = context || buildReportingContext_();
  var start = startOfWeek_(new Date());
  var end = addDays_(start, 7);
  var report = buildPeriodReport_(start, end, 'CURRENT_WEEK', context);
  writePeriodReport_(tvjConfig_().sheets.weeklyReport, report);
  return notifyUser_('Refresh WEEKLY_REPORT complete.');
}

/**
 * Refreshes MONTHLY_REPORT for the current configured month.
 */
function refreshMonthlyReport(context) {
  context = context || buildReportingContext_();
  var start = startOfConfiguredMonth_(new Date());
  var end = addConfiguredMonths_(start, 1);
  var report = buildPeriodReport_(start, end, 'CURRENT_MONTH', context);
  writePeriodReport_(tvjConfig_().sheets.monthlyReport, report);
  return notifyUser_('Refresh MONTHLY_REPORT complete.');
}

/**
 * Calculates dashboard metrics from MASTER_PRODUCTS and valid STOCK_OUT rows.
 */
function getDashboardMetrics_(context) {
  var cfg = tvjConfig_();
  context = context || buildReportingContext_();
  var metrics = {
    totalProdukAktif: 0,
    totalSku: 0,
    totalStokUnit: 0,
    nilaiInventoryModal: 0,
    nilaiInventoryJual: 0,
    ready: 0,
    low: 0,
    outOfStock: 0,
    profitHariIni: 0,
    omzetHariIni: 0,
    missingHppHariIni: 0,
    profitWarningHariIni: ''
  };

  for (var i = 0; i < context.products.length; i++) {
    var product = context.products[i];
    var sku = normalizeSku_(product.SKU);
    if (sku !== '') {
      metrics.totalSku++;
    }
    if (isActiveProduct_(product)) {
      metrics.totalProdukAktif++;
    }
    var stock = safeToNumber_(product.Stok_Aktif);
    var modal = safeToNumber_(product.Harga_Modal);
    var jual = safeToNumber_(product.Harga_Jual);
    metrics.totalStokUnit += stock;
    metrics.nilaiInventoryModal += stock * modal;
    metrics.nilaiInventoryJual += stock * jual;
    var status = normalizeText_(product.Status_Stok || calculateStockStatus_(stock, product.Minimum_Stok));
    if (status === cfg.statuses.ready) {
      metrics.ready++;
    } else if (status === cfg.statuses.low) {
      metrics.low++;
    } else if (status === cfg.statuses.outOfStock) {
      metrics.outOfStock++;
    }
  }

  var start = startOfConfiguredDay_(new Date());
  var end = addDays_(start, 1);
  var sales = aggregateStockOutSales_(context.stockOutRows, context, start, end);
  metrics.omzetHariIni = sales.revenue;
  metrics.profitHariIni = sales.grossProfit;
  metrics.missingHppHariIni = sales.missingHppItems;
  if (metrics.missingHppHariIni > 0) {
    metrics.profitWarningHariIni = 'Missing HPP items: ' + metrics.missingHppHariIni;
  }
  return metrics;
}

/**
 * Builds one period report for weekly or monthly sheets.
 */
function buildPeriodReport_(start, end, label, context) {
  context = context || buildReportingContext_();
  var orderStats = calculateOrderStats_(context.orders, start, end);
  var sales = aggregateStockOutSales_(context.stockOutRows, context, start, end);
  var report = {
    Period: label,
    Start: start,
    End: end,
    Orders_Count: orderStats.ordersCount,
    Units_Sold: sales.units,
    Revenue: sales.revenue,
    Estimated_COGS: sales.cogs,
    Estimated_Gross_Profit: sales.grossProfit,
    Missing_HPP_Items: sales.missingHppItems,
    Profit_Warning: '',
    Marketplace_Offline_Count: sales.nonWebsiteSalesCount,
    Stock_In_Qty: sumQtyFromRowsByDate_(context.stockInRows, 'Tanggal', 'Qty_Masuk', start, end),
    Stock_Out_Qty: sumQtyFromRowsByDate_(context.stockOutRows, 'Tanggal', 'Qty_Keluar', start, end),
    Cancel_Count: orderStats.cancelCount,
    Top_SKU: findTopSku_(sales.soldBySku),
    Low_Stock_Count: context.lowStockCount,
    Generated_At: new Date()
  };
  if (report.Missing_HPP_Items > 0) {
    report.Profit_Warning = 'Missing HPP items: ' + report.Missing_HPP_Items + '. Estimated profit treats missing HPP as 0.';
  }
  return report;
}

/**
 * Writes a period report into its target sheet.
 */
function writePeriodReport_(sheetName, report) {
  var sheet = getSheet_(sheetName, false);
  if (!sheet) {
    sheet = getSpreadsheet_().insertSheet(sheetName);
  }
  sheet.clearContents();
  sheet.clearFormats();
  var rows = [
    ['Metric', 'Value'],
    ['Period', report.Period],
    ['Start', report.Start],
    ['End', report.End],
    ['Orders_Count', report.Orders_Count],
    ['Units_Sold', report.Units_Sold],
    ['Revenue', report.Revenue],
    ['Estimated_COGS', report.Estimated_COGS],
    ['Estimated_Gross_Profit', report.Estimated_Gross_Profit],
    ['Missing_HPP_Items', report.Missing_HPP_Items],
    ['Profit_Warning', report.Profit_Warning],
    ['Marketplace_Offline_Count', report.Marketplace_Offline_Count],
    ['Stock_In_Qty', report.Stock_In_Qty],
    ['Stock_Out_Qty', report.Stock_Out_Qty],
    ['Cancel_Count', report.Cancel_Count],
    ['Top_SKU', report.Top_SKU],
    ['Low_Stock_Count', report.Low_Stock_Count],
    ['Generated_At', report.Generated_At]
  ];
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  applyPeriodReportFormats_(sheet);
  sheet.autoResizeColumns(1, 2);
}

/**
 * Archives the previous month into MONTHLY_REPORT_HISTORY.
 */
function archivePreviousMonthlyReport() {
  var result = archivePreviousMonthlyReport_(buildReportingContext_());
  return notifyUser_('Archive previous monthly report complete: ' + result.periodKey);
}

function archivePreviousMonthlyReport_(context) {
  var currentMonthStart = startOfConfiguredMonth_(new Date());
  var start = addConfiguredMonths_(currentMonthStart, -1);
  var end = currentMonthStart;
  var report = buildPeriodReport_(start, end, 'PREVIOUS_MONTH', context || buildReportingContext_());
  var periodKey = buildMonthlyPeriodKey_(start);
  upsertPeriodReportHistory_(tvjConfig_().sheets.monthlyReportHistory, report, periodKey);
  return { periodKey: periodKey, report: report };
}

/**
 * Archives the previous week into WEEKLY_REPORT_HISTORY.
 */
function archivePreviousWeeklyReport() {
  var result = archivePreviousWeeklyReport_(buildReportingContext_());
  return notifyUser_('Archive previous weekly report complete: ' + result.periodKey);
}

function archivePreviousWeeklyReport_(context) {
  var currentWeekStart = startOfWeek_(new Date());
  var start = addDays_(currentWeekStart, -7);
  var end = currentWeekStart;
  var report = buildPeriodReport_(start, end, 'PREVIOUS_WEEK', context || buildReportingContext_());
  var periodKey = buildWeeklyPeriodKey_(start, end);
  upsertPeriodReportHistory_(tvjConfig_().sheets.weeklyReportHistory, report, periodKey);
  return { periodKey: periodKey, report: report };
}

/**
 * Archives previous weekly and monthly reports without creating duplicate keys.
 */
function archivePreviousReports() {
  var context = buildReportingContext_();
  var weekly = archivePreviousWeeklyReport_(context);
  var monthly = archivePreviousMonthlyReport_(context);
  return notifyUser_('Archive laporan complete: weekly=' + weekly.periodKey + ', monthly=' + monthly.periodKey);
}

/**
 * Upserts one period report into a history sheet by Period_Key.
 */
function upsertPeriodReportHistory_(sheetName, report, periodKey) {
  var cfg = tvjConfig_();
  var headers = cfg.headers.REPORT_HISTORY;
  var sheet = ensureReportHistorySheet_(sheetName, headers);
  var map = getHeaderMap_(sheet);
  var keyCol = requireColumn_(map, 'Period_Key', sheetName);
  var targetRow = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var keys = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || '').trim() === periodKey) {
        targetRow = i + 2;
        break;
      }
    }
  }
  if (targetRow === 0) {
    targetRow = Math.max(sheet.getLastRow() + 1, 2);
  }
  var rowObject = buildHistoryRowObject_(report, periodKey);
  var values = [];
  for (var h = 0; h < headers.length; h++) {
    values.push(rowObject[headers[h]]);
  }
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([values]);
  applyReportHistoryFormats_(sheet);
  return targetRow;
}

/**
 * Lightweight public API for recent weekly/monthly report history.
 */
function apiReportsHistory_(payload) {
  var limit = Math.max(1, Math.min(60, parseInt(payload.limit || 12, 10) || 12));
  var cfg = tvjConfig_();
  return apiSuccess_('REPORT_HISTORY_OK', {
    weekly: readReportHistoryRows_(cfg.sheets.weeklyReportHistory, limit),
    monthly: readReportHistoryRows_(cfg.sheets.monthlyReportHistory, limit)
  });
}

/**
 * Calculates units, revenue, COGS, and gross profit for one order row.
 * Revenue reporting uses STOCK_OUT rows; this is kept for existing callers.
 */
function calculateOrderSalesMetrics_(orderRow, modalBySku, hargaJualBySku) {
  var result = {
    units: 0,
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    missingHppItems: 0,
    soldBySku: {}
  };
  var items = normalizeItems_(parseJsonSafe_(orderRow.Item_JSON, []));
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var sku = normalizeSku_(item.sku);
    var price = item.harga_jual > 0 ? item.harga_jual : safeToNumber_(hargaJualBySku[sku]);
    var modal = safeToNumber_(modalBySku[sku]);
    result.units += item.qty;
    result.revenue += item.qty * price;
    result.cogs += item.qty * modal;
    if (modal <= 0) {
      result.missingHppItems += item.qty;
    }
    if (!result.soldBySku[sku]) {
      result.soldBySku[sku] = 0;
    }
    result.soldBySku[sku] += item.qty;
  }
  if (result.units <= 0) {
    result.units = safeToNumber_(orderRow.Qty_Total);
  }
  if (result.revenue <= 0) {
    result.revenue = safeToNumber_(orderRow.Grand_Total || orderRow.Subtotal);
  }
  result.grossProfit = result.revenue - result.cogs;
  return result;
}

/**
 * Compatibility helper: adds marketplace/offline STOCK_OUT sales to a target.
 */
function addMarketplaceStockOutSalesToMetrics_(target, start, end, modalBySku, hargaJualBySku, soldBySku) {
  var context = buildReportingContext_();
  context.modalBySku = modalBySku || context.modalBySku;
  var sales = aggregateStockOutSales_(context.stockOutRows, context, start, end, { nonWebsiteOnly: true });
  if (target.hasOwnProperty('omzetHariIni')) {
    target.omzetHariIni += sales.revenue;
    target.profitHariIni += sales.grossProfit;
    target.missingHppHariIni += sales.missingHppItems;
  } else {
    target.Marketplace_Offline_Count += sales.nonWebsiteSalesCount;
    target.Units_Sold += sales.units;
    target.Revenue += sales.revenue;
    target.Estimated_COGS += sales.cogs;
    target.Estimated_Gross_Profit += sales.grossProfit;
    target.Missing_HPP_Items += sales.missingHppItems;
    if (soldBySku) {
      mergeQtyBySku_(soldBySku, sales.soldBySku);
    }
  }
}

/**
 * Sums quantity values from a dated transaction sheet.
 */
function sumQtyByDate_(sheetName, dateHeader, qtyHeader, start, end) {
  return sumQtyFromRowsByDate_(getRowsAsObjectsIfSheetExists_(sheetName), dateHeader, qtyHeader, start, end);
}

function buildReportingContext_() {
  var cfg = tvjConfig_();
  var products = getRowsAsObjects_(cfg.sheets.master);
  var context = {
    products: products,
    orders: getRowsAsObjectsIfSheetExists_(cfg.sheets.orders),
    stockInRows: getRowsAsObjectsIfSheetExists_(cfg.sheets.stockIn),
    stockOutRows: getRowsAsObjectsIfSheetExists_(cfg.sheets.stockOut),
    modalBySku: {},
    hargaJualBySku: {},
    orderById: {},
    lowStockCount: 0
  };

  for (var p = 0; p < products.length; p++) {
    var sku = normalizeSku_(products[p].SKU);
    if (sku !== '') {
      context.modalBySku[sku] = safeToNumber_(products[p].Harga_Modal);
      context.hargaJualBySku[sku] = safeToNumber_(products[p].Harga_Jual);
    }
    var status = normalizeText_(products[p].Status_Stok || calculateStockStatus_(products[p].Stok_Aktif, products[p].Minimum_Stok));
    if (status === cfg.statuses.low || status === cfg.statuses.outOfStock) {
      context.lowStockCount++;
    }
  }

  for (var o = 0; o < context.orders.length; o++) {
    var orderId = String(context.orders[o].Order_ID || '').trim();
    if (orderId !== '') {
      context.orderById[orderId] = context.orders[o];
    }
  }
  return context;
}

function aggregateStockOutSales_(rows, context, start, end, options) {
  options = options || {};
  var result = {
    units: 0,
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    missingHppItems: 0,
    nonWebsiteSalesCount: 0,
    soldBySku: {}
  };

  for (var i = 0; i < rows.length; i++) {
    var dateValue = asDateOrNull_(rows[i].Tanggal);
    if (!dateValue || !isDateInRange_(dateValue, start, end)) {
      continue;
    }
    var sale = buildValidStockOutSale_(rows[i], context);
    if (!sale) {
      continue;
    }
    if (options.nonWebsiteOnly && sale.isWebsiteOrder) {
      continue;
    }
    result.units += sale.qty;
    result.revenue += sale.revenue;
    result.cogs += sale.cogs;
    result.grossProfit += sale.revenue - sale.cogs;
    result.missingHppItems += sale.missingHppItems;
    if (!sale.isWebsiteOrder) {
      result.nonWebsiteSalesCount++;
    }
    if (!result.soldBySku[sale.sku]) {
      result.soldBySku[sale.sku] = 0;
    }
    result.soldBySku[sale.sku] += sale.qty;
  }
  return result;
}

function buildValidStockOutSale_(row, context) {
  if (isInternalOrCancelledStockOut_(row)) {
    return null;
  }
  var sku = normalizeSku_(row.SKU);
  var qty = safeToNumber_(row.Qty_Keluar);
  if (sku === '' || qty <= 0) {
    return null;
  }

  var order = getStockOutWebsiteOrder_(row, context);
  if (order && isCancelledStatus_(order.Status_Order)) {
    return null;
  }

  var totalPenjualan = safeToNumber_(row.Total_Penjualan);
  var hargaJual = safeToNumber_(row.Harga_Jual_Satuan);
  var revenue = totalPenjualan > 0 ? totalPenjualan : qty * hargaJual;
  if (revenue <= 0) {
    return null;
  }

  var modal = safeToNumber_(context.modalBySku[sku]);
  return {
    sku: sku,
    qty: qty,
    revenue: revenue,
    cogs: qty * modal,
    missingHppItems: modal <= 0 ? qty : 0,
    isWebsiteOrder: !!order || isWebsiteOrderNote_(row)
  };
}

function isInternalOrCancelledStockOut_(row) {
  var type = normalizeText_(row.Jenis_Keluar);
  var note = normalizeText_([row.Catatan, row.Reference_ID, row.Out_ID].join(' '));
  if (type.indexOf('CANCEL') >= 0 || type.indexOf('RESTORE') >= 0 || type.indexOf('RETURN') >= 0) {
    return true;
  }
  if (type === 'INTERNAL' || type === 'STOCK_ADJUSTMENT' || type === 'ADJUSTMENT' || type === 'TRANSFER') {
    return true;
  }
  return note.indexOf('ORDER_CANCEL_RESTORE') >= 0 || note.indexOf('CANCEL_RESTORE') >= 0;
}

function getStockOutWebsiteOrder_(row, context) {
  var referenceId = String(row.Reference_ID || '').trim();
  var outId = String(row.Out_ID || '').trim();
  if (referenceId !== '' && context.orderById[referenceId]) {
    return context.orderById[referenceId];
  }
  if (outId !== '' && context.orderById[outId]) {
    return context.orderById[outId];
  }
  return null;
}

function isWebsiteOrderNote_(row) {
  return normalizeText_(row.Catatan).indexOf('ORDER WEBSITE') >= 0;
}

function calculateOrderStats_(orders, start, end) {
  var stats = {
    ordersCount: 0,
    cancelCount: 0
  };
  for (var i = 0; i < orders.length; i++) {
    var orderDate = asDateOrNull_(orders[i].Order_Date || orders[i].Created_At);
    if (!orderDate || !isDateInRange_(orderDate, start, end)) {
      continue;
    }
    if (isCancelledStatus_(orders[i].Status_Order)) {
      stats.cancelCount++;
    } else {
      stats.ordersCount++;
    }
  }
  return stats;
}

function sumQtyFromRowsByDate_(rows, dateHeader, qtyHeader, start, end) {
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    var dateValue = asDateOrNull_(rows[i][dateHeader]);
    if (dateValue && isDateInRange_(dateValue, start, end)) {
      total += safeToNumber_(rows[i][qtyHeader]);
    }
  }
  return total;
}

function getRowsAsObjectsIfSheetExists_(sheetName) {
  var sheet = getSheet_(sheetName, false);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  return getRowsAsObjects_(sheetName);
}

/**
 * Returns true for cancelled order statuses.
 */
function isCancelledStatus_(status) {
  var cfg = tvjConfig_();
  var normalized = normalizeText_(status);
  return normalized === cfg.statuses.cancelled ||
    normalized === cfg.statuses.cancelledId ||
    normalized === 'CANCELED' ||
    normalized === 'CANCEL' ||
    normalized === 'DELETED';
}

/**
 * Finds the SKU with the highest sold quantity.
 */
function findTopSku_(soldBySku) {
  var bestSku = '';
  var bestQty = 0;
  for (var sku in soldBySku) {
    if (soldBySku.hasOwnProperty(sku) && soldBySku[sku] > bestQty) {
      bestSku = sku;
      bestQty = soldBySku[sku];
    }
  }
  return bestSku === '' ? '' : bestSku + ' (' + bestQty + ')';
}

function mergeQtyBySku_(target, source) {
  for (var sku in source) {
    if (source.hasOwnProperty(sku)) {
      if (!target[sku]) {
        target[sku] = 0;
      }
      target[sku] += source[sku];
    }
  }
}

/**
 * Returns start of week using Monday as the first day in configured timezone.
 */
function startOfWeek_(dateValue) {
  var start = startOfConfiguredDay_(dateValue);
  var day = parseInt(formatDate_(start, 'u'), 10);
  if (isNaN(day) || day < 1 || day > 7) {
    day = start.getDay();
    day = day === 0 ? 7 : day;
  }
  return addDays_(start, 1 - day);
}

function startOfConfiguredDay_(dateValue) {
  return dateFromConfiguredYmd_(formatDate_(dateValue || new Date(), 'yyyy-MM-dd'));
}

function startOfConfiguredMonth_(dateValue) {
  return dateFromConfiguredYmd_(formatDate_(dateValue || new Date(), 'yyyy-MM') + '-01');
}

function addConfiguredMonths_(dateValue, months) {
  var date = new Date(dateValue.getFullYear(), dateValue.getMonth() + months, 1);
  return startOfConfiguredDay_(date);
}

function dateFromConfiguredYmd_(ymd) {
  var parts = String(ymd || '').split('-');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

/**
 * Adds whole days to a Date.
 */
function addDays_(dateValue, days) {
  var date = new Date(dateValue.getTime());
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Checks date range using inclusive start and exclusive end.
 */
function isDateInRange_(dateValue, start, end) {
  var time = dateValue.getTime();
  return time >= start.getTime() && time < end.getTime();
}

function buildMonthlyPeriodKey_(start) {
  return formatDate_(start, 'yyyy-MM');
}

function buildWeeklyPeriodKey_(start, end) {
  return formatDate_(start, 'yyyy-MM-dd') + '_to_' + formatDate_(addDays_(end, -1), 'yyyy-MM-dd');
}

function ensureReportHistorySheet_(sheetName, headers) {
  var sheet = getSheet_(sheetName, false);
  if (!sheet) {
    sheet = getSpreadsheet_().insertSheet(sheetName);
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function buildHistoryRowObject_(report, periodKey) {
  return {
    Period_Key: periodKey,
    Period: report.Period,
    Start: report.Start,
    End: report.End,
    Orders_Count: report.Orders_Count,
    Units_Sold: report.Units_Sold,
    Revenue: report.Revenue,
    Estimated_COGS: report.Estimated_COGS,
    Estimated_Gross_Profit: report.Estimated_Gross_Profit,
    Missing_HPP_Items: report.Missing_HPP_Items,
    Profit_Warning: report.Profit_Warning,
    Marketplace_Offline_Count: report.Marketplace_Offline_Count,
    Stock_In_Qty: report.Stock_In_Qty,
    Stock_Out_Qty: report.Stock_Out_Qty,
    Cancel_Count: report.Cancel_Count,
    Top_SKU: report.Top_SKU,
    Low_Stock_Count: report.Low_Stock_Count,
    Generated_At: report.Generated_At,
    Archived_At: new Date()
  };
}

function readReportHistoryRows_(sheetName, limit) {
  var sheet = getSheet_(sheetName, false);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  var rows = getRowsAsObjects_(sheetName);
  var output = [];
  for (var i = rows.length - 1; i >= 0 && output.length < limit; i--) {
    output.push(mapReportHistoryRowToApi_(rows[i]));
  }
  return output;
}

function mapReportHistoryRowToApi_(row) {
  return {
    period_key: String(row.Period_Key || '').trim(),
    period: String(row.Period || '').trim(),
    start: row.Start || '',
    end: row.End || '',
    orders_count: safeToNumber_(row.Orders_Count),
    units_sold: safeToNumber_(row.Units_Sold),
    revenue: safeToNumber_(row.Revenue),
    estimated_cogs: safeToNumber_(row.Estimated_COGS),
    estimated_gross_profit: safeToNumber_(row.Estimated_Gross_Profit),
    missing_hpp_items: safeToNumber_(row.Missing_HPP_Items),
    profit_warning: String(row.Profit_Warning || '').trim(),
    marketplace_offline_count: safeToNumber_(row.Marketplace_Offline_Count),
    stock_in_qty: safeToNumber_(row.Stock_In_Qty),
    stock_out_qty: safeToNumber_(row.Stock_Out_Qty),
    cancel_count: safeToNumber_(row.Cancel_Count),
    top_sku: String(row.Top_SKU || '').trim(),
    low_stock_count: safeToNumber_(row.Low_Stock_Count),
    generated_at: row.Generated_At || '',
    archived_at: row.Archived_At || ''
  };
}

function applyDashboardFormats_(sheet, rowCount) {
  sheet.getRange(1, 1, rowCount, 7).setNumberFormat('@');
  sheet.getRange(2, 2).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(3, 2, 3, 1).setNumberFormat('0');
  sheet.getRange(6, 2, 2, 1).setNumberFormat('"Rp"#,##0');
  sheet.getRange(8, 2, 3, 1).setNumberFormat('0');
  sheet.getRange(11, 2, 2, 1).setNumberFormat('"Rp"#,##0');
  sheet.getRange(13, 2).setNumberFormat('0');
  if (rowCount > 17) {
    sheet.getRange(18, 1, rowCount - 17, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    sheet.getRange(18, 5, rowCount - 17, 1).setNumberFormat('0');
  }
}

function applyPeriodReportFormats_(sheet) {
  sheet.getRange(1, 1, 18, 2).setNumberFormat('@');
  sheet.getRange(3, 2, 2, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(5, 2, 2, 1).setNumberFormat('0');
  sheet.getRange(7, 2, 3, 1).setNumberFormat('"Rp"#,##0');
  sheet.getRange(10, 2).setNumberFormat('0');
  sheet.getRange(12, 2, 4, 1).setNumberFormat('0');
  sheet.getRange(17, 2).setNumberFormat('0');
  sheet.getRange(18, 2).setNumberFormat('yyyy-mm-dd hh:mm');
}

function applyReportHistoryFormats_(sheet) {
  var lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(1, 1, lastRow, 19).setNumberFormat('@');
  if (lastRow < 2) {
    return;
  }
  sheet.getRange(2, 3, lastRow - 1, 2).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, 5, lastRow - 1, 2).setNumberFormat('0');
  sheet.getRange(2, 7, lastRow - 1, 3).setNumberFormat('"Rp"#,##0');
  sheet.getRange(2, 10, lastRow - 1, 1).setNumberFormat('0');
  sheet.getRange(2, 12, lastRow - 1, 4).setNumberFormat('0');
  sheet.getRange(2, 17, lastRow - 1, 1).setNumberFormat('0');
  sheet.getRange(2, 18, lastRow - 1, 2).setNumberFormat('yyyy-mm-dd hh:mm');
}

/**
 * Pads ragged rows for rectangular setValues calls.
 */
function padRows_(rows, width) {
  var output = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i].slice();
    while (row.length < width) {
      row.push('');
    }
    output.push(row);
  }
  return output;
}

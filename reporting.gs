/**
 * Refreshes DASHBOARD with inventory, sales, profit, and recent activity.
 */
function refreshDashboard() {
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.dashboard, false);
  if (!sheet) {
    sheet = getSpreadsheet_().insertSheet(cfg.sheets.dashboard);
  }
  var metrics = getDashboardMetrics_();
  sheet.clearContents();

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
  var recent = getRecentInventoryActivity_(tvjConfig_().recentActivityLimit);
  for (var i = 0; i < recent.length; i++) {
    rows.push([
      recent[i].Timestamp || '',
      recent[i].SKU || '',
      recent[i].Nama_Produk || '',
      recent[i].Tipe_Log || '',
      recent[i].Qty_Change || '',
      recent[i].Reference_ID || '',
      recent[i].Actor || ''
    ]);
  }
  sheet.getRange(1, 1, rows.length, 7).setValues(padRows_(rows, 7));
  sheet.autoResizeColumns(1, 7);
  setSettingValue_('Last_Refreshed_DASHBOARD', new Date(), 'Last dashboard reporting refresh timestamp');
  return notifyUser_('Refresh DASHBOARD complete.');
}

/**
 * Refreshes dashboard, weekly report, and monthly report.
 */
function refreshAllReporting() {
  refreshDashboard();
  refreshWeeklyReport();
  refreshMonthlyReport();
  return notifyUser_('Refresh semua reporting complete.');
}

/**
 * Refreshes WEEKLY_REPORT for the current configured week.
 */
function refreshWeeklyReport() {
  var start = startOfWeek_(new Date());
  var end = addDays_(start, 7);
  var report = buildPeriodReport_(start, end, 'CURRENT_WEEK');
  writePeriodReport_(tvjConfig_().sheets.weeklyReport, report);
  return notifyUser_('Refresh WEEKLY_REPORT complete.');
}

/**
 * Refreshes MONTHLY_REPORT for the current configured month.
 */
function refreshMonthlyReport() {
  var now = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), 1);
  var end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  var report = buildPeriodReport_(start, end, 'CURRENT_MONTH');
  writePeriodReport_(tvjConfig_().sheets.monthlyReport, report);
  return notifyUser_('Refresh MONTHLY_REPORT complete.');
}

/**
 * Calculates dashboard metrics from MASTER_PRODUCTS and ORDERS_WEBSITE.
 */
function getDashboardMetrics_() {
  var cfg = tvjConfig_();
  var products = getRowsAsObjects_(cfg.sheets.master);
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
  var modalBySku = {};
  var hargaJualBySku = {};
  for (var i = 0; i < products.length; i++) {
    var product = products[i];
    var sku = normalizeSku_(product.SKU);
    if (sku !== '') {
      metrics.totalSku++;
      modalBySku[sku] = safeToNumber_(product.Harga_Modal);
      hargaJualBySku[sku] = safeToNumber_(product.Harga_Jual);
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

  var orders = getRowsAsObjects_(cfg.sheets.orders);
  var today = new Date();
  for (var o = 0; o < orders.length; o++) {
    var orderDate = asDateOrNull_(orders[o].Order_Date || orders[o].Created_At);
    if (!orderDate || !isSameConfiguredDate_(orderDate, today) || isCancelledStatus_(orders[o].Status_Order)) {
      continue;
    }
    var orderMetrics = calculateOrderSalesMetrics_(orders[o], modalBySku, hargaJualBySku);
    metrics.omzetHariIni += orderMetrics.revenue;
    metrics.profitHariIni += orderMetrics.grossProfit;
    metrics.missingHppHariIni += orderMetrics.missingHppItems;
  }
  addMarketplaceStockOutSalesToMetrics_(metrics, today, today, modalBySku, hargaJualBySku, null);
  if (metrics.missingHppHariIni > 0) {
    metrics.profitWarningHariIni = 'Missing HPP items: ' + metrics.missingHppHariIni;
  }
  return metrics;
}

/**
 * Builds one period report for weekly or monthly sheets.
 */
function buildPeriodReport_(start, end, label) {
  var cfg = tvjConfig_();
  var products = getRowsAsObjects_(cfg.sheets.master);
  var modalBySku = {};
  var hargaJualBySku = {};
  var lowStockCount = 0;
  for (var p = 0; p < products.length; p++) {
    var sku = normalizeSku_(products[p].SKU);
    if (sku !== '') {
      modalBySku[sku] = safeToNumber_(products[p].Harga_Modal);
      hargaJualBySku[sku] = safeToNumber_(products[p].Harga_Jual);
    }
    var status = normalizeText_(products[p].Status_Stok || calculateStockStatus_(products[p].Stok_Aktif, products[p].Minimum_Stok));
    if (status === cfg.statuses.low || status === cfg.statuses.outOfStock) {
      lowStockCount++;
    }
  }

  var orders = getRowsAsObjects_(cfg.sheets.orders);
  var report = {
    Period: label,
    Start: start,
    End: end,
    Orders_Count: 0,
    Units_Sold: 0,
    Revenue: 0,
    Estimated_COGS: 0,
    Estimated_Gross_Profit: 0,
    Missing_HPP_Items: 0,
    Profit_Warning: '',
    Marketplace_Offline_Count: 0,
    Stock_In_Qty: 0,
    Stock_Out_Qty: 0,
    Cancel_Count: 0,
    Top_SKU: '',
    Low_Stock_Count: lowStockCount,
    Generated_At: new Date()
  };
  var soldBySku = {};
  for (var i = 0; i < orders.length; i++) {
    var orderDate = asDateOrNull_(orders[i].Order_Date || orders[i].Created_At);
    if (!orderDate || !isDateInRange_(orderDate, start, end)) {
      continue;
    }
    if (isCancelledStatus_(orders[i].Status_Order)) {
      report.Cancel_Count++;
      continue;
    }
    report.Orders_Count++;
    var sales = calculateOrderSalesMetrics_(orders[i], modalBySku, hargaJualBySku);
    report.Units_Sold += sales.units;
    report.Revenue += sales.revenue;
    report.Estimated_COGS += sales.cogs;
    report.Estimated_Gross_Profit += sales.grossProfit;
    report.Missing_HPP_Items += sales.missingHppItems;
    for (var sku in sales.soldBySku) {
      if (sales.soldBySku.hasOwnProperty(sku)) {
        if (!soldBySku[sku]) {
          soldBySku[sku] = 0;
        }
        soldBySku[sku] += sales.soldBySku[sku];
      }
    }
  }
  addMarketplaceStockOutSalesToMetrics_(report, start, end, modalBySku, hargaJualBySku, soldBySku);
  if (report.Missing_HPP_Items > 0) {
    report.Profit_Warning = 'Missing HPP items: ' + report.Missing_HPP_Items + '. Estimated profit treats missing HPP as 0.';
  }
  report.Stock_In_Qty = sumQtyByDate_(cfg.sheets.stockIn, 'Tanggal', 'Qty_Masuk', start, end);
  report.Stock_Out_Qty = sumQtyByDate_(cfg.sheets.stockOut, 'Tanggal', 'Qty_Keluar', start, end);
  report.Top_SKU = findTopSku_(soldBySku);
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
  sheet.autoResizeColumns(1, 2);
}

/**
 * Calculates units, revenue, COGS, and gross profit for one order row.
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
    var price = item.harga_jual > 0 ? item.harga_jual : safeToNumber_(hargaJualBySku[item.sku]);
    var modal = safeToNumber_(modalBySku[item.sku]);
    result.units += item.qty;
    result.revenue += item.qty * price;
    result.cogs += item.qty * modal;
    if (modal <= 0) {
      result.missingHppItems += item.qty;
    }
    if (!result.soldBySku[item.sku]) {
      result.soldBySku[item.sku] = 0;
    }
    result.soldBySku[item.sku] += item.qty;
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
 * Adds tagged marketplace/offline STOCK_OUT sales without counting website order stock-outs.
 */
function addMarketplaceStockOutSalesToMetrics_(target, start, end, modalBySku, hargaJualBySku, soldBySku) {
  var rows = getRowsAsObjects_(tvjConfig_().sheets.stockOut);
  for (var i = 0; i < rows.length; i++) {
    if (!isMarketplaceStockOutRow_(rows[i])) {
      continue;
    }
    var rowDate = asDateOrNull_(rows[i].Tanggal);
    if (!rowDate) {
      continue;
    }
    var inRange = start.getTime() === end.getTime()
      ? isSameConfiguredDate_(rowDate, start)
      : isDateInRange_(rowDate, start, end);
    if (!inRange) {
      continue;
    }
    var sku = normalizeSku_(rows[i].SKU);
    var qty = safeToNumber_(rows[i].Qty_Keluar);
    if (sku === '' || qty <= 0) {
      continue;
    }
    var revenue = safeToNumber_(rows[i].Total_Penjualan);
    if (revenue <= 0) {
      var price = safeToNumber_(rows[i].Harga_Jual_Satuan) || safeToNumber_(hargaJualBySku[sku]);
      revenue = qty * price;
    }
    var modal = safeToNumber_(modalBySku[sku]);
    var cogs = qty * modal;
    var missingHpp = modal <= 0 ? qty : 0;

    if (target.hasOwnProperty('omzetHariIni')) {
      target.omzetHariIni += revenue;
      target.profitHariIni += revenue - cogs;
      target.missingHppHariIni += missingHpp;
    } else {
      target.Orders_Count++;
      target.Marketplace_Offline_Count++;
      target.Units_Sold += qty;
      target.Revenue += revenue;
      target.Estimated_COGS += cogs;
      target.Estimated_Gross_Profit += revenue - cogs;
      target.Missing_HPP_Items += missingHpp;
      if (soldBySku) {
        if (!soldBySku[sku]) {
          soldBySku[sku] = 0;
        }
        soldBySku[sku] += qty;
      }
    }
  }
}

/**
 * Sums quantity values from a dated transaction sheet.
 */
function sumQtyByDate_(sheetName, dateHeader, qtyHeader, start, end) {
  var sheet = getSheet_(sheetName, false);
  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }
  var rows = getRowsAsObjects_(sheetName);
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    var dateValue = asDateOrNull_(rows[i][dateHeader]);
    if (dateValue && isDateInRange_(dateValue, start, end)) {
      total += safeToNumber_(rows[i][qtyHeader]);
    }
  }
  return total;
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

/**
 * Returns start of week using Monday as the first day.
 */
function startOfWeek_(dateValue) {
  var date = new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
  var day = date.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
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

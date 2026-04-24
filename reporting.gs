var REPORTING_TOP_LIMIT = 10;
var REPORTING_LOW_STOCK_LIMIT = 10;
var REPORTING_ACTIVITY_LIMIT = 10;
var REPORTING_DETAIL_START_COLUMN = 16; // Column P
var REPORTING_DETAIL_CLEAR_COLUMNS = 48;
var REPORTING_DETAIL_MIN_ROWS = 180;
var REPORTING_OOS_LONG_DAYS = 30;

function refreshDashboard(referenceDate) {
  return withDocumentLock_(function() {
    assertExpectedHeaders_(SHEETS.DASHBOARD);

    var now = referenceDate ? new Date(referenceDate) : new Date();
    var snapshot = buildDashboardSnapshot_(now);
    writeDashboardRows_(snapshot.rows);
    showToast_('DASHBOARD berhasil diperbarui.');

    return {
      refreshed_at: snapshot.refreshedAt,
      row_count: snapshot.rows.length
    };
  });
}

function generateWeeklyReport(referenceDate) {
  return withDocumentLock_(function() {
    assertExpectedHeaders_(SHEETS.WEEKLY_REPORT);

    var anchorDate = referenceDate ? new Date(referenceDate) : new Date();
    var period = getPreviousCompletedWeekRange_(anchorDate);
    var report = buildPeriodReportData_(period.start, period.end, 'WEEKLY');

    upsertPeriodSummaryRow_(SHEETS.WEEKLY_REPORT, 'Week_Key', report.summaryRow.Week_Key, report.summaryRow);
    writeWeeklyReportDetails_(report);
    showToast_('WEEKLY_REPORT berhasil diperbarui: ' + report.summaryRow.Week_Key);

    return {
      week_key: report.summaryRow.Week_Key,
      generated_at: report.generatedAt
    };
  });
}

function generateMonthlyReport(referenceDate) {
  return withDocumentLock_(function() {
    assertExpectedHeaders_(SHEETS.MONTHLY_REPORT);

    var anchorDate = referenceDate ? new Date(referenceDate) : new Date();
    var period = getPreviousCompletedMonthRange_(anchorDate);
    var report = buildPeriodReportData_(period.start, period.end, 'MONTHLY');

    upsertPeriodSummaryRow_(SHEETS.MONTHLY_REPORT, 'Month_Key', report.summaryRow.Month_Key, report.summaryRow);
    writeMonthlyReportDetails_(report);
    showToast_('MONTHLY_REPORT berhasil diperbarui: ' + report.summaryRow.Month_Key);

    return {
      month_key: report.summaryRow.Month_Key,
      generated_at: report.generatedAt
    };
  });
}

function getTopProducts(periodType, limit, referenceDate) {
  var resolvedLimit = limit ? Math.max(1, Number(limit)) : REPORTING_TOP_LIMIT;
  var anchorDate = referenceDate ? new Date(referenceDate) : new Date();
  var period = resolveNamedPeriod_(periodType, anchorDate);
  var products = getReportMasterProducts_();
  var productIndex = buildProductIndex_(products);
  var summary = buildOrderSummaryForRange_(period.start, period.end, productIndex);

  return summary.topProducts.slice(0, resolvedLimit);
}

function getLowStockProducts(limit) {
  var products = getReportMasterProducts_().filter(isActiveProduct_);
  return buildRestockProducts_(products).slice(0, limit || REPORTING_LOW_STOCK_LIMIT);
}

function refreshAllReporting() {
  var dashboard = refreshDashboard();
  var weekly = generateWeeklyReport();
  var monthly = generateMonthlyReport();

  return {
    dashboard: dashboard,
    weekly: weekly,
    monthly: monthly
  };
}

function scheduledRefreshDashboard() {
  refreshDashboard();
}

function scheduledGenerateWeeklyReport() {
  generateWeeklyReport();
  refreshDashboard();
}

function scheduledGenerateMonthlyReport() {
  generateMonthlyReport();
  refreshDashboard();
}

function installReportingTimeTriggers() {
  var handlerNames = [
    'scheduledRefreshDashboard',
    'scheduledGenerateWeeklyReport',
    'scheduledGenerateMonthlyReport'
  ];

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlerNames.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('scheduledRefreshDashboard')
    .timeBased()
    .everyHours(1)
    .create();

  ScriptApp.newTrigger('scheduledGenerateWeeklyReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)
    .create();

  ScriptApp.newTrigger('scheduledGenerateMonthlyReport')
    .timeBased()
    .onMonthDay(1)
    .atHour(6)
    .create();

  showUiAlert_(
    'Trigger reporting siap',
    'Trigger reporting terpasang: DASHBOARD tiap 1 jam, WEEKLY tiap Senin 06:00, MONTHLY tiap tanggal 1 jam 06:00.'
  );
}

function buildDashboardSnapshot_(referenceDate) {
  var refreshedAt = formatTimestampJakarta_(referenceDate);
  var products = getReportMasterProducts_();
  var activeProducts = products.filter(isActiveProduct_);
  var productIndex = buildProductIndex_(products);
  var inventoryMetrics = buildInventoryMetrics_(products, activeProducts);

  var todayPeriod = {
    start: startOfDay_(referenceDate),
    end: endOfDay_(referenceDate)
  };
  var currentWeek = getCurrentWeekRange_(referenceDate);
  var currentMonth = getCurrentMonthRange_(referenceDate);

  var todaySummary = buildOrderSummaryForRange_(todayPeriod.start, todayPeriod.end, productIndex);
  var weeklySummary = buildOrderSummaryForRange_(currentWeek.start, currentWeek.end, productIndex);
  var monthlySummary = buildOrderSummaryForRange_(currentMonth.start, currentMonth.end, productIndex);

  var topProductsWeek = weeklySummary.topProducts.slice(0, REPORTING_TOP_LIMIT);
  var topProductsMonth = monthlySummary.topProducts.slice(0, REPORTING_TOP_LIMIT);
  var lowestStock = buildLowestStockProducts_(activeProducts).slice(0, REPORTING_LOW_STOCK_LIMIT);
  var restockProducts = buildRestockProducts_(activeProducts).slice(0, REPORTING_LOW_STOCK_LIMIT);
  var recentActivity = buildRecentInventoryActivities_(REPORTING_ACTIVITY_LIMIT);

  var rows = [];

  rows.push(createDashboardRow_('INVENTORY_SUMMARY', 'Total Produk Aktif', inventoryMetrics.totalProdukAktif, 'NUMBER', refreshedAt, 'Status_Produk = AKTIF'));
  rows.push(createDashboardRow_('INVENTORY_SUMMARY', 'Total SKU', inventoryMetrics.totalSku, 'NUMBER', refreshedAt, 'SKU unik dari MASTER_PRODUCTS'));
  rows.push(createDashboardRow_('INVENTORY_SUMMARY', 'Total Stok Unit', inventoryMetrics.totalStokUnit, 'NUMBER', refreshedAt, 'Akumulasi stok seluruh SKU'));
  rows.push(createDashboardRow_('INVENTORY_SUMMARY', 'Total Nilai Inventory Modal', inventoryMetrics.totalNilaiModal, 'CURRENCY', refreshedAt, 'Stok_Aktif x Harga_Modal'));
  rows.push(createDashboardRow_('INVENTORY_SUMMARY', 'Total Nilai Inventory Jual', inventoryMetrics.totalNilaiJual, 'CURRENCY', refreshedAt, 'Stok_Aktif x Harga_Jual'));
  rows.push(createDashboardRow_('INVENTORY_SUMMARY', 'Total Potensi Margin', inventoryMetrics.totalPotensiMargin, 'CURRENCY', refreshedAt, 'Nilai jual minus nilai modal'));
  rows.push(createDashboardRow_('STOCK_STATUS', 'Produk READY', inventoryMetrics.readyCount, 'NUMBER', refreshedAt, 'Status_Stok READY pada produk aktif'));
  rows.push(createDashboardRow_('STOCK_STATUS', 'Produk LOW', inventoryMetrics.lowCount, 'NUMBER', refreshedAt, 'Status_Stok LOW pada produk aktif'));
  rows.push(createDashboardRow_('STOCK_STATUS', 'Produk OUT OF STOCK', inventoryMetrics.outOfStockCount, 'NUMBER', refreshedAt, 'Status_Stok OUT OF STOCK pada produk aktif'));
  rows.push(createDashboardRow_('SALES', 'Omzet Hari Ini', todaySummary.revenue, 'CURRENCY', refreshedAt, 'Order website non-cancel + order marketplace yang dicatat manual hari ini'));
  rows.push(createDashboardRow_('SALES', 'Omzet Minggu Ini', weeklySummary.revenue, 'CURRENCY', refreshedAt, 'Order website non-cancel + order marketplace yang dicatat manual minggu ini'));
  rows.push(createDashboardRow_('SALES', 'Omzet Bulan Ini', monthlySummary.revenue, 'CURRENCY', refreshedAt, 'Order website non-cancel + order marketplace yang dicatat manual bulan ini'));
  rows.push(createDashboardRow_('PROFIT', 'Profit Minggu Ini', weeklySummary.estimatedProfit, 'CURRENCY', refreshedAt, 'Revenue website + marketplace - (qty x Harga_Modal aktif)'));
  rows.push(createDashboardRow_('PROFIT', 'Profit Bulan Ini', monthlySummary.estimatedProfit, 'CURRENCY', refreshedAt, 'Revenue website + marketplace - (qty x Harga_Modal aktif)'));

  topProductsWeek.forEach(function(item, index) {
    rows.push(
      createDashboardRow_(
        'TOP_PRODUCTS_WEEK',
        buildRankLabel_(index + 1, item.sku),
        item.qty,
        'NUMBER',
        refreshedAt,
        item.namaProduk + ' | Revenue=' + item.revenue + ' | Orders=' + item.orderCount + ' | Kategori=' + item.kategori
      )
    );
  });

  topProductsMonth.forEach(function(item, index) {
    rows.push(
      createDashboardRow_(
        'TOP_PRODUCTS_MONTH',
        buildRankLabel_(index + 1, item.sku),
        item.qty,
        'NUMBER',
        refreshedAt,
        item.namaProduk + ' | Revenue=' + item.revenue + ' | Orders=' + item.orderCount + ' | Kategori=' + item.kategori
      )
    );
  });

  lowestStock.forEach(function(item, index) {
    rows.push(
      createDashboardRow_(
        'LOWEST_STOCK',
        buildRankLabel_(index + 1, item.sku),
        item.stokAktif,
        'NUMBER',
        refreshedAt,
        item.namaProduk + ' | Minimum=' + item.minimumStok + ' | Status=' + item.statusStok
      )
    );
  });

  restockProducts.forEach(function(item, index) {
    rows.push(
      createDashboardRow_(
        'RESTOCK_ALERT',
        buildRankLabel_(index + 1, item.sku),
        item.restockGap,
        'NUMBER',
        refreshedAt,
        item.namaProduk + ' | Stok=' + item.stokAktif + ' | Minimum=' + item.minimumStok + ' | Status=' + item.statusStok
      )
    );
  });

  recentActivity.forEach(function(item, index) {
    rows.push(
      createDashboardRow_(
        'RECENT_ACTIVITY',
        buildRankLabel_(index + 1, item.sku + ' ' + item.tipeLog),
        item.qtyChange,
        'NUMBER',
        refreshedAt,
        item.namaProduk + ' | ' + item.timestampLabel + ' | ' + item.referenceId + ' | ' + item.note
      )
    );
  });

  return {
    refreshedAt: refreshedAt,
    rows: rows
  };
}

function buildPeriodReportData_(startDate, endDate, reportType) {
  var generatedAt = formatTimestampJakarta_(new Date());
  var products = getReportMasterProducts_();
  var activeProducts = products.filter(isActiveProduct_);
  var productIndex = buildProductIndex_(products);
  var orderSummary = buildOrderSummaryForRange_(startDate, endDate, productIndex);
  var stockInSummary = buildStockInSummary_(startDate, endDate);
  var stockOutNonOrderSummary = buildStockOutNonOrderSummary_(startDate, endDate);
  var criticalProducts = buildCriticalProductsForPeriod_(startDate, endDate, productIndex);
  var inventorySnapshot = buildInventoryMetrics_(products, activeProducts);
  var inactiveProducts = products.filter(function(product) {
    return normalizeString_(product.Status_Produk) === 'NONAKTIF';
  });
  var outOfStockTooLong = buildOutOfStockTooLongProducts_(products, REPORTING_OOS_LONG_DAYS, new Date());

  var summaryRow = {};

  if (reportType === 'WEEKLY') {
    summaryRow = {
      Week_Key: buildWeekKey_(startDate),
      Period_Start: startDate,
      Period_End: endDate,
      Orders_Count: orderSummary.ordersCount,
      Units_Sold: orderSummary.unitsSold,
      Revenue: orderSummary.revenue,
      Estimated_COGS: orderSummary.estimatedCogs,
      Estimated_Gross_Profit: orderSummary.estimatedProfit,
      Stock_In_Qty: stockInSummary.totalQty,
      Stock_Out_Qty: orderSummary.unitsSold + stockOutNonOrderSummary.totalQty,
      Cancel_Count: orderSummary.cancelCount,
      Top_SKU: orderSummary.topProducts.length ? orderSummary.topProducts[0].sku : '',
      Low_Stock_Count: criticalProducts.length,
      Generated_At: new Date()
    };
  } else {
    summaryRow = {
      Month_Key: buildMonthKey_(startDate),
      Period_Start: startDate,
      Period_End: endDate,
      Orders_Count: orderSummary.ordersCount,
      Units_Sold: orderSummary.unitsSold,
      Revenue: orderSummary.revenue,
      Estimated_COGS: orderSummary.estimatedCogs,
      Estimated_Gross_Profit: orderSummary.estimatedProfit,
      Stock_In_Qty: stockInSummary.totalQty,
      Stock_Out_Qty: orderSummary.unitsSold + stockOutNonOrderSummary.totalQty,
      Cancel_Count: orderSummary.cancelCount,
      Top_SKU: orderSummary.topProducts.length ? orderSummary.topProducts[0].sku : '',
      Low_Stock_Count: criticalProducts.length,
      Generated_At: new Date()
    };
  }

  return {
    reportType: reportType,
    startDate: startDate,
    endDate: endDate,
    generatedAt: generatedAt,
    summaryRow: summaryRow,
    orderSummary: orderSummary,
    stockInSummary: stockInSummary,
    stockOutNonOrderSummary: stockOutNonOrderSummary,
    criticalProducts: criticalProducts,
    inventorySnapshot: inventorySnapshot,
    inactiveProducts: inactiveProducts,
    outOfStockTooLong: outOfStockTooLong
  };
}

function writeDashboardRows_(rows) {
  var sheet = getSheetOrThrow_(SHEETS.DASHBOARD);
  var currentRows = Math.max(sheet.getLastRow() - 1, 1);

  sheet.getRange(2, 1, currentRows, HEADERS[SHEETS.DASHBOARD].length).clearContent();

  if (!rows.length) {
    return;
  }

  sheet.getRange(2, 1, rows.length, HEADERS[SHEETS.DASHBOARD].length).setValues(rows);
  applyDashboardFormats_(sheet, rows);
}

function writeWeeklyReportDetails_(report) {
  var sheet = getSheetOrThrow_(SHEETS.WEEKLY_REPORT);
  clearReportDetailArea_(sheet);

  writeKeyValueBlock_(
    sheet,
    1,
    16,
    'WEEKLY REPORT SNAPSHOT',
    [
      ['Week_Key', report.summaryRow.Week_Key],
      ['Period_Start', formatDateForReport_(report.startDate)],
      ['Period_End', formatDateForReport_(report.endDate)],
      ['Generated_At', report.generatedAt],
      ['Orders_Count', report.summaryRow.Orders_Count],
      ['Units_Sold', report.summaryRow.Units_Sold],
      ['Revenue', report.summaryRow.Revenue],
      ['Estimated_COGS', report.summaryRow.Estimated_COGS],
      ['Estimated_Gross_Profit', report.summaryRow.Estimated_Gross_Profit],
      ['Stok_Kritis_Minggu', report.criticalProducts.length]
    ]
  );

  writeTableBlock_(
    sheet,
    12,
    16,
    'TOP 10 PRODUK PALING LAKU MINGGU INI',
    ['SKU', 'Nama_Produk', 'Kategori', 'Qty_Terjual', 'Revenue', 'Orders'],
    report.orderSummary.topProducts.slice(0, REPORTING_TOP_LIMIT).map(function(item) {
      return [item.sku, item.namaProduk, item.kategori, item.qty, item.revenue, item.orderCount];
    })
  );

  writeTableBlock_(
    sheet,
    12,
    24,
    'KATEGORI TERLARIS MINGGU INI',
    ['Kategori', 'Qty_Terjual', 'Revenue', 'Orders'],
    report.orderSummary.topCategories.slice(0, REPORTING_TOP_LIMIT).map(function(item) {
      return [item.kategori, item.qty, item.revenue, item.orderCount];
    })
  );

  writeTableBlock_(
    sheet,
    12,
    30,
    'STOK KRITIS MINGGU INI',
    ['SKU', 'Nama_Produk', 'Stok_Sesudah', 'Minimum_Stok', 'Status_Stok', 'Last_Event'],
    report.criticalProducts.map(function(item) {
      return [item.sku, item.namaProduk, item.stokSesudah, item.minimumStok, item.statusStok, item.lastEvent];
    })
  );

  writeTableBlock_(
    sheet,
    12,
    38,
    'RINGKASAN STOCK IN',
    ['SKU', 'Nama_Produk', 'Qty_Masuk', 'Total_Modal', 'Transaksi'],
    report.stockInSummary.rows.map(function(item) {
      return [item.sku, item.namaProduk, item.qty, item.totalModal, item.transactionCount];
    })
  );

  writeTableBlock_(
    sheet,
    12,
    45,
    'STOCK OUT NON-ORDER',
    ['SKU', 'Nama_Produk', 'Jenis_Keluar', 'Qty_Keluar', 'Transaksi', 'Total_Penjualan'],
    report.stockOutNonOrderSummary.rows.map(function(item) {
      return [item.sku, item.namaProduk, item.jenisKeluar, item.qty, item.transactionCount, item.totalPenjualan];
    })
  );
}

function writeMonthlyReportDetails_(report) {
  var sheet = getSheetOrThrow_(SHEETS.MONTHLY_REPORT);
  clearReportDetailArea_(sheet);

  writeKeyValueBlock_(
    sheet,
    1,
    16,
    'MONTHLY REPORT SNAPSHOT',
    [
      ['Month_Key', report.summaryRow.Month_Key],
      ['Period_Start', formatDateForReport_(report.startDate)],
      ['Period_End', formatDateForReport_(report.endDate)],
      ['Generated_At', report.generatedAt],
      ['Orders_Count', report.summaryRow.Orders_Count],
      ['Units_Sold', report.summaryRow.Units_Sold],
      ['Revenue', report.summaryRow.Revenue],
      ['Estimated_COGS', report.summaryRow.Estimated_COGS],
      ['Estimated_Gross_Profit', report.summaryRow.Estimated_Gross_Profit],
      ['Produk_Nonaktif', report.inactiveProducts.length]
    ]
  );

  writeTableBlock_(
    sheet,
    12,
    16,
    'TOP 10 PRODUK BULAN INI',
    ['SKU', 'Nama_Produk', 'Kategori', 'Qty_Terjual', 'Revenue', 'Orders'],
    report.orderSummary.topProducts.slice(0, REPORTING_TOP_LIMIT).map(function(item) {
      return [item.sku, item.namaProduk, item.kategori, item.qty, item.revenue, item.orderCount];
    })
  );

  writeTableBlock_(
    sheet,
    12,
    24,
    'TOP KATEGORI BULAN INI',
    ['Kategori', 'Qty_Terjual', 'Revenue', 'Orders'],
    report.orderSummary.topCategories.slice(0, REPORTING_TOP_LIMIT).map(function(item) {
      return [item.kategori, item.qty, item.revenue, item.orderCount];
    })
  );

  writeKeyValueBlock_(
    sheet,
    12,
    30,
    'INVENTORY END-OF-MONTH SUMMARY',
    [
      ['Total_Produk_Aktif', report.inventorySnapshot.totalProdukAktif],
      ['Total_SKU', report.inventorySnapshot.totalSku],
      ['Total_Stok_Unit', report.inventorySnapshot.totalStokUnit],
      ['Nilai_Inventory_Modal', report.inventorySnapshot.totalNilaiModal],
      ['Nilai_Inventory_Jual', report.inventorySnapshot.totalNilaiJual],
      ['Total_Potensi_Margin', report.inventorySnapshot.totalPotensiMargin],
      ['Produk_READY', report.inventorySnapshot.readyCount],
      ['Produk_LOW', report.inventorySnapshot.lowCount],
      ['Produk_OUT_OF_STOCK', report.inventorySnapshot.outOfStockCount]
    ]
  );

  writeTableBlock_(
    sheet,
    12,
    36,
    'PRODUK NONAKTIF',
    ['SKU', 'Nama_Produk', 'Kategori', 'Stok_Aktif'],
    report.inactiveProducts.slice(0, REPORTING_TOP_LIMIT).map(function(item) {
      return [item.SKU, item.Nama_Produk, item.Kategori, toNumber_(item.Stok_Aktif)];
    })
  );

  writeTableBlock_(
    sheet,
    12,
    42,
    'OUT OF STOCK TERLALU LAMA',
    ['SKU', 'Nama_Produk', 'Hari_OOS', 'Last_Event', 'Catatan'],
    report.outOfStockTooLong.map(function(item) {
      return [item.sku, item.namaProduk, item.daysOutOfStock, item.lastEvent, item.note];
    })
  );

  writeTableBlock_(
    sheet,
    12,
    48,
    'RINGKASAN STOCK IN BULANAN',
    ['SKU', 'Nama_Produk', 'Qty_Masuk', 'Total_Modal', 'Transaksi'],
    report.stockInSummary.rows.map(function(item) {
      return [item.sku, item.namaProduk, item.qty, item.totalModal, item.transactionCount];
    })
  );

  writeTableBlock_(
    sheet,
    12,
    55,
    'STOCK OUT NON-ORDER BULANAN',
    ['SKU', 'Nama_Produk', 'Jenis_Keluar', 'Qty_Keluar', 'Transaksi', 'Total_Penjualan'],
    report.stockOutNonOrderSummary.rows.map(function(item) {
      return [item.sku, item.namaProduk, item.jenisKeluar, item.qty, item.transactionCount, item.totalPenjualan];
    })
  );
}

function upsertPeriodSummaryRow_(sheetName, keyHeader, keyValue, rowObject) {
  var sheet = getSheetOrThrow_(sheetName);
  var headers = HEADERS[sheetName];
  var rowNumber = findSummaryRowByKey_(sheet, keyHeader, keyValue);

  if (!rowNumber) {
    rowNumber = getNextSummaryRow_(sheet);
  }

  var rowValues = headers.map(function(header) {
    return rowObject[header] !== undefined ? rowObject[header] : '';
  });

  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([rowValues]);
}

function buildInventoryMetrics_(products, activeProducts) {
  var skuMap = {};
  var metrics = {
    totalProdukAktif: activeProducts.length,
    totalSku: 0,
    totalStokUnit: 0,
    totalNilaiModal: 0,
    totalNilaiJual: 0,
    totalPotensiMargin: 0,
    readyCount: 0,
    lowCount: 0,
    outOfStockCount: 0
  };

  products.forEach(function(product) {
    var sku = String(product.SKU || '').trim().toUpperCase();
    var stokAktif = toNumber_(product.Stok_Aktif);
    var hargaModal = toNumber_(product.Harga_Modal);
    var hargaJual = toNumber_(product.Harga_Jual);

    if (sku) {
      skuMap[sku] = true;
    }

    metrics.totalStokUnit += stokAktif;
    metrics.totalNilaiModal += stokAktif * hargaModal;
    metrics.totalNilaiJual += stokAktif * hargaJual;
  });

  activeProducts.forEach(function(product) {
    var status = normalizeString_(product.Status_Stok);

    if (status === 'READY') {
      metrics.readyCount += 1;
    } else if (status === 'LOW') {
      metrics.lowCount += 1;
    } else if (status === 'OUT OF STOCK') {
      metrics.outOfStockCount += 1;
    }
  });

  metrics.totalSku = Object.keys(skuMap).length;
  metrics.totalPotensiMargin = metrics.totalNilaiJual - metrics.totalNilaiModal;

  return metrics;
}

function buildOrderSummaryForRange_(startDate, endDate, productIndex) {
  var orders = getSheetRowsForReporting_(SHEETS.ORDERS_WEBSITE);
  var itemMap = {};
  var categoryMap = {};
  var summary = {
    ordersCount: 0,
    cancelCount: 0,
    unitsSold: 0,
    revenue: 0,
    productRevenue: 0,
    estimatedCogs: 0,
    estimatedProfit: 0,
    topProducts: [],
    topCategories: []
  };

  orders.forEach(function(order) {
    var orderDate = getOrderDateForReporting_(order);
    if (!orderDate || !isDateWithinRange_(orderDate, startDate, endDate)) {
      return;
    }

    var statusOrder = normalizeString_(order.Status_Order);
    if (statusOrder === 'CANCEL') {
      summary.cancelCount += 1;
      return;
    }

    summary.ordersCount += 1;
    summary.revenue += resolveOrderRevenue_(order);
    var itemRevenueTotalForOrder = 0;

    parseOrderItemsForReporting_(order.Item_JSON).forEach(function(item) {
      var sku = String(item.sku || item.SKU || '').trim().toUpperCase();
      var qty = toNumber_(item.qty || item.Qty || 0);

      if (!sku || qty <= 0) {
        return;
      }

      var product = productIndex[sku] || null;
      var namaProduk = product ? product.Nama_Produk : String(item.nama_produk || item.Nama_Produk || sku);
      var kategori = product ? String(product.Kategori || 'Tanpa Kategori') : 'Tanpa Kategori';
      var hargaModalAktif = product ? toNumber_(product.Harga_Modal) : 0;
      var itemRevenue = resolveOrderItemRevenue_(item, product, qty);
      itemRevenueTotalForOrder += itemRevenue;

      summary.unitsSold += qty;
      summary.estimatedCogs += qty * hargaModalAktif;

      if (!itemMap[sku]) {
        itemMap[sku] = {
          sku: sku,
          namaProduk: namaProduk,
          kategori: kategori,
          qty: 0,
          revenue: 0,
          orderCount: 0
        };
      }

      itemMap[sku].qty += qty;
      itemMap[sku].revenue += itemRevenue;
      itemMap[sku].orderCount += 1;

      if (!categoryMap[kategori]) {
        categoryMap[kategori] = {
          kategori: kategori,
          qty: 0,
          revenue: 0,
          orderCount: 0
        };
      }

      categoryMap[kategori].qty += qty;
      categoryMap[kategori].revenue += itemRevenue;
      categoryMap[kategori].orderCount += 1;
    });

    summary.productRevenue += resolveOrderProductRevenue_(order, itemRevenueTotalForOrder);
  });

  appendMarketplaceSalesToOrderSummary_(summary, startDate, endDate, productIndex, itemMap, categoryMap);

  summary.estimatedProfit = summary.productRevenue - summary.estimatedCogs;
  summary.topProducts = sortObjectValues_(itemMap, ['qty', 'revenue', 'sku']);
  summary.topCategories = sortObjectValues_(categoryMap, ['qty', 'revenue', 'kategori']);

  return summary;
}

function appendMarketplaceSalesToOrderSummary_(summary, startDate, endDate, productIndex, itemMap, categoryMap) {
  var rows = getSheetRowsForReporting_(SHEETS.STOCK_OUT);

  rows.forEach(function(row) {
    if (!isMarketplaceStockOutRow_(row)) {
      return;
    }

    var tanggal = coerceDate_(row.Tanggal);
    if (!tanggal || !isDateWithinRange_(tanggal, startDate, endDate)) {
      return;
    }

    var sku = String(row.SKU || '').trim().toUpperCase();
    var qtyKeluar = toNumber_(row.Qty_Keluar);
    if (!sku || qtyKeluar <= 0) {
      return;
    }

    var product = productIndex[sku] || null;
    var namaProduk = product ? product.Nama_Produk : String(row.Nama_Produk || sku);
    var kategori = product ? String(product.Kategori || 'Tanpa Kategori') : 'Tanpa Kategori';
    var hargaModalAktif = product ? toNumber_(product.Harga_Modal) : 0;
    var revenue = resolveMarketplaceRevenueForReporting_(row, qtyKeluar);

    summary.ordersCount += 1;
    summary.revenue += revenue;
    summary.productRevenue += revenue;
    summary.unitsSold += qtyKeluar;
    summary.estimatedCogs += qtyKeluar * hargaModalAktif;

    if (!itemMap[sku]) {
      itemMap[sku] = {
        sku: sku,
        namaProduk: namaProduk,
        kategori: kategori,
        qty: 0,
        revenue: 0,
        orderCount: 0
      };
    }

    itemMap[sku].qty += qtyKeluar;
    itemMap[sku].revenue += revenue;
    itemMap[sku].orderCount += 1;

    if (!categoryMap[kategori]) {
      categoryMap[kategori] = {
        kategori: kategori,
        qty: 0,
        revenue: 0,
        orderCount: 0
      };
    }

    categoryMap[kategori].qty += qtyKeluar;
    categoryMap[kategori].revenue += revenue;
    categoryMap[kategori].orderCount += 1;
  });
}

function resolveMarketplaceRevenueForReporting_(row, qtyKeluar) {
  var totalPenjualan = toNumber_(row.Total_Penjualan);
  if (totalPenjualan > 0) {
    return totalPenjualan;
  }

  return qtyKeluar * toNumber_(row.Harga_Jual_Satuan);
}

function buildStockInSummary_(startDate, endDate) {
  var rows = getSheetRowsForReporting_(SHEETS.STOCK_IN);
  var aggregateMap = {};
  var totalQty = 0;

  rows.forEach(function(row) {
    var tanggal = coerceDate_(row.Tanggal);
    if (!tanggal || !isDateWithinRange_(tanggal, startDate, endDate)) {
      return;
    }

    var sku = String(row.SKU || '').trim().toUpperCase();
    var qtyMasuk = toNumber_(row.Qty_Masuk);
    var totalModal = toNumber_(row.Total_Modal_Masuk);

    if (!sku || qtyMasuk <= 0) {
      return;
    }

    totalQty += qtyMasuk;

    if (!aggregateMap[sku]) {
      aggregateMap[sku] = {
        sku: sku,
        namaProduk: row.Nama_Produk || '',
        qty: 0,
        totalModal: 0,
        transactionCount: 0
      };
    }

    aggregateMap[sku].qty += qtyMasuk;
    aggregateMap[sku].totalModal += totalModal;
    aggregateMap[sku].transactionCount += 1;
  });

  return {
    totalQty: totalQty,
    rows: sortObjectValues_(aggregateMap, ['qty', 'totalModal', 'sku']).slice(0, REPORTING_TOP_LIMIT)
  };
}

function buildStockOutNonOrderSummary_(startDate, endDate) {
  var rows = getSheetRowsForReporting_(SHEETS.STOCK_OUT);
  var aggregateMap = {};
  var totalQty = 0;

  rows.forEach(function(row) {
    var tanggal = coerceDate_(row.Tanggal);
    var jenisKeluar = normalizeString_(row.Jenis_Keluar);
    if (!tanggal || !isDateWithinRange_(tanggal, startDate, endDate) || jenisKeluar === 'ORDER') {
      return;
    }

    var sku = String(row.SKU || '').trim().toUpperCase();
    var qtyKeluar = toNumber_(row.Qty_Keluar);
    var compositeKey = sku + '|' + jenisKeluar;

    if (!sku || qtyKeluar <= 0) {
      return;
    }

    totalQty += qtyKeluar;

    if (!aggregateMap[compositeKey]) {
      aggregateMap[compositeKey] = {
        sku: sku,
        namaProduk: row.Nama_Produk || '',
        jenisKeluar: jenisKeluar,
        qty: 0,
        transactionCount: 0,
        totalPenjualan: 0
      };
    }

    aggregateMap[compositeKey].qty += qtyKeluar;
    aggregateMap[compositeKey].transactionCount += 1;
    aggregateMap[compositeKey].totalPenjualan += toNumber_(row.Total_Penjualan);
  });

  return {
    totalQty: totalQty,
    rows: sortObjectValues_(aggregateMap, ['qty', 'totalPenjualan', 'sku']).slice(0, REPORTING_TOP_LIMIT)
  };
}

function buildCriticalProductsForPeriod_(startDate, endDate, productIndex) {
  var rows = getSheetRowsForReporting_(SHEETS.INVENTORY_LOG);
  var criticalMap = {};

  rows.forEach(function(row) {
    var timestamp = coerceDate_(row.Timestamp);
    var sku = String(row.SKU || '').trim().toUpperCase();
    var product = productIndex[sku] || null;
    if (!timestamp || !sku || !product || !isDateWithinRange_(timestamp, startDate, endDate)) {
      return;
    }

    var minimumStok = getMinimumStockThreshold_(product.Minimum_Stok);
    var stokSesudah = toNumber_(row.Stok_Sesudah);
    if (stokSesudah > minimumStok) {
      return;
    }

    criticalMap[sku] = {
      sku: sku,
      namaProduk: product.Nama_Produk || row.Nama_Produk || sku,
      stokSesudah: stokSesudah,
      minimumStok: minimumStok,
      statusStok: computeStatusStok_(stokSesudah, minimumStok),
      lastEvent: formatTimestampJakarta_(timestamp)
    };
  });

  return Object.keys(criticalMap)
    .map(function(key) {
      return criticalMap[key];
    })
    .sort(function(left, right) {
      if (left.stokSesudah !== right.stokSesudah) {
        return left.stokSesudah - right.stokSesudah;
      }

      return left.sku.localeCompare(right.sku);
    })
    .slice(0, REPORTING_TOP_LIMIT);
}

function buildLowestStockProducts_(activeProducts) {
  return activeProducts
    .map(function(product) {
      return {
        sku: String(product.SKU || '').trim().toUpperCase(),
        namaProduk: product.Nama_Produk || '',
        stokAktif: toNumber_(product.Stok_Aktif),
        minimumStok: getMinimumStockThreshold_(product.Minimum_Stok),
        statusStok: product.Status_Stok || '',
        lastUpdated: product.Last_Updated ? formatTimestampJakarta_(new Date(product.Last_Updated)) : ''
      };
    })
    .sort(function(left, right) {
      if (left.stokAktif !== right.stokAktif) {
        return left.stokAktif - right.stokAktif;
      }

      if (left.minimumStok !== right.minimumStok) {
        return left.minimumStok - right.minimumStok;
      }

      return left.sku.localeCompare(right.sku);
    });
}

function buildRestockProducts_(activeProducts) {
  return activeProducts
    .filter(function(product) {
      var status = normalizeString_(product.Status_Stok);
      return status === 'LOW' || status === 'OUT OF STOCK';
    })
    .map(function(product) {
      var stokAktif = toNumber_(product.Stok_Aktif);
      var minimumStok = getMinimumStockThreshold_(product.Minimum_Stok);
      var statusStok = product.Status_Stok || '';

      return {
        sku: String(product.SKU || '').trim().toUpperCase(),
        namaProduk: product.Nama_Produk || '',
        stokAktif: stokAktif,
        minimumStok: minimumStok,
        statusStok: statusStok,
        restockGap: computeRestockGap_(stokAktif, minimumStok, statusStok)
      };
    })
    .sort(function(left, right) {
      var severityCompare = getStatusSeverity_(left.statusStok) - getStatusSeverity_(right.statusStok);
      if (severityCompare !== 0) {
        return severityCompare;
      }

      if (right.restockGap !== left.restockGap) {
        return right.restockGap - left.restockGap;
      }

      return left.sku.localeCompare(right.sku);
    });
}

function buildRecentInventoryActivities_(limit) {
  return getSheetRowsForReporting_(SHEETS.INVENTORY_LOG)
    .filter(function(row) {
      return String(row.SKU || '').trim();
    })
    .map(function(row) {
      var timestamp = coerceDate_(row.Timestamp);
      return {
        sku: String(row.SKU || '').trim().toUpperCase(),
        namaProduk: row.Nama_Produk || '',
        tipeLog: row.Tipe_Log || '',
        qtyChange: toNumber_(row.Qty_Change),
        referenceId: row.Reference_ID || '',
        note: row.Note || '',
        timestamp: timestamp,
        timestampLabel: timestamp ? formatTimestampJakarta_(timestamp) : ''
      };
    })
    .sort(function(left, right) {
      return (right.timestamp ? right.timestamp.getTime() : 0) - (left.timestamp ? left.timestamp.getTime() : 0);
    })
    .slice(0, limit || REPORTING_ACTIVITY_LIMIT);
}

function buildOutOfStockTooLongProducts_(products, minimumDays, referenceDate) {
  var latestLogMap = buildLatestInventoryLogMap_();

  return products
    .filter(function(product) {
      return normalizeString_(product.Status_Produk) === 'AKTIF' && normalizeString_(product.Status_Stok) === 'OUT OF STOCK';
    })
    .map(function(product) {
      var sku = String(product.SKU || '').trim().toUpperCase();
      var latestLog = latestLogMap[sku] || null;
      var referencePoint = latestLog && latestLog.timestamp
        ? latestLog.timestamp
        : coerceDate_(product.Last_Updated);
      var ageDays = referencePoint
        ? Math.floor((startOfDay_(referenceDate).getTime() - startOfDay_(referencePoint).getTime()) / 86400000)
        : 0;

      return {
        sku: sku,
        namaProduk: product.Nama_Produk || '',
        daysOutOfStock: ageDays,
        lastEvent: referencePoint ? formatTimestampJakarta_(referencePoint) : '',
        note: latestLog && latestLog.note ? latestLog.note : 'Estimasi dari Last_Updated'
      };
    })
    .filter(function(item) {
      return item.daysOutOfStock >= minimumDays;
    })
    .sort(function(left, right) {
      return right.daysOutOfStock - left.daysOutOfStock;
    })
    .slice(0, REPORTING_TOP_LIMIT);
}

function createDashboardRow_(groupName, metricName, metricValue, metricFormat, refreshedAt, notes) {
  return [groupName, metricName, metricValue, metricFormat, refreshedAt, notes || ''];
}

function buildRankLabel_(rank, label) {
  return '#' + rank + ' ' + label;
}

function getReportMasterProducts_() {
  return getSheetRowsForReporting_(SHEETS.MASTER_PRODUCTS).filter(function(product) {
    return String(product.SKU || '').trim();
  });
}

function buildProductIndex_(products) {
  var productIndex = {};

  products.forEach(function(product) {
    var sku = String(product.SKU || '').trim().toUpperCase();
    if (sku) {
      productIndex[sku] = product;
    }
  });

  return productIndex;
}

function isActiveProduct_(product) {
  return normalizeString_(product.Status_Produk) === 'AKTIF';
}

function getOrderDateForReporting_(order) {
  return coerceDate_(order.Order_Date || order.Created_At);
}

function resolveOrderRevenue_(order) {
  var grandTotal = toNumber_(order.Grand_Total);
  if (grandTotal > 0) {
    return grandTotal;
  }

  return toNumber_(order.Subtotal) + toNumber_(order.Ongkir);
}

function resolveOrderProductRevenue_(order, fallbackRevenue) {
  var subtotal = toNumber_(order.Subtotal);
  if (subtotal > 0) {
    return subtotal;
  }

  return fallbackRevenue || 0;
}

function resolveOrderItemRevenue_(item, product, qty) {
  var subtotal = toNumber_(item.subtotal || item.Subtotal);
  if (subtotal > 0) {
    return subtotal;
  }

  var unitPrice = toNumber_(item.harga_jual_satuan || item.Harga_Jual_Satuan);
  if (unitPrice > 0) {
    return unitPrice * qty;
  }

  return product ? toNumber_(product.Harga_Jual) * qty : 0;
}

function parseOrderItemsForReporting_(itemJson) {
  if (!itemJson) {
    return [];
  }

  if (typeof parseOrderItemsFromJson_ === 'function') {
    return parseOrderItemsFromJson_(itemJson);
  }

  try {
    var parsed = JSON.parse(itemJson);
    return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeKeyValueBlock_(sheet, startRow, startColumn, title, rows) {
  var content = rows.length ? rows : [['', '']];

  sheet.getRange(startRow, startColumn).setValue(title);
  sheet.getRange(startRow + 1, startColumn, 1, 2).setValues([['Key', 'Value']]);
  sheet.getRange(startRow + 2, startColumn, content.length, 2).setValues(content);
  sheet.getRange(startRow, startColumn).setFontWeight('bold');
  sheet.getRange(startRow + 1, startColumn, 1, 2).setFontWeight('bold');
}

function writeTableBlock_(sheet, startRow, startColumn, title, headers, rows) {
  var content = [[title]];
  var width = headers.length;
  var safeRows = rows.length ? rows : [buildEmptyRow_(width)];

  content.push(headers);
  safeRows.forEach(function(row) {
    content.push(row);
  });

  sheet.getRange(startRow, startColumn, 1, 1).setValue(title).setFontWeight('bold');
  sheet.getRange(startRow + 1, startColumn, 1, width).setValues([headers]).setFontWeight('bold');
  sheet.getRange(startRow + 2, startColumn, safeRows.length, width).setValues(safeRows);
}

function clearReportDetailArea_(sheet) {
  var rowsToClear = Math.max(sheet.getMaxRows(), REPORTING_DETAIL_MIN_ROWS, sheet.getLastRow());
  ensureSheetCapacity_(sheet, rowsToClear, REPORTING_DETAIL_START_COLUMN + REPORTING_DETAIL_CLEAR_COLUMNS - 1);
  sheet
    .getRange(1, REPORTING_DETAIL_START_COLUMN, rowsToClear, REPORTING_DETAIL_CLEAR_COLUMNS)
    .clearContent();
}

function buildLatestInventoryLogMap_() {
  var map = {};

  getSheetRowsForReporting_(SHEETS.INVENTORY_LOG).forEach(function(row) {
    var sku = String(row.SKU || '').trim().toUpperCase();
    var timestamp = coerceDate_(row.Timestamp);

    if (!sku || !timestamp) {
      return;
    }

    if (!map[sku] || timestamp.getTime() > map[sku].timestamp.getTime()) {
      map[sku] = {
        timestamp: timestamp,
        note: row.Note || ''
      };
    }
  });

  return map;
}

function applyDashboardFormats_(sheet, rows) {
  rows.forEach(function(row, index) {
    var formatType = row[3];
    var targetRange = sheet.getRange(index + 2, 3);

    if (formatType === 'CURRENCY') {
      targetRange.setNumberFormat('"Rp" #,##0');
      return;
    }

    if (formatType === 'PERCENT') {
      targetRange.setNumberFormat('0.00%');
      return;
    }

    if (formatType === 'NUMBER') {
      targetRange.setNumberFormat('#,##0');
    }
  });
}

function findSummaryRowByKey_(sheet, keyHeader, keyValue) {
  var keyColumn = getColumnIndex_(sheet, keyHeader);
  var lastRow = Math.max(sheet.getLastRow(), 2);
  var values = sheet.getRange(2, keyColumn, lastRow - 1, 1).getValues();
  var normalizedKey = normalizeString_(keyValue);

  for (var index = 0; index < values.length; index += 1) {
    if (normalizeString_(values[index][0]) === normalizedKey) {
      return index + 2;
    }
  }

  return 0;
}

function getNextSummaryRow_(sheet) {
  var values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  var lastSummaryRow = 1;

  values.forEach(function(rowValue, index) {
    if (String(rowValue[0] || '').trim()) {
      lastSummaryRow = index + 2;
    }
  });

  return lastSummaryRow + 1;
}

function getSheetRowsForReporting_(sheetName) {
  if (typeof getSheetRows_ === 'function') {
    return getSheetRows_(sheetName);
  }

  var sheet = getSheetOrThrow_(sheetName);
  assertExpectedHeaders_(sheet);

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  return values.map(function(rowValues, index) {
    var rowObject = {
      __rowNumber: index + 2,
      __sheetName: sheetName
    };

    headers.forEach(function(header, columnIndex) {
      rowObject[String(header).trim()] = rowValues[columnIndex];
    });

    return rowObject;
  });
}

function sortObjectValues_(objectMap, fields) {
  return Object.keys(objectMap)
    .map(function(key) {
      return objectMap[key];
    })
    .sort(function(left, right) {
      var primaryField = fields[0];
      var secondaryField = fields[1];
      var tertiaryField = fields[2];

      if (secondaryField && toSortableValue_(right[primaryField]) !== toSortableValue_(left[primaryField])) {
        return toSortableValue_(right[primaryField]) - toSortableValue_(left[primaryField]);
      }

      if (secondaryField && toSortableValue_(right[secondaryField]) !== toSortableValue_(left[secondaryField])) {
        return toSortableValue_(right[secondaryField]) - toSortableValue_(left[secondaryField]);
      }

      if (tertiaryField) {
        return String(left[tertiaryField] || '').localeCompare(String(right[tertiaryField] || ''));
      }

      return 0;
    });
}

function toSortableValue_(value) {
  return typeof value === 'number' ? value : toNumber_(value);
}

function buildEmptyRow_(width) {
  var row = [];
  for (var index = 0; index < width; index += 1) {
    row.push('');
  }
  return row;
}

function computeRestockGap_(stokAktif, minimumStok, statusStok) {
  var normalizedStatus = normalizeString_(statusStok);
  var gap = Math.max(0, minimumStok - stokAktif);

  if (normalizedStatus === 'OUT OF STOCK' && gap === 0) {
    return 1;
  }

  return gap;
}

function getStatusSeverity_(statusStok) {
  var normalizedStatus = normalizeString_(statusStok);

  if (normalizedStatus === 'OUT OF STOCK') {
    return 0;
  }

  if (normalizedStatus === 'LOW') {
    return 1;
  }

  return 2;
}

function resolveNamedPeriod_(periodType, referenceDate) {
  var normalized = normalizeString_(periodType || 'WEEK');

  if (normalized === 'TODAY') {
    return {
      start: startOfDay_(referenceDate),
      end: endOfDay_(referenceDate)
    };
  }

  if (normalized === 'MONTH') {
    return getCurrentMonthRange_(referenceDate);
  }

  if (normalized === 'LAST_MONTH') {
    return getPreviousCompletedMonthRange_(referenceDate);
  }

  if (normalized === 'LAST_WEEK') {
    return getPreviousCompletedWeekRange_(referenceDate);
  }

  return getCurrentWeekRange_(referenceDate);
}

function getCurrentWeekRange_(referenceDate) {
  var startDate = getWeekStartMonday_(referenceDate);
  var endDate = endOfDay_(addDays_(startDate, 6));

  return {
    start: startDate,
    end: endDate
  };
}

function getPreviousCompletedWeekRange_(referenceDate) {
  var currentWeekStart = getWeekStartMonday_(referenceDate);
  var previousWeekStart = addDays_(currentWeekStart, -7);

  return {
    start: previousWeekStart,
    end: endOfDay_(addDays_(previousWeekStart, 6))
  };
}

function getCurrentMonthRange_(referenceDate) {
  var startDate = startOfMonth_(referenceDate);
  var endDate = endOfDay_(referenceDate);

  return {
    start: startDate,
    end: endDate
  };
}

function getPreviousCompletedMonthRange_(referenceDate) {
  var currentMonthStart = startOfMonth_(referenceDate);
  var previousMonthEnd = endOfDay_(addDays_(currentMonthStart, -1));
  var previousMonthStart = startOfMonth_(previousMonthEnd);

  return {
    start: previousMonthStart,
    end: previousMonthEnd
  };
}

function buildWeekKey_(dateValue) {
  var weekInfo = getIsoWeekInfo_(dateValue);
  return weekInfo.year + '-W' + Utilities.formatString('%02d', weekInfo.week);
}

function buildMonthKey_(dateValue) {
  return Utilities.formatDate(dateValue, APP_TIMEZONE, 'yyyy-MM');
}

function getIsoWeekInfo_(dateValue) {
  var date = startOfDay_(dateValue);
  var thursday = new Date(date.getTime());
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));

  var firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday = startOfDay_(firstThursday);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));

  return {
    year: thursday.getFullYear(),
    week: 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000)
  };
}

function getWeekStartMonday_(dateValue) {
  var date = startOfDay_(dateValue);
  var day = date.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return startOfDay_(date);
}

function startOfMonth_(dateValue) {
  var date = coerceDate_(dateValue) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function startOfDay_(dateValue) {
  var date = coerceDate_(dateValue) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay_(dateValue) {
  var date = coerceDate_(dateValue) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays_(dateValue, numberOfDays) {
  var date = coerceDate_(dateValue) || new Date();
  var nextDate = new Date(date.getTime());
  nextDate.setDate(nextDate.getDate() + numberOfDays);
  return nextDate;
}

function isDateWithinRange_(dateValue, startDate, endDate) {
  var timestamp = dateValue.getTime();
  return timestamp >= startDate.getTime() && timestamp <= endDate.getTime();
}

function coerceDate_(value) {
  if (!value) {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }

  var parsedDate = new Date(value);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatDateForReport_(dateValue) {
  return Utilities.formatDate(dateValue, APP_TIMEZONE, 'yyyy-MM-dd');
}

function ensureSheetCapacity_(sheet, minimumRows, minimumColumns) {
  var currentRows = sheet.getMaxRows();
  var currentColumns = sheet.getMaxColumns();

  if (currentRows < minimumRows) {
    sheet.insertRowsAfter(currentRows, minimumRows - currentRows);
  }

  if (currentColumns < minimumColumns) {
    sheet.insertColumnsAfter(currentColumns, minimumColumns - currentColumns);
  }
}

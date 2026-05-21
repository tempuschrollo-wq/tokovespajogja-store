/**
 * Refreshes ADMIN_SPACE from the operational source-of-truth sheets.
 */
function refreshAdminSpace() {
  var cfg = tvjConfig_();
  var adminCfg = getAdminSpaceConfig_();
  var adminSheet = getAdminSpaceSheet_(false);
  if (!adminSheet) {
    return notifyUser_('ADMIN_SPACE belum ada. Refresh ADMIN_SPACE dilewati.');
  }
  var products = getRowsAsObjects_(cfg.sheets.master);
  var stockInTotals = buildAdminSpaceStockTotalsBySku_(cfg.sheets.stockIn, 'SKU', 'Qty_Masuk');
  var stockOutTotals = buildAdminSpaceStockTotalsBySku_(cfg.sheets.stockOut, 'SKU', 'Qty_Keluar');
  var lastRow = adminSheet.getLastRow();

  if (lastRow >= adminCfg.masterStartRow) {
    adminSheet
      .getRange(adminCfg.masterStartRow, 1, lastRow - adminCfg.masterStartRow + 1, 10)
      .clearContent();
  }

  var output = [];
  for (var i = 0; i < products.length; i++) {
    var sku = normalizeSku_(products[i].SKU);
    if (sku === '') {
      continue;
    }
    output.push([
      String(products[i].Product_ID || '').trim(),
      sku,
      String(products[i].Nama_Produk || '').trim(),
      String(products[i].Kategori || '').trim(),
      stockInTotals[sku] || 0,
      stockOutTotals[sku] || 0,
      safeToNumber_(products[i].Stok_Aktif),
      safeToNumber_(products[i].Harga_Jual),
      safeToNumber_(products[i].Harga_Modal),
      String(products[i].Status_Produk || '').trim()
    ]);
  }

  if (output.length > 0) {
    adminSheet.getRange(adminCfg.masterStartRow, 1, output.length, 10).setValues(output);
  }

  var metrics = callIfFunctionExists_('getDashboardMetrics_', function() {
    var fallback = {
      totalSku: 0,
      totalProdukAktif: 0,
      low: 0,
      outOfStock: 0,
      omzetHariIni: 0,
      profitHariIni: 0
    };
    for (var p = 0; p < products.length; p++) {
      var productSku = normalizeSku_(products[p].SKU);
      if (productSku !== '') {
        fallback.totalSku++;
      }
      if (normalizeText_(products[p].Status_Produk) !== cfg.statuses.inactive) {
        fallback.totalProdukAktif++;
      }
      var status = normalizeText_(products[p].Status_Stok || calculateStockStatus_(products[p].Stok_Aktif, products[p].Minimum_Stok));
      if (status === cfg.statuses.low) {
        fallback.low++;
      } else if (status === cfg.statuses.outOfStock) {
        fallback.outOfStock++;
      }
    }
    return fallback;
  });

  var totalProduk = typeof metrics.totalSku !== 'undefined' ? metrics.totalSku : metrics.totalProdukAktif;
  adminSheet.getRange(2, 1, 2, 5).setValues([
    ['Total Produk', 'Low Stock', 'Out of Stock', 'Omzet Hari Ini', 'Profit Hari Ini'],
    [
      safeToNumber_(totalProduk),
      safeToNumber_(metrics.low),
      safeToNumber_(metrics.outOfStock),
      safeToNumber_(metrics.omzetHariIni),
      safeToNumber_(metrics.profitHariIni)
    ]
  ]);

  return notifyUser_('Refresh ADMIN_SPACE complete: ' + output.length + ' product row(s).');
}

/**
 * Processes checked ADMIN_SPACE submit rows while preserving the existing stock flow.
 */
function processAdminSpaceSubmits() {
  return withDocumentLock_(function() {
    var adminCfg = getAdminSpaceConfig_();
    var adminSheet = getAdminSpaceSheet_();
    var processed = 0;
    var synced = 0;
    var errors = [];

    try {
      synced = syncAdminMasterEditsToMasterUnlocked_();
    } catch (err) {
      errors.push('Sync ADMIN_SPACE master: ' + err.message);
    }

    var tasks = [
      {
        label: 'Stock correction',
        startRow: adminCfg.formRows.stockCorrection.startRow,
        endRow: adminCfg.formRows.stockCorrection.endRow,
        submitCol: adminCfg.columns.stockCorrection.submit,
        handler: handleAdminSpaceStockCorrectionRow_
      },
      {
        label: 'Add product',
        startRow: adminCfg.formRows.addProduct.startRow,
        endRow: adminCfg.formRows.addProduct.endRow,
        submitCol: adminCfg.columns.addProduct.submit,
        handler: handleAdminSpaceAddProductRow_
      },
      {
        label: 'Stock in',
        startRow: adminCfg.formRows.stockIn.startRow,
        endRow: adminCfg.formRows.stockIn.endRow,
        submitCol: adminCfg.columns.stockIn.submit,
        handler: handleAdminSpaceStockInRow_
      },
      {
        label: 'Stock out',
        startRow: adminCfg.formRows.stockOut.startRow,
        endRow: adminCfg.formRows.stockOut.endRow,
        submitCol: adminCfg.columns.stockOut.submit,
        handler: handleAdminSpaceStockOutRow_
      }
    ];

    for (var t = 0; t < tasks.length; t++) {
      for (var row = tasks[t].startRow; row <= tasks[t].endRow; row++) {
        var submitValue = adminSheet.getRange(row, tasks[t].submitCol).getValue();
        if (submitValue !== true && normalizeText_(submitValue) !== 'TRUE') {
          continue;
        }
        try {
          tasks[t].handler(adminSheet, row);
          processed++;
        } catch (err) {
          errors.push(tasks[t].label + ' row ' + row + ': ' + err.message);
        }
      }
    }

    try {
      refreshAdminSpace();
    } catch (err) {
      errors.push('Refresh ADMIN_SPACE: ' + err.message);
    }

    var message = 'Process ADMIN_SPACE submit: processed=' + processed + ', synced=' + synced + ', errors=' + errors.length;
    if (errors.length > 0) {
      message += '. First errors: ' + errors.slice(0, 10).join(' | ');
    }
    return notifyUser_(message);
  });
}

/**
 * Public menu action for syncing editable ADMIN_SPACE master rows.
 */
function syncAdminMasterEditsToMaster() {
  return withDocumentLock_(function() {
    var updated = syncAdminMasterEditsToMasterUnlocked_();
    refreshAdminSpace();
    return notifyUser_('Sync ADMIN_SPACE edits to MASTER_PRODUCTS complete: ' + updated + ' product row(s) updated.');
  });
}

/**
 * Syncs editable ADMIN_SPACE master fields back to MASTER_PRODUCTS by SKU.
 */
function syncAdminMasterEditsToMasterUnlocked_() {
  var adminCfg = getAdminSpaceConfig_();
  var adminSheet = getAdminSpaceSheet_();
  var productLookup = getProductLookupBySku_();
  var cols = adminCfg.columns.adminMaster;
  var lastRow = adminSheet.getLastRow();
  var updated = 0;

  if (lastRow < adminCfg.masterStartRow) {
    return 0;
  }

  var values = adminSheet
    .getRange(adminCfg.masterStartRow, 1, lastRow - adminCfg.masterStartRow + 1, 10)
    .getValues();

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var sku = normalizeSku_(row[cols.sku - 1]);
    if (sku === '' || !productLookup[sku]) {
      continue;
    }

    var productRef = productLookup[sku];
    var product = productRef.object;
    var updates = {};
    var priceChanged = false;
    var namaProduk = String(row[cols.namaProduk - 1] || '').trim();
    var kategori = String(row[cols.kategori - 1] || '').trim();
    var hargaJual = safeToNumber_(row[cols.hargaJual - 1]);
    var hargaModal = safeToNumber_(row[cols.hargaModal - 1]);
    var statusProduk = String(row[cols.statusProduk - 1] || '').trim();

    if (namaProduk !== String(product.Nama_Produk || '').trim()) {
      updates.Nama_Produk = namaProduk;
    }
    if (kategori !== String(product.Kategori || '').trim()) {
      updates.Kategori = kategori;
    }
    if (hargaJual !== safeToNumber_(product.Harga_Jual)) {
      updates.Harga_Jual = hargaJual;
      priceChanged = true;
    }
    if (hargaModal !== safeToNumber_(product.Harga_Modal)) {
      updates.Harga_Modal = hargaModal;
      priceChanged = true;
    }
    if (statusProduk !== String(product.Status_Produk || '').trim()) {
      updates.Status_Produk = statusProduk;
    }

    if (priceChanged) {
      var modalForMargin = updates.hasOwnProperty('Harga_Modal') ? updates.Harga_Modal : safeToNumber_(product.Harga_Modal);
      var jualForMargin = updates.hasOwnProperty('Harga_Jual') ? updates.Harga_Jual : safeToNumber_(product.Harga_Jual);
      updates.Margin_Rp = jualForMargin > 0 ? jualForMargin - modalForMargin : 0;
      updates.Margin_Persen = jualForMargin > 0 ? updates.Margin_Rp / jualForMargin : 0;
    }

    if (Object.keys(updates).length > 0) {
      updates.Last_Updated = new Date();
      updates.Updated_By = 'ADMIN_SPACE';
      updateRowByHeaders_(productRef.sheet, productRef.rowNumber, updates);
      updated++;
    }
  }

  return updated;
}

/**
 * Handles one ADMIN_SPACE stock-in submit row.
 */
function handleAdminSpaceStockInRow_(adminSheet, row) {
  var cfg = tvjConfig_();
  var cols = getAdminSpaceConfig_().columns.stockIn;
  var productOption = adminSheet.getRange(row, cols.productOption).getValue();
  var sku = normalizeSku_(adminSheet.getRange(row, cols.skuAuto).getValue()) || extractSkuFromProductOption_(productOption);
  var qty = safeToNumber_(adminSheet.getRange(row, cols.qty).getValue());
  var hargaModal = safeToNumber_(adminSheet.getRange(row, cols.hargaModal).getValue());
  var note = String(adminSheet.getRange(row, cols.note).getValue() || '').trim();
  var submit = adminSheet.getRange(row, cols.submit).getValue();

  if (submit !== true && normalizeText_(submit) !== 'TRUE') {
    return false;
  }

  if (sku === '') {
    throw new Error('SKU is required.');
  }
  if (qty <= 0) {
    throw new Error('Qty Masuk must be greater than zero.');
  }

  var productRef = getProductLookupBySku_()[sku];
  if (!productRef) {
    throw new Error('SKU not found in MASTER_PRODUCTS: ' + sku);
  }

  var inId = generateOperationalId_('IN');
  var appendedRow = appendObjectRow_(cfg.sheets.stockIn, {
    In_ID: inId,
    Tanggal: new Date(),
    SKU: sku,
    Nama_Produk: productRef.object.Nama_Produk || '',
    Qty_Masuk: qty,
    Harga_Modal_Satuan: hargaModal,
    Total_Modal_Masuk: qty * hargaModal,
    Supplier: 'ADMIN_SPACE',
    Catatan: note,
    Input_By: 'ADMIN_SPACE'
  });
  processStockInRowUnlocked_(getSheet_(cfg.sheets.stockIn, true), appendedRow, 'ADMIN_SPACE');

  clearAdminSpaceCells_(adminSheet, row, [cols.productOption, cols.qty, cols.hargaModal, cols.note]);
  setSubmitFalse_(adminSheet, row, cols.submit);
  return true;
}

/**
 * Handles one ADMIN_SPACE stock-out submit row.
 */
function handleAdminSpaceStockOutRow_(adminSheet, row) {
  var cfg = tvjConfig_();
  var cols = getAdminSpaceConfig_().columns.stockOut;
  var productOption = adminSheet.getRange(row, cols.productOption).getValue();
  var sku = normalizeSku_(adminSheet.getRange(row, cols.skuAuto).getValue()) || extractSkuFromProductOption_(productOption);
  var qty = safeToNumber_(adminSheet.getRange(row, cols.qty).getValue());
  var hargaJual = safeToNumber_(adminSheet.getRange(row, cols.hargaJual).getValue());
  var note = String(adminSheet.getRange(row, cols.note).getValue() || '').trim();
  var submit = adminSheet.getRange(row, cols.submit).getValue();

  if (submit !== true && normalizeText_(submit) !== 'TRUE') {
    return false;
  }

  if (sku === '') {
    throw new Error('SKU is required.');
  }
  if (qty <= 0) {
    throw new Error('Qty Keluar must be greater than zero.');
  }

  var productRef = getProductLookupBySku_()[sku];
  if (!productRef) {
    throw new Error('SKU not found in MASTER_PRODUCTS: ' + sku);
  }

  var outId = generateOperationalId_('OUT');
  var appendedRow = appendObjectRow_(cfg.sheets.stockOut, {
    Out_ID: outId,
    Tanggal: new Date(),
    SKU: sku,
    Nama_Produk: productRef.object.Nama_Produk || '',
    Jenis_Keluar: 'ADMIN_SPACE_MANUAL',
    Reference_ID: outId,
    Qty_Keluar: qty,
    Harga_Jual_Satuan: hargaJual,
    Total_Penjualan: qty * hargaJual,
    Catatan: note,
    Input_By: 'ADMIN_SPACE'
  });
  processStockOutRowUnlocked_(getSheet_(cfg.sheets.stockOut, true), appendedRow, 'ADMIN_SPACE');

  clearAdminSpaceCells_(adminSheet, row, [cols.productOption, cols.qty, cols.hargaJual, cols.note]);
  setSubmitFalse_(adminSheet, row, cols.submit);
  return true;
}

/**
 * Handles one ADMIN_SPACE stock correction submit row.
 */
function handleAdminSpaceStockCorrectionRow_(adminSheet, row) {
  var cols = getAdminSpaceConfig_().columns.stockCorrection;
  var productOption = adminSheet.getRange(row, cols.productOption).getValue();
  var sku = normalizeSku_(adminSheet.getRange(row, cols.skuAuto).getValue()) || extractSkuFromProductOption_(productOption);
  var qtyCorrection = safeToNumber_(adminSheet.getRange(row, cols.qty).getValue());
  var reason = String(adminSheet.getRange(row, cols.reason).getValue() || '').trim();
  var note = String(adminSheet.getRange(row, cols.note).getValue() || '').trim();
  var submit = adminSheet.getRange(row, cols.submit).getValue();

  if (submit !== true && normalizeText_(submit) !== 'TRUE') {
    return false;
  }

  if (sku === '') {
    throw new Error('SKU is required.');
  }
  if (qtyCorrection === 0) {
    throw new Error('Qty Koreksi cannot be zero.');
  }

  var productRef = getProductLookupBySku_()[sku];
  if (!productRef) {
    throw new Error('SKU not found in MASTER_PRODUCTS: ' + sku);
  }

  var product = productRef.object;
  var oldStock = safeToNumber_(product.Stok_Aktif);
  var newStock = oldStock + qtyCorrection;
  var allowNegative = callIfFunctionExists_('isNegativeStockAllowed_', false);
  if (newStock < 0 && !allowNegative) {
    throw new Error('Stock correction would make stock negative for ' + sku + '. Current=' + oldStock + ', correction=' + qtyCorrection);
  }

  updateProductStockFields_(productRef.sheet, productRef.rowNumber, newStock, {
    Status_Stok: calculateStockStatus_(newStock, product.Minimum_Stok),
    Last_Updated: new Date(),
    Updated_By: 'ADMIN_SPACE'
  });
  appendInventoryLog_({
    SKU: sku,
    Nama_Produk: product.Nama_Produk || extractNameFromProductOption_(productOption),
    Tipe_Log: 'STOCK_ADJUSTMENT',
    Qty_Change: qtyCorrection,
    Stok_Sebelum: oldStock,
    Stok_Sesudah: newStock,
    Reference_ID: generateOperationalId_('ADJ'),
    Note: 'ADMIN_SPACE | ' + reason + ' | ' + note,
    Actor: 'ADMIN_SPACE'
  });

  clearAdminSpaceCells_(adminSheet, row, [cols.productOption, cols.qty, cols.reason, cols.note]);
  setSubmitFalse_(adminSheet, row, cols.submit);
  return true;
}

/**
 * Handles one ADMIN_SPACE add-product submit row.
 */
function handleAdminSpaceAddProductRow_(adminSheet, row) {
  var cfg = tvjConfig_();
  var cols = getAdminSpaceConfig_().columns.addProduct;
  var name = String(adminSheet.getRange(row, cols.name).getValue() || '').trim();
  var category = String(adminSheet.getRange(row, cols.category).getValue() || '').trim();
  var hargaJual = safeToNumber_(adminSheet.getRange(row, cols.hargaJual).getValue());
  var hargaModal = safeToNumber_(adminSheet.getRange(row, cols.hargaModal).getValue());
  var stokAwal = safeToNumber_(adminSheet.getRange(row, cols.stokAwal).getValue());
  var submit = adminSheet.getRange(row, cols.submit).getValue();

  if (submit !== true && normalizeText_(submit) !== 'TRUE') {
    return false;
  }

  if (name === '') {
    throw new Error('Nama_Produk is required.');
  }
  if (stokAwal < 0) {
    throw new Error('Stok Awal cannot be negative.');
  }

  var productId = getNextAdminSpaceProductId_();
  var sku = getNextAdminSpaceSku_();
  var now = new Date();
  var minimumStock = safeToNumber_(getSettingValue_(cfg.settingsKeys.lowStockDefault, 1));
  if (minimumStock <= 0) {
    minimumStock = 1;
  }
  var marginRp = hargaJual > 0 ? hargaJual - hargaModal : 0;
  var marginPersen = hargaJual > 0 ? marginRp / hargaJual : 0;

  appendObjectRow_(cfg.sheets.master, {
    Product_ID: productId,
    SKU: sku,
    Nama_Produk: name,
    Kategori: category,
    Harga_Modal: hargaModal,
    Harga_Jual: hargaJual,
    Margin_Rp: marginRp,
    Margin_Persen: marginPersen,
    Stok_Aktif: 0,
    Minimum_Stok: minimumStock,
    Status_Stok: calculateStockStatus_(0, minimumStock),
    Status_Produk: cfg.statuses.active,
    Last_Updated: now,
    Updated_By: 'ADMIN_SPACE'
  });

  if (stokAwal > 0) {
    var inId = generateOperationalId_('IN');
    var stockInRow = appendObjectRow_(cfg.sheets.stockIn, {
      In_ID: inId,
      Tanggal: now,
      SKU: sku,
      Nama_Produk: name,
      Qty_Masuk: stokAwal,
      Harga_Modal_Satuan: hargaModal,
      Total_Modal_Masuk: stokAwal * hargaModal,
      Supplier: 'ADMIN_SPACE',
      Catatan: 'STOK_AWAL',
      Input_By: 'ADMIN_SPACE'
    });
    processStockInRowUnlocked_(getSheet_(cfg.sheets.stockIn, true), stockInRow, 'ADMIN_SPACE');
  }

  clearAdminSpaceCells_(adminSheet, row, [cols.name, cols.category, cols.hargaJual, cols.hargaModal, cols.stokAwal]);
  setSubmitFalse_(adminSheet, row, cols.submit);
  return true;
}

/**
 * Extracts the product name from a display option like "Name | SKU | Stok: 1".
 */
function extractNameFromProductOption_(text) {
  var parts = String(text || '').split('|');
  return String(parts[0] || '').trim();
}

/**
 * Extracts the SKU from a display option like "Name | SKU | Stok: 1".
 */
function extractSkuFromProductOption_(text) {
  var option = String(text || '');
  var parts = option.split('|');
  if (parts.length >= 2) {
    return normalizeSku_(parts[1]);
  }
  var match = option.match(/\bJVS-\d+\b/i);
  return match ? normalizeSku_(match[0]) : '';
}

/**
 * Clears selected cells on one ADMIN_SPACE row.
 */
function clearAdminSpaceCells_(sheet, row, columns) {
  for (var i = 0; i < columns.length; i++) {
    sheet.getRange(row, columns[i]).clearContent();
  }
}

/**
 * Clears a submit checkbox back to FALSE.
 */
function setSubmitFalse_(sheet, row, col) {
  sheet.getRange(row, col).setValue(false);
}

/**
 * Returns the next Product_ID using the configured product prefix.
 */
function getNextAdminSpaceProductId_() {
  var cfg = tvjConfig_();
  var prefix = cfg.productIdPrefix || 'PRD-JVS-';
  var rows = getRowsAsObjects_(cfg.sheets.master);
  var used = {};
  var maxNumber = 0;

  for (var i = 0; i < rows.length; i++) {
    var productId = String(rows[i].Product_ID || '').trim();
    if (productId === '') {
      continue;
    }
    used[productId] = true;
    if (productId.indexOf(prefix) === 0) {
      var suffix = productId.substring(prefix.length);
      if (/^\d+$/.test(suffix)) {
        maxNumber = Math.max(maxNumber, parseInt(suffix, 10));
      }
    }
  }

  var nextId = '';
  do {
    maxNumber++;
    var padded = String(maxNumber);
    while (padded.length < 4) {
      padded = '0' + padded;
    }
    nextId = prefix + padded;
  } while (used[nextId]);

  return nextId;
}

/**
 * Returns the next generated JVS SKU.
 */
function getNextAdminSpaceSku_() {
  var rows = getRowsAsObjects_(tvjConfig_().sheets.master);
  var prefix = 'JVS-';
  var used = {};
  var maxNumber = 0;

  for (var i = 0; i < rows.length; i++) {
    var sku = normalizeSku_(rows[i].SKU);
    if (sku === '') {
      continue;
    }
    used[sku] = true;
    if (sku.indexOf(prefix) === 0) {
      var suffix = sku.substring(prefix.length);
      if (/^\d+$/.test(suffix)) {
        maxNumber = Math.max(maxNumber, parseInt(suffix, 10));
      }
    }
  }

  var nextSku = '';
  do {
    maxNumber++;
    var padded = String(maxNumber);
    while (padded.length < 4) {
      padded = '0' + padded;
    }
    nextSku = prefix + padded;
  } while (used[nextSku]);

  return nextSku;
}

/**
 * Builds SKU totals from a stock transaction sheet.
 */
function buildAdminSpaceStockTotalsBySku_(sheetName, skuHeader, qtyHeader) {
  var sheet = getSheet_(sheetName, false);
  var totals = {};
  if (!sheet || sheet.getLastRow() < 2) {
    return totals;
  }

  var rows = getRowsAsObjects_(sheetName);
  for (var i = 0; i < rows.length; i++) {
    var sku = normalizeSku_(rows[i][skuHeader]);
    if (sku === '') {
      continue;
    }
    if (!totals[sku]) {
      totals[sku] = 0;
    }
    totals[sku] += safeToNumber_(rows[i][qtyHeader]);
  }
  return totals;
}

/**
 * Opens only configured ADMIN_SPACE input ranges while preserving formula/system protections.
 */
function unlockAdminSpaceEditableAreas() {
  var adminSheet = getAdminSpaceSheet_(false);
  if (!adminSheet) {
    return notifyUser_('ADMIN_SPACE belum ada. Tidak ada area yang dibuka.');
  }

  var editableRanges = getAdminSpaceEditableRanges_(adminSheet);
  var editableA1 = {};
  for (var i = 0; i < editableRanges.length; i++) {
    editableA1[editableRanges[i].getA1Notation()] = true;
  }

  var updatedSheetProtections = 0;
  var removedRangeProtections = 0;
  var sheetProtections = adminSheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (var s = 0; s < sheetProtections.length; s++) {
    if (!sheetProtections[s].canEdit()) {
      continue;
    }
    var existing = sheetProtections[s].getUnprotectedRanges();
    var merged = existing.slice();
    var existingA1 = {};
    for (var e = 0; e < existing.length; e++) {
      existingA1[existing[e].getA1Notation()] = true;
    }
    for (var r = 0; r < editableRanges.length; r++) {
      if (!existingA1[editableRanges[r].getA1Notation()]) {
        merged.push(editableRanges[r]);
      }
    }
    sheetProtections[s].setUnprotectedRanges(merged);
    updatedSheetProtections++;
  }

  var rangeProtections = adminSheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  for (var p = 0; p < rangeProtections.length; p++) {
    if (!rangeProtections[p].canEdit()) {
      continue;
    }
    var protectedRange = rangeProtections[p].getRange();
    if (isAdminSpaceEditableRange_(protectedRange, editableRanges)) {
      rangeProtections[p].remove();
      removedRangeProtections++;
    }
  }

  return notifyUser_(
    'ADMIN_SPACE input ranges dibuka: sheet protections updated=' +
      updatedSheetProtections +
      ', range protections removed=' +
      removedRangeProtections +
      '.'
  );
}

function getAdminSpaceEditableRanges_(sheet) {
  var adminCfg = getAdminSpaceConfig_();
  var ranges = [
    sheet.getRange(adminCfg.ranges.stockCorrection),
    sheet.getRange(adminCfg.ranges.addProduct),
    sheet.getRange(adminCfg.ranges.stockIn),
    sheet.getRange(adminCfg.ranges.stockOut)
  ];
  var lastRow = Math.max(sheet.getLastRow(), adminCfg.masterStartRow);
  var masterRows = lastRow - adminCfg.masterStartRow + 1;
  if (masterRows > 0) {
    ranges.push(sheet.getRange(adminCfg.masterStartRow, adminCfg.columns.adminMaster.namaProduk, masterRows, 2));
    ranges.push(sheet.getRange(adminCfg.masterStartRow, adminCfg.columns.adminMaster.hargaJual, masterRows, 3));
  }
  return ranges;
}

function isAdminSpaceEditableRange_(range, editableRanges) {
  for (var i = 0; i < editableRanges.length; i++) {
    if (rangeIsInside_(range, editableRanges[i])) {
      return true;
    }
  }
  return false;
}

function rangeIsInside_(candidate, container) {
  var row = candidate.getRow();
  var column = candidate.getColumn();
  var lastRow = row + candidate.getNumRows() - 1;
  var lastColumn = column + candidate.getNumColumns() - 1;
  var containerRow = container.getRow();
  var containerColumn = container.getColumn();
  var containerLastRow = containerRow + container.getNumRows() - 1;
  var containerLastColumn = containerColumn + container.getNumColumns() - 1;
  return row >= containerRow &&
    column >= containerColumn &&
    lastRow <= containerLastRow &&
    lastColumn <= containerLastColumn;
}

/**
 * Returns ADMIN_SPACE layout config, with a local fallback for older configs.
 */
function getAdminSpaceConfig_() {
  var cfg = tvjConfig_();
  if (cfg.adminSpace) {
    return cfg.adminSpace;
  }
  return {
    sheetName: cfg.sheets && cfg.sheets.adminSpace ? cfg.sheets.adminSpace : 'ADMIN_SPACE',
    masterStartRow: 20,
    formRows: {
      stockCorrection: { startRow: 7, endRow: 9 },
      addProduct: { startRow: 13, endRow: 15 },
      stockIn: { startRow: 7, endRow: 9 },
      stockOut: { startRow: 13, endRow: 15 }
    },
    ranges: {
      summary: 'A2:E3',
      stockCorrection: 'A7:F9',
      addProduct: 'A13:F15',
      stockIn: 'H7:M9',
      stockOut: 'H13:M15',
      masterProducts: 'A20:J'
    },
    columns: {
      stockCorrection: {
        productOption: 1,
        skuAuto: 2,
        qty: 3,
        reason: 4,
        note: 5,
        submit: 6
      },
      addProduct: {
        name: 1,
        category: 2,
        hargaJual: 3,
        hargaModal: 4,
        stokAwal: 5,
        submit: 6
      },
      stockIn: {
        productOption: 8,
        skuAuto: 9,
        qty: 10,
        hargaModal: 11,
        note: 12,
        submit: 13
      },
      stockOut: {
        productOption: 8,
        skuAuto: 9,
        qty: 10,
        hargaJual: 11,
        note: 12,
        submit: 13
      },
      adminMaster: {
        productId: 1,
        sku: 2,
        namaProduk: 3,
        kategori: 4,
        stokIn: 5,
        stokOut: 6,
        balance: 7,
        hargaJual: 8,
        hargaModal: 9,
        statusProduk: 10
      }
    }
  };
}

/**
 * Returns the ADMIN_SPACE sheet by configured name.
 */
function getAdminSpaceSheet_(required) {
  return getSheet_(getAdminSpaceConfig_().sheetName, required !== false);
}

/**
 * Calls a known helper by name only when it is available.
 */
function callIfFunctionExists_(name, fallback) {
  try {
    var fn = null;
    if (name === 'getDashboardMetrics_' && typeof getDashboardMetrics_ === 'function') {
      fn = getDashboardMetrics_;
    } else if (name === 'isNegativeStockAllowed_' && typeof isNegativeStockAllowed_ === 'function') {
      fn = isNegativeStockAllowed_;
    } else if (typeof this !== 'undefined' && typeof this[name] === 'function') {
      fn = this[name];
    }
    if (fn) {
      return fn();
    }
  } catch (err) {
    return typeof fallback === 'function' ? fallback(err) : fallback;
  }
  return typeof fallback === 'function' ? fallback() : fallback;
}

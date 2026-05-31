/**
 * Checks MASTER_PRODUCTS for common data quality issues.
 */
function validateMasterProducts() {
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.master, true);
  var missingHeaders = findMissingHeaders_(cfg.sheets.master, cfg.headers.MASTER_PRODUCTS);
  if (missingHeaders.length > 0) {
    return notifyUser_('MASTER_PRODUCTS missing headers: ' + missingHeaders.join(', '));
  }

  var rows = getRowsAsObjects_(cfg.sheets.master);
  var seenSku = {};
  var issues = [];
  var counts = {
    skippedEmptyRows: 0,
    missingSku: 0,
    duplicateSku: 0,
    missingName: 0,
    invalidHargaJual: 0,
    invalidHargaModal: 0,
    invalidStok: 0,
    missingProductId: 0
  };

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowNo = row._rowNumber;
    var sku = normalizeSku_(row.SKU);
    var namaProduk = String(row.Nama_Produk || '').trim();
    var statusProduk = normalizeText_(row.Status_Produk);
    var isInactive = statusProduk === cfg.statuses.inactive;
    var hargaJualBlank = row.Harga_Jual === null || typeof row.Harga_Jual === 'undefined' || String(row.Harga_Jual).trim() === '';
    var stokAktifBlank = row.Stok_Aktif === null || typeof row.Stok_Aktif === 'undefined' || String(row.Stok_Aktif).trim() === '';

    if (sku === '' && namaProduk === '') {
      counts.skippedEmptyRows++;
      continue;
    }

    if (sku === '') {
      counts.missingSku++;
      issues.push('Row ' + rowNo + ': missing SKU');
    } else if (seenSku[sku]) {
      counts.duplicateSku++;
      issues.push('Row ' + rowNo + ': duplicate SKU ' + sku);
    } else {
      seenSku[sku] = true;
    }
    if (namaProduk === '') {
      counts.missingName++;
      issues.push('Row ' + rowNo + ': missing Nama_Produk');
    }
    if (safeToNumber_(row.Harga_Modal) < 0) {
      counts.invalidHargaModal++;
      issues.push('Row ' + rowNo + ': invalid Harga_Modal');
    }
    if ((!hargaJualBlank && safeToNumber_(row.Harga_Jual) < 0) || (!isInactive && safeToNumber_(row.Harga_Jual) <= 0)) {
      counts.invalidHargaJual++;
      issues.push('Row ' + rowNo + ': invalid Harga_Jual');
    }
    if (!stokAktifBlank && safeToNumber_(row.Stok_Aktif) < 0) {
      counts.invalidStok++;
      issues.push('Row ' + rowNo + ': invalid Stok_Aktif');
    }
    if (String(row.Product_ID || '').trim() === '') {
      counts.missingProductId++;
      issues.push('Row ' + rowNo + ': missing Product_ID');
    }
  }

  var summary = 'Validate MASTER_PRODUCTS: ' + issues.length + ' issue(s). ' +
    'skipped empty rows=' + counts.skippedEmptyRows +
    ', missing SKU=' + counts.missingSku +
    ', duplicate SKU=' + counts.duplicateSku +
    ', missing name=' + counts.missingName +
    ', invalid Harga_Jual=' + counts.invalidHargaJual +
    ', invalid Harga_Modal=' + counts.invalidHargaModal +
    ', invalid Stok_Aktif=' + counts.invalidStok +
    ', missing Product_ID=' + counts.missingProductId;
  if (issues.length > 0) {
    summary += '. First issues: ' + issues.slice(0, 20).join(' | ');
  }
  return notifyUser_(summary);
}

/**
 * Generates Product_ID values for rows that are currently empty.
 */
function generateMissingProductIds() {
  return generateMissingProductIdsAndSkus_(false);
}

/**
 * Generates Product_ID and SKU values for rows that are currently empty.
 */
function generateMissingProductIdsAndSkus() {
  return generateMissingProductIdsAndSkus_(true);
}

function generateMissingProductIdsAndSkus_(includeSku) {
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.master, true);
  var map = getHeaderMap_(sheet);
  var productIdCol = requireColumn_(map, 'Product_ID', cfg.sheets.master);
  var skuCol = includeSku ? requireColumn_(map, 'SKU', cfg.sheets.master) : 0;
  var lastUpdatedCol = map.Last_Updated || 0;
  var updatedByCol = map.Updated_By || 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return notifyUser_(includeSku ? 'Generate Product_ID + SKU: no product rows.' : 'Generate Product_ID: no product rows.');
  }

  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var productIdPrefix = cfg.productIdPrefix || 'PRD-JVS-';
  var skuPrefix = 'JVS-';
  var usedProductIds = {};
  var usedSkus = {};
  var maxProductIdNumber = 0;
  var maxSkuNumber = 0;
  for (var i = 0; i < values.length; i++) {
    var existingProductId = String(values[i][productIdCol - 1] || '').trim();
    if (existingProductId !== '') {
      usedProductIds[existingProductId] = true;
      if (existingProductId.indexOf(productIdPrefix) === 0) {
        var productIdSuffix = parseInt(existingProductId.substring(productIdPrefix.length), 10);
        if (!isNaN(productIdSuffix) && productIdSuffix > maxProductIdNumber) {
          maxProductIdNumber = productIdSuffix;
        }
      }
    }

    if (includeSku) {
      var existingSku = normalizeSku_(values[i][skuCol - 1]);
      if (existingSku !== '') {
        usedSkus[existingSku] = true;
        if (existingSku.indexOf(skuPrefix) === 0) {
          var skuSuffix = parseInt(existingSku.substring(skuPrefix.length), 10);
          if (!isNaN(skuSuffix) && skuSuffix > maxSkuNumber) {
            maxSkuNumber = skuSuffix;
          }
        }
      }
    }
  }

  var generatedProductIds = 0;
  var generatedSkus = 0;
  var changedRows = 0;
  var now = new Date();
  for (var r = 0; r < values.length; r++) {
    var changed = false;
    if (String(values[r][productIdCol - 1] || '').trim() === '') {
      var nextId = '';
      do {
        maxProductIdNumber++;
        nextId = productIdPrefix + padNumber_(maxProductIdNumber, 4);
      } while (usedProductIds[nextId]);
      usedProductIds[nextId] = true;
      values[r][productIdCol - 1] = nextId;
      generatedProductIds++;
      changed = true;
    }

    if (includeSku && normalizeSku_(values[r][skuCol - 1]) === '') {
      var nextSku = '';
      do {
        maxSkuNumber++;
        nextSku = skuPrefix + padNumber_(maxSkuNumber, 4);
      } while (usedSkus[nextSku]);
      usedSkus[nextSku] = true;
      values[r][skuCol - 1] = nextSku;
      generatedSkus++;
      changed = true;
    }

    if (changed) {
      if (lastUpdatedCol) {
        values[r][lastUpdatedCol - 1] = now;
      }
      if (updatedByCol) {
        values[r][updatedByCol - 1] = 'SYSTEM';
      }
      changedRows++;
    }
  }

  if (generatedProductIds > 0) {
    sheet.getRange(2, productIdCol, values.length, 1).setValues(values.map(function(row) {
      return [row[productIdCol - 1]];
    }));
  }
  if (includeSku && generatedSkus > 0) {
    sheet.getRange(2, skuCol, values.length, 1).setValues(values.map(function(row) {
      return [row[skuCol - 1]];
    }));
  }
  if (changedRows > 0 && lastUpdatedCol) {
    sheet.getRange(2, lastUpdatedCol, values.length, 1).setValues(values.map(function(row) {
      return [row[lastUpdatedCol - 1]];
    }));
  }
  if (changedRows > 0 && updatedByCol) {
    sheet.getRange(2, updatedByCol, values.length, 1).setValues(values.map(function(row) {
      return [row[updatedByCol - 1]];
    }));
  }

  if (includeSku) {
    return notifyUser_(
      'Generate Product_ID + SKU: Product_ID=' +
        generatedProductIds +
        ', SKU=' +
        generatedSkus +
        ', row(s) updated=' +
        changedRows +
        '.'
    );
  }
  return notifyUser_('Generate Product_ID: ' + generatedProductIds + ' row(s) updated.');
}

/**
 * Recalculates product margin fields from Harga_Modal and Harga_Jual.
 */
function backfillProductMargins() {
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.master, true);
  var map = getHeaderMap_(sheet);
  var modalCol = requireColumn_(map, 'Harga_Modal', cfg.sheets.master);
  var jualCol = requireColumn_(map, 'Harga_Jual', cfg.sheets.master);
  var marginRpCol = requireColumn_(map, 'Margin_Rp', cfg.sheets.master);
  var marginPercentCol = requireColumn_(map, 'Margin_Persen', cfg.sheets.master);
  var lastUpdatedCol = map.Last_Updated || 0;
  var updatedByCol = map.Updated_By || 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return notifyUser_('Backfill margin produk: no product rows.');
  }

  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var marginRpValues = [];
  var marginPercentValues = [];
  var now = new Date();
  for (var i = 0; i < values.length; i++) {
    var hargaModal = safeToNumber_(values[i][modalCol - 1]);
    var hargaJual = safeToNumber_(values[i][jualCol - 1]);
    var marginRp = hargaJual > 0 ? hargaJual - hargaModal : 0;
    var marginPercent = hargaJual > 0 ? marginRp / hargaJual : 0;
    marginRpValues.push([marginRp]);
    marginPercentValues.push([marginPercent]);
  }
  sheet.getRange(2, marginRpCol, marginRpValues.length, 1).setValues(marginRpValues);
  sheet.getRange(2, marginPercentCol, marginPercentValues.length, 1).setValues(marginPercentValues);
  if (lastUpdatedCol) {
    sheet.getRange(2, lastUpdatedCol, values.length, 1).setValues(repeatedColumn_(now, values.length));
  }
  if (updatedByCol) {
    sheet.getRange(2, updatedByCol, values.length, 1).setValues(repeatedColumn_('SYSTEM', values.length));
  }
  return notifyUser_('Backfill margin produk: ' + values.length + ' product row(s) updated.');
}

/**
 * Recomputes stock statuses for all products.
 */
function recomputeAllStockStatus() {
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.master, true);
  var map = getHeaderMap_(sheet);
  var stockCol = requireColumn_(map, 'Stok_Aktif', cfg.sheets.master);
  var minCol = requireColumn_(map, 'Minimum_Stok', cfg.sheets.master);
  var statusStockCol = requireColumn_(map, 'Status_Stok', cfg.sheets.master);
  var statusProductCol = requireColumn_(map, 'Status_Produk', cfg.sheets.master);
  var lastUpdatedCol = map.Last_Updated || 0;
  var updatedByCol = map.Updated_By || 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return notifyUser_('Recompute Status_Stok: no product rows.');
  }

  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var stockStatuses = [];
  var productStatuses = [];
  var now = new Date();
  for (var i = 0; i < values.length; i++) {
    stockStatuses.push([calculateStockStatus_(values[i][stockCol - 1], values[i][minCol - 1])]);
    var existingStatus = normalizeText_(values[i][statusProductCol - 1]);
    productStatuses.push([existingStatus === cfg.statuses.inactive ? cfg.statuses.inactive : cfg.statuses.active]);
  }
  sheet.getRange(2, statusStockCol, stockStatuses.length, 1).setValues(stockStatuses);
  sheet.getRange(2, statusProductCol, productStatuses.length, 1).setValues(productStatuses);
  if (lastUpdatedCol) {
    sheet.getRange(2, lastUpdatedCol, values.length, 1).setValues(repeatedColumn_(now, values.length));
  }
  if (updatedByCol) {
    sheet.getRange(2, updatedByCol, values.length, 1).setValues(repeatedColumn_('SYSTEM', values.length));
  }
  return notifyUser_('Recompute Status_Stok: ' + values.length + ' product row(s) updated.');
}

/**
 * Processes the active selected row on STOCK_IN.
 */
function processActiveStockInRow() {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var activeSheet = getSpreadsheet_().getActiveSheet();
    if (!activeSheet || activeSheet.getName() !== cfg.sheets.stockIn) {
      throw new Error('Select an active row in STOCK_IN first.');
    }
    var row = activeSheet.getActiveRange().getRow();
    if (row <= 1) {
      throw new Error('Header row cannot be processed.');
    }
    var result = processStockInRowUnlocked_(activeSheet, row, 'MANUAL_MENU');
    return notifyUser_(result.message);
  });
}

/**
 * Processes the active selected row on STOCK_OUT.
 */
function processActiveStockOutRow() {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var activeSheet = getSpreadsheet_().getActiveSheet();
    if (!activeSheet || activeSheet.getName() !== cfg.sheets.stockOut) {
      throw new Error('Select an active row in STOCK_OUT first.');
    }
    var row = activeSheet.getActiveRange().getRow();
    if (row <= 1) {
      throw new Error('Header row cannot be processed.');
    }
    var result = processStockOutRowUnlocked_(activeSheet, row, 'MANUAL_MENU');
    return notifyUser_(result.message);
  });
}

/**
 * Processes every STOCK_IN row that has not yet been logged.
 */
function processAllPendingStockIn() {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var sheet = getSheet_(cfg.sheets.stockIn, true);
    var lastRow = sheet.getLastRow();
    var processed = 0;
    var skipped = 0;
    var errors = [];
    for (var row = 2; row <= lastRow; row++) {
      try {
        var rowObject = getRowObject_(sheet, row);
        var inId = ensureStockInIdUnlocked_(sheet, row, rowObject);
        if (inventoryReferenceExists_(inId, 'STOCK_IN')) {
          skipped++;
          continue;
        }
        processStockInRowUnlocked_(sheet, row, 'BULK_MENU');
        processed++;
      } catch (err) {
        errors.push('Row ' + row + ': ' + err.message);
      }
    }
    var message = 'Process pending STOCK_IN: processed=' + processed + ', skipped=' + skipped + ', errors=' + errors.length;
    if (errors.length > 0) {
      message += '. First errors: ' + errors.slice(0, 10).join(' | ');
    }
    return notifyUser_(message);
  });
}

/**
 * Processes every STOCK_OUT row that has not yet been logged.
 */
function processAllPendingStockOut() {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var sheet = getSheet_(cfg.sheets.stockOut, true);
    var lastRow = sheet.getLastRow();
    var processed = 0;
    var skipped = 0;
    var errors = [];
    for (var row = 2; row <= lastRow; row++) {
      try {
        var rowObject = getRowObject_(sheet, row);
        var outId = ensureStockOutIdUnlocked_(sheet, row, rowObject);
        var refId = String(rowObject.Reference_ID || '').trim();
        if (inventoryReferenceExists_(outId, 'STOCK_OUT') || isStockOutOrderReferenceProcessed_(rowObject, refId)) {
          skipped++;
          continue;
        }
        processStockOutRowUnlocked_(sheet, row, 'BULK_MENU');
        processed++;
      } catch (err) {
        errors.push('Row ' + row + ': ' + err.message);
      }
    }
    var message = 'Process pending STOCK_OUT: processed=' + processed + ', skipped=' + skipped + ', errors=' + errors.length;
    if (errors.length > 0) {
      message += '. First errors: ' + errors.slice(0, 10).join(' | ');
    }
    return notifyUser_(message);
  });
}

/**
 * Mutates stock upward from one STOCK_IN row. Caller must hold LockService.
 */
function processStockInRowUnlocked_(sheet, rowNumber, defaultActor, options) {
  var cfg = tvjConfig_();
  var row = options && options.rowObject ? options.rowObject : getRowObject_(sheet, rowNumber);
  var inId = ensureStockInIdUnlocked_(sheet, rowNumber, row);
  if (inventoryReferenceExists_(inId, 'STOCK_IN')) {
    return { skipped: true, message: 'STOCK_IN row ' + rowNumber + ' already processed: ' + inId };
  }
  var sku = normalizeSku_(row.SKU);
  var qty = safeToNumber_(row.Qty_Masuk);
  if (sku === '') {
    throw new Error('SKU is required.');
  }
  if (qty <= 0) {
    throw new Error('Qty_Masuk must be greater than zero.');
  }

  var productLookup = options && options.productLookup ? options.productLookup : getProductLookupBySku_();
  var productRef = productLookup[sku];
  if (!productRef) {
    throw new Error('SKU not found in MASTER_PRODUCTS: ' + sku);
  }
  var product = productRef.object;
  var oldStock = safeToNumber_(product.Stok_Aktif);
  var newStock = oldStock + qty;
  var namaProduk = String(row.Nama_Produk || product.Nama_Produk || '').trim();
  var actor = String(row.Input_By || defaultActor || 'SYSTEM').trim();
  var updates = {
    Nama_Produk: String(product.Nama_Produk || '').trim() === '' ? namaProduk : product.Nama_Produk,
    Status_Stok: calculateStockStatus_(newStock, product.Minimum_Stok),
    Status_Produk: normalizeText_(product.Status_Produk) === cfg.statuses.inactive ? cfg.statuses.inactive : cfg.statuses.active,
    Last_Updated: new Date(),
    Updated_By: actor
  };
  updateProductStockFields_(productRef.sheet, productRef.rowNumber, newStock, updates);
  updateCachedProductObject_(productRef, updates);

  appendInventoryLog_({
    SKU: sku,
    Nama_Produk: namaProduk,
    Tipe_Log: 'STOCK_IN',
    Qty_Change: qty,
    Stok_Sebelum: oldStock,
    Stok_Sesudah: newStock,
    Reference_ID: inId,
    Note: String(row.Catatan || row.Supplier || '').trim(),
    Actor: actor
  });
  return { skipped: false, message: 'STOCK_IN processed: ' + inId + ' / ' + sku + ' +' + qty };
}

/**
 * Mutates stock downward from one STOCK_OUT row. Caller must hold LockService.
 */
function processStockOutRowUnlocked_(sheet, rowNumber, defaultActor, options) {
  var cfg = tvjConfig_();
  var row = options && options.rowObject ? options.rowObject : getRowObject_(sheet, rowNumber);
  var outId = ensureStockOutIdUnlocked_(sheet, rowNumber, row);
  var refId = String(row.Reference_ID || '').trim();
  if (inventoryReferenceExists_(outId, 'STOCK_OUT') || isStockOutOrderReferenceProcessed_(row, refId)) {
    return { skipped: true, message: 'STOCK_OUT row ' + rowNumber + ' already processed: ' + outId };
  }
  var sku = normalizeSku_(row.SKU);
  var qty = safeToNumber_(row.Qty_Keluar);
  if (sku === '') {
    throw new Error('SKU is required.');
  }
  if (qty <= 0) {
    throw new Error('Qty_Keluar must be greater than zero.');
  }

  var productLookup = options && options.productLookup ? options.productLookup : getProductLookupBySku_();
  var productRef = productLookup[sku];
  if (!productRef) {
    throw new Error('SKU not found in MASTER_PRODUCTS: ' + sku);
  }
  var product = productRef.object;
  var oldStock = safeToNumber_(product.Stok_Aktif);
  var newStock = oldStock - qty;
  if (newStock < 0 && !isNegativeStockAllowed_()) {
    throw new Error('Insufficient stock for ' + sku + '. Current=' + oldStock + ', requested=' + qty);
  }
  var namaProduk = String(row.Nama_Produk || product.Nama_Produk || '').trim();
  var actor = String(row.Input_By || defaultActor || 'SYSTEM').trim();
  var logReference = outId;
  var updates = {
    Status_Stok: calculateStockStatus_(newStock, product.Minimum_Stok),
    Status_Produk: normalizeText_(product.Status_Produk) === cfg.statuses.inactive ? cfg.statuses.inactive : cfg.statuses.active,
    Last_Updated: new Date(),
    Updated_By: actor
  };
  updateProductStockFields_(productRef.sheet, productRef.rowNumber, newStock, updates);
  updateCachedProductObject_(productRef, updates);

  appendInventoryLog_({
    SKU: sku,
    Nama_Produk: namaProduk,
    Tipe_Log: 'STOCK_OUT',
    Qty_Change: -qty,
    Stok_Sebelum: oldStock,
    Stok_Sesudah: newStock,
    Reference_ID: logReference,
    Note: String(row.Jenis_Keluar || '') + ' ' + String(refId || '') + ' ' + String(row.Catatan || ''),
    Actor: actor
  });
  return { skipped: false, message: 'STOCK_OUT processed: ' + outId + ' / ' + sku + ' -' + qty };
}

/**
 * Protects website ORDER stock-out audit rows from being processed again.
 */
function isStockOutOrderReferenceProcessed_(rowObject, referenceId) {
  if (!referenceId) {
    return false;
  }
  var jenisKeluar = normalizeText_(rowObject.Jenis_Keluar);
  if (jenisKeluar !== 'ORDER' && jenisKeluar !== 'WEBSITE_ORDER') {
    return false;
  }
  return inventoryReferenceExists_(referenceId, 'STOCK_OUT');
}

/**
 * Writes stock-related product fields without relying on fixed columns.
 */
function updateProductStockFields_(sheet, rowNumber, newStock, extraFields) {
  var values = extraFields || {};
  values.Stok_Aktif = newStock;
  updateRowByHeaders_(sheet, rowNumber, values);
}

function updateCachedProductObject_(productRef, valuesByHeader) {
  if (!productRef || !productRef.object) {
    return;
  }
  for (var key in valuesByHeader) {
    if (valuesByHeader.hasOwnProperty(key)) {
      productRef.object[key] = valuesByHeader[key];
    }
  }
}

/**
 * Ensures a STOCK_IN row has an In_ID before it can be processed.
 */
function ensureStockInIdUnlocked_(sheet, rowNumber, rowObject) {
  var cfg = tvjConfig_();
  var inId = String(rowObject.In_ID || '').trim();
  if (inId !== '') {
    return inId;
  }
  inId = generateOperationalId_('IN');
  var map = getHeaderMap_(sheet);
  sheet.getRange(rowNumber, requireColumn_(map, 'In_ID', cfg.sheets.stockIn)).setValue(inId);
  rowObject.In_ID = inId;
  return inId;
}

/**
 * Ensures a STOCK_OUT row has an Out_ID before it can be processed.
 */
function ensureStockOutIdUnlocked_(sheet, rowNumber, rowObject) {
  var cfg = tvjConfig_();
  var outId = String(rowObject.Out_ID || '').trim();
  if (outId !== '') {
    return outId;
  }
  outId = generateOperationalId_('OUT');
  var map = getHeaderMap_(sheet);
  sheet.getRange(rowNumber, requireColumn_(map, 'Out_ID', cfg.sheets.stockOut)).setValue(outId);
  rowObject.Out_ID = outId;
  return outId;
}

/**
 * Returns whether negative stock is explicitly enabled in SETTINGS.
 */
function isNegativeStockAllowed_() {
  return isTruthySetting_(getSettingValue_(tvjConfig_().settingsKeys.allowNegativeStock, 'FALSE'));
}

/**
 * Builds repeated column values for batch setValues calls.
 */
function repeatedColumn_(value, count) {
  var values = [];
  for (var i = 0; i < count; i++) {
    values.push([value]);
  }
  return values;
}

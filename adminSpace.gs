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
  var masterStartCol = adminCfg.columns.adminMaster.productId;
  var masterColumnCount = getAdminSpaceMasterColumnCount_(adminCfg);

  if (lastRow >= adminCfg.masterStartRow) {
    adminSheet
      .getRange(adminCfg.masterStartRow, masterStartCol, lastRow - adminCfg.masterStartRow + 1, masterColumnCount)
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
    adminSheet.getRange(adminCfg.masterStartRow, masterStartCol, output.length, masterColumnCount).setValues(output);
    applyAdminMasterStatusDropdown_(adminSheet, adminCfg, output.length);
  }
  updateAdminSpaceInputNotes_(adminSheet, adminCfg);

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
  adminSheet.getRange(adminCfg.ranges.summary).setValues([
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
 * Pasang dropdown (data validation) AKTIF/NONAKTIF di kolom Status mirror MASTER.
 * Dipasang dari kode agar tidak hilang saat mirror di-regenerate tiap refreshAdminSpace.
 */
function applyAdminMasterStatusDropdown_(adminSheet, adminCfg, rowCount) {
  if (rowCount < 1) {
    return;
  }
  var cfg = tvjConfig_();
  var statusProdukCol = adminCfg.columns.adminMaster.statusProduk;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList([cfg.statuses.active, cfg.statuses.inactive], true)
    .setAllowInvalid(false)
    .build();
  adminSheet.getRange(adminCfg.masterStartRow, statusProdukCol, rowCount, 1).setDataValidation(rule);
}

/**
 * Processes checked ADMIN_SPACE submit rows while preserving the existing stock flow.
 */
function processAdminSpaceSubmits() {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var adminCfg = getAdminSpaceConfig_();
    var adminSheet = getAdminSpaceSheet_();
    var processed = 0;
    var synced = 0;
    var refreshedRows = 0;
    var errors = [];
    var productLookup = getProductLookupBySku_();

    try {
      synced = syncAdminMasterEditsToMasterUnlocked_(productLookup);
    } catch (err) {
      errors.push('Sync ADMIN_SPACE master: ' + err.message);
    }

    var context = {
      cfg: cfg,
      adminCfg: adminCfg,
      adminSheet: adminSheet,
      productLookup: productLookup,
      stockInAppend: buildAdminSpaceAppendContext_(getSheet_(cfg.sheets.stockIn, true)),
      stockOutAppend: buildAdminSpaceAppendContext_(getSheet_(cfg.sheets.stockOut, true)),
      masterAppend: buildAdminSpaceAppendContext_(getSheet_(cfg.sheets.master, true)),
      touchedSkus: {},
      stockInDeltaBySku: {},
      stockOutDeltaBySku: {}
    };

    var tasks = [
      {
        label: 'Stock correction',
        range: adminCfg.ranges.stockCorrection,
        columns: adminCfg.columns.stockCorrection,
        startRow: adminCfg.formRows.stockCorrection.startRow,
        endRow: adminCfg.formRows.stockCorrection.endRow,
        submitCol: adminCfg.columns.stockCorrection.submit,
        handler: handleAdminSpaceStockCorrectionRow_
      },
      {
        label: 'Add product',
        range: adminCfg.ranges.addProduct,
        columns: adminCfg.columns.addProduct,
        startRow: adminCfg.formRows.addProduct.startRow,
        endRow: adminCfg.formRows.addProduct.endRow,
        submitCol: adminCfg.columns.addProduct.submit,
        handler: handleAdminSpaceAddProductRow_
      },
      {
        label: 'Stock in',
        range: adminCfg.ranges.stockIn,
        columns: adminCfg.columns.stockIn,
        startRow: adminCfg.formRows.stockIn.startRow,
        endRow: adminCfg.formRows.stockIn.endRow,
        submitCol: adminCfg.columns.stockIn.submit,
        handler: handleAdminSpaceStockInRow_
      },
      {
        label: 'Stock out',
        range: adminCfg.ranges.stockOut,
        columns: adminCfg.columns.stockOut,
        startRow: adminCfg.formRows.stockOut.startRow,
        endRow: adminCfg.formRows.stockOut.endRow,
        submitCol: adminCfg.columns.stockOut.submit,
        handler: handleAdminSpaceStockOutRow_
      }
    ];

    for (var t = 0; t < tasks.length; t++) {
      var sectionRange = adminSheet.getRange(tasks[t].range);
      var sectionValues = sectionRange.getValues();
      var sectionStartRow = sectionRange.getRow();
      var sectionStartCol = sectionRange.getColumn();
      for (var r = 0; r < sectionValues.length; r++) {
        var row = sectionStartRow + r;
        if (row < tasks[t].startRow || row > tasks[t].endRow) {
          continue;
        }
        var rowValues = sectionValues[r];
        var submitValue = getAdminSpaceRowValue_(rowValues, sectionStartCol, tasks[t].submitCol);
        if (submitValue !== true && normalizeText_(submitValue) !== 'TRUE') {
          continue;
        }
        try {
          tasks[t].handler(adminSheet, row, context, rowValues, sectionStartCol);
          processed++;
        } catch (err) {
          errors.push(tasks[t].label + ' row ' + row + ': ' + err.message);
        }
      }
    }

    try {
      refreshedRows = refreshAdminSpaceAfterSubmit_(adminSheet, adminCfg, context);
    } catch (err) {
      errors.push('Refresh ADMIN_SPACE ringan: ' + err.message);
    }

    var message = 'Process ADMIN_SPACE submit: processed=' + processed + ', synced=' + synced + ', mirror_rows_refreshed=' + refreshedRows + ', errors=' + errors.length;
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
function syncAdminMasterEditsToMasterUnlocked_(productLookup) {
  var adminCfg = getAdminSpaceConfig_();
  var adminSheet = getAdminSpaceSheet_();
  productLookup = productLookup || getProductLookupBySku_();
  var cols = adminCfg.columns.adminMaster;
  var lastRow = adminSheet.getLastRow();
  var updated = 0;
  var masterStartCol = cols.productId;
  var masterColumnCount = getAdminSpaceMasterColumnCount_(adminCfg);

  if (lastRow < adminCfg.masterStartRow) {
    return 0;
  }

  var values = adminSheet
    .getRange(adminCfg.masterStartRow, masterStartCol, lastRow - adminCfg.masterStartRow + 1, masterColumnCount)
    .getValues();

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var sku = normalizeSku_(row[cols.sku - masterStartCol]);
    if (sku === '' || !productLookup[sku]) {
      continue;
    }

    var productRef = productLookup[sku];
    var product = productRef.object;
    var updates = {};
    var priceChanged = false;
    var namaProduk = String(row[cols.namaProduk - masterStartCol] || '').trim();
    var kategori = String(row[cols.kategori - masterStartCol] || '').trim();
    var hargaJual = safeToNumber_(row[cols.hargaJual - masterStartCol]);
    var hargaModal = safeToNumber_(row[cols.hargaModal - masterStartCol]);
    var statusProduk = String(row[cols.statusProduk - masterStartCol] || '').trim();

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
      updateCachedProductObject_(productRef, updates);
      updated++;
    }
  }

  return updated;
}

/**
 * Handles one ADMIN_SPACE stock-in submit row.
 */
function handleAdminSpaceStockInRow_(adminSheet, row, context, rowValues, rangeStartCol) {
  context = context || {};
  var cfg = context.cfg || tvjConfig_();
  var adminCfg = context.adminCfg || getAdminSpaceConfig_();
  var cols = adminCfg.columns.stockIn;
  var productOption = getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.productOption);
  var sku = normalizeSku_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.skuAuto)) || extractSkuFromProductOption_(productOption);
  var qty = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.qty));
  var hargaModalInput = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.hargaModal));
  var hargaJualInput = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.hargaJual));
  var submit = getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.submit);

  if (submit !== true && normalizeText_(submit) !== 'TRUE') {
    return false;
  }

  if (sku === '') {
    throw new Error('SKU is required.');
  }
  if (qty <= 0) {
    throw new Error('Qty Masuk must be greater than zero.');
  }

  var productLookup = context.productLookup || getProductLookupBySku_();
  var productRef = productLookup[sku];
  if (!productRef) {
    throw new Error('SKU not found in MASTER_PRODUCTS: ' + sku);
  }

  var inId = generateOperationalId_('IN');
  // STOCK_IN selalu menyimpan modal: pakai input HPP/Modal (D) bila diisi, else Harga_Modal produk.
  var hargaModal = hargaModalInput > 0 ? hargaModalInput : safeToNumber_(productRef.object.Harga_Modal);
  // Update MASTER_PRODUCTS bila HPP/Modal (D) atau Harga Jual (E) diisi & berbeda dari master.
  var priceUpdates = {};
  if (hargaModalInput > 0 && hargaModalInput !== safeToNumber_(productRef.object.Harga_Modal)) {
    priceUpdates.Harga_Modal = hargaModalInput;
  }
  if (hargaJualInput > 0 && hargaJualInput !== safeToNumber_(productRef.object.Harga_Jual)) {
    priceUpdates.Harga_Jual = hargaJualInput;
  }
  if (Object.keys(priceUpdates).length > 0) {
    var modalFinal = priceUpdates.hasOwnProperty('Harga_Modal') ? priceUpdates.Harga_Modal : safeToNumber_(productRef.object.Harga_Modal);
    var jualFinal = priceUpdates.hasOwnProperty('Harga_Jual') ? priceUpdates.Harga_Jual : safeToNumber_(productRef.object.Harga_Jual);
    priceUpdates.Margin_Rp = jualFinal > 0 ? jualFinal - modalFinal : 0;
    priceUpdates.Margin_Persen = jualFinal > 0 ? (jualFinal - modalFinal) / jualFinal : 0;
    priceUpdates.Last_Updated = new Date();
    priceUpdates.Updated_By = 'ADMIN_SPACE';
    updateRowByHeaders_(productRef.sheet, productRef.rowNumber, priceUpdates);
    updateCachedProductObject_(productRef, priceUpdates);
  }
  var stockInRow = {
    In_ID: inId,
    Tanggal: new Date(),
    SKU: sku,
    Nama_Produk: productRef.object.Nama_Produk || '',
    Qty_Masuk: qty,
    Harga_Modal_Satuan: hargaModal,
    Total_Modal_Masuk: qty * hargaModal,
    Supplier: 'ADMIN_SPACE',
    Catatan: '',
    Input_By: 'ADMIN_SPACE'
  };
  var appendedRow = appendAdminSpaceObjectRow_(context.stockInAppend, cfg.sheets.stockIn, stockInRow);
  stockInRow._rowNumber = appendedRow;
  processStockInRowUnlocked_(context.stockInAppend ? context.stockInAppend.sheet : getSheet_(cfg.sheets.stockIn, true), appendedRow, 'ADMIN_SPACE', {
    rowObject: stockInRow,
    productLookup: productLookup
  });
  markAdminSpaceStockDelta_(context, 'stockIn', sku, qty);

  clearAdminSpaceCells_(adminSheet, row, [cols.productOption, cols.qty, cols.hargaModal, cols.hargaJual]);
  setSubmitFalse_(adminSheet, row, cols.submit);
  return true;
}

/**
 * Handles one ADMIN_SPACE stock-out submit row.
 */
function handleAdminSpaceStockOutRow_(adminSheet, row, context, rowValues, rangeStartCol) {
  context = context || {};
  var cfg = context.cfg || tvjConfig_();
  var adminCfg = context.adminCfg || getAdminSpaceConfig_();
  var cols = adminCfg.columns.stockOut;
  var productOption = getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.productOption);
  var sku = normalizeSku_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.skuAuto)) || extractSkuFromProductOption_(productOption);
  var qty = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.qty));
  var hargaJualInput = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.hargaJual));
  var hargaModalInput = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.hargaModal));
  var submit = getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.submit);

  if (submit !== true && normalizeText_(submit) !== 'TRUE') {
    return false;
  }

  if (sku === '') {
    throw new Error('SKU is required.');
  }
  if (qty <= 0) {
    throw new Error('Qty Keluar must be greater than zero.');
  }

  var productLookup = context.productLookup || getProductLookupBySku_();
  var productRef = productLookup[sku];
  if (!productRef) {
    throw new Error('SKU not found in MASTER_PRODUCTS: ' + sku);
  }

  var outId = generateOperationalId_('OUT');
  // Harga Jual (K): diisi -> override; kosong -> Harga_Jual produk dari MASTER_PRODUCTS.
  // Kolom HPP/Modal (L) hanya konteks visual; tidak disimpan ke STOCK_OUT & tidak update MASTER.
  var hargaJual = hargaJualInput > 0 ? hargaJualInput : safeToNumber_(productRef.object.Harga_Jual);
  var stockOutRow = {
    Out_ID: outId,
    Tanggal: new Date(),
    SKU: sku,
    Nama_Produk: productRef.object.Nama_Produk || '',
    Jenis_Keluar: 'ADMIN_SPACE_MANUAL',
    Reference_ID: outId,
    Qty_Keluar: qty,
    Harga_Jual_Satuan: hargaJual,
    Total_Penjualan: qty * hargaJual,
    Catatan: '',
    Input_By: 'ADMIN_SPACE'
  };
  var appendedRow = appendAdminSpaceObjectRow_(context.stockOutAppend, cfg.sheets.stockOut, stockOutRow);
  stockOutRow._rowNumber = appendedRow;
  processStockOutRowUnlocked_(context.stockOutAppend ? context.stockOutAppend.sheet : getSheet_(cfg.sheets.stockOut, true), appendedRow, 'ADMIN_SPACE', {
    rowObject: stockOutRow,
    productLookup: productLookup
  });
  markAdminSpaceStockDelta_(context, 'stockOut', sku, qty);

  clearAdminSpaceCells_(adminSheet, row, [cols.productOption, cols.qty, cols.hargaJual, cols.hargaModal]);
  setSubmitFalse_(adminSheet, row, cols.submit);
  return true;
}

/**
 * Handles one ADMIN_SPACE stock correction submit row.
 */
function handleAdminSpaceStockCorrectionRow_(adminSheet, row, context, rowValues, rangeStartCol) {
  context = context || {};
  var adminCfg = context.adminCfg || getAdminSpaceConfig_();
  var cols = adminCfg.columns.stockCorrection;
  var productOption = getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.productOption);
  var sku = normalizeSku_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.skuAuto)) || extractSkuFromProductOption_(productOption);
  var qtyCorrection = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.qty));
  var reason = String(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.reason) || '').trim();
  var note = String(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.note) || '').trim();
  var submit = getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.submit);

  if (submit !== true && normalizeText_(submit) !== 'TRUE') {
    return false;
  }

  if (sku === '') {
    throw new Error('SKU is required.');
  }
  if (qtyCorrection === 0) {
    throw new Error('Qty Koreksi cannot be zero.');
  }

  var productLookup = context.productLookup || getProductLookupBySku_();
  var productRef = productLookup[sku];
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

  var updates = {
    Status_Stok: calculateStockStatus_(newStock, product.Minimum_Stok),
    Last_Updated: new Date(),
    Updated_By: 'ADMIN_SPACE'
  };
  updateProductStockFields_(productRef.sheet, productRef.rowNumber, newStock, updates);
  updateCachedProductObject_(productRef, updates);
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
  markAdminSpaceTouchedSku_(context, sku);

  clearAdminSpaceCells_(adminSheet, row, [cols.productOption, cols.qty, cols.reason, cols.note]);
  setSubmitFalse_(adminSheet, row, cols.submit);
  return true;
}

/**
 * Handles one ADMIN_SPACE add-product submit row.
 */
function handleAdminSpaceAddProductRow_(adminSheet, row, context, rowValues, rangeStartCol) {
  context = context || {};
  var cfg = context.cfg || tvjConfig_();
  var adminCfg = context.adminCfg || getAdminSpaceConfig_();
  var cols = adminCfg.columns.addProduct;
  var name = String(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.name) || '').trim();
  var category = String(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.category) || '').trim();
  var hargaJual = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.hargaJual));
  var hargaModal = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.hargaModal));
  var stokAwal = safeToNumber_(getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.stokAwal));
  var submit = getAdminSpaceRowCell_(adminSheet, row, rowValues, rangeStartCol, cols.submit);

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

  var productRow = {
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
  };
  var masterRow = appendAdminSpaceObjectRow_(context.masterAppend, cfg.sheets.master, productRow);
  productRow._rowNumber = masterRow;
  if (context.productLookup) {
    context.productLookup[sku] = {
      sheet: context.masterAppend ? context.masterAppend.sheet : getSheet_(cfg.sheets.master, true),
      rowNumber: masterRow,
      object: productRow
    };
  }

  if (stokAwal > 0) {
    var inId = generateOperationalId_('IN');
    var stockInObject = {
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
    };
    var stockInRow = appendAdminSpaceObjectRow_(context.stockInAppend, cfg.sheets.stockIn, stockInObject);
    stockInObject._rowNumber = stockInRow;
    processStockInRowUnlocked_(context.stockInAppend ? context.stockInAppend.sheet : getSheet_(cfg.sheets.stockIn, true), stockInRow, 'ADMIN_SPACE', {
      rowObject: stockInObject,
      productLookup: context.productLookup
    });
    markAdminSpaceStockDelta_(context, 'stockIn', sku, stokAwal);
  } else {
    markAdminSpaceTouchedSku_(context, sku);
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
  var ranges = [];
  for (var i = 0; i < columns.length; i++) {
    ranges.push(sheet.getRange(row, columns[i]).getA1Notation());
  }
  if (ranges.length > 0) {
    sheet.getRangeList(ranges).clearContent();
  }
}

/**
 * Clears a submit checkbox back to FALSE.
 */
function setSubmitFalse_(sheet, row, col) {
  sheet.getRange(row, col).setValue(false);
}

function getAdminSpaceRowValue_(rowValues, rangeStartCol, column) {
  return rowValues[column - rangeStartCol];
}

function getAdminSpaceRowCell_(sheet, row, rowValues, rangeStartCol, column) {
  if (rowValues) {
    return getAdminSpaceRowValue_(rowValues, rangeStartCol, column);
  }
  return sheet.getRange(row, column).getValue();
}

function buildAdminSpaceAppendContext_(sheet) {
  var lastColumn = sheet.getLastColumn();
  return {
    sheet: sheet,
    headers: sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
  };
}

function appendAdminSpaceObjectRow_(appendContext, sheetName, obj) {
  if (!appendContext) {
    return appendObjectRow_(sheetName, obj);
  }
  var row = [];
  for (var i = 0; i < appendContext.headers.length; i++) {
    var key = String(appendContext.headers[i] || '').trim();
    row.push(obj.hasOwnProperty(key) ? obj[key] : '');
  }
  appendContext.sheet.appendRow(row);
  return appendContext.sheet.getLastRow();
}

function markAdminSpaceTouchedSku_(context, sku) {
  if (!context || !context.touchedSkus) {
    return;
  }
  context.touchedSkus[sku] = true;
}

function markAdminSpaceStockDelta_(context, type, sku, qty) {
  markAdminSpaceTouchedSku_(context, sku);
  if (!context) {
    return;
  }
  var bucket = type === 'stockOut' ? context.stockOutDeltaBySku : context.stockInDeltaBySku;
  if (!bucket) {
    return;
  }
  bucket[sku] = safeToNumber_(bucket[sku]) + safeToNumber_(qty);
}

function refreshAdminSpaceAfterSubmit_(adminSheet, adminCfg, context) {
  updateAdminSpaceInputNotes_(adminSheet, adminCfg);
  var refreshedRows = refreshAdminSpaceTouchedMasterRows_(adminSheet, adminCfg, context);
  refreshAdminSpaceSummaryFromLookup_(adminSheet, adminCfg, context.productLookup);
  return refreshedRows;
}

function refreshAdminSpaceTouchedMasterRows_(adminSheet, adminCfg, context) {
  var touchedSkus = context && context.touchedSkus ? context.touchedSkus : {};
  var productLookup = context && context.productLookup ? context.productLookup : {};
  var skus = Object.keys(touchedSkus);
  if (skus.length === 0) {
    return 0;
  }

  var cols = adminCfg.columns.adminMaster;
  var startCol = cols.productId;
  var columnCount = getAdminSpaceMasterColumnCount_(adminCfg);
  var lastRow = Math.max(adminSheet.getLastRow(), adminCfg.masterStartRow - 1);
  var rowCount = lastRow >= adminCfg.masterStartRow ? lastRow - adminCfg.masterStartRow + 1 : 0;
  var mirrorBySku = {};
  var mirrorValues = [];

  if (rowCount > 0) {
    mirrorValues = adminSheet.getRange(adminCfg.masterStartRow, startCol, rowCount, columnCount).getValues();
    for (var i = 0; i < mirrorValues.length; i++) {
      var mirrorSku = normalizeSku_(mirrorValues[i][cols.sku - startCol]);
      if (mirrorSku !== '') {
        mirrorBySku[mirrorSku] = {
          rowNumber: adminCfg.masterStartRow + i,
          values: mirrorValues[i]
        };
      }
    }
  }

  var refreshed = 0;
  var nextAppendRow = Math.max(adminSheet.getLastRow() + 1, adminCfg.masterStartRow);
  var stockInDeltaBySku = context && context.stockInDeltaBySku ? context.stockInDeltaBySku : {};
  var stockOutDeltaBySku = context && context.stockOutDeltaBySku ? context.stockOutDeltaBySku : {};
  for (var s = 0; s < skus.length; s++) {
    var sku = skus[s];
    var productRef = productLookup[sku];
    if (!productRef) {
      continue;
    }
    var mirror = mirrorBySku[sku];
    var currentValues = mirror ? mirror.values : [];
    var stockInTotal = safeToNumber_(currentValues[cols.stokIn - startCol]) + safeToNumber_(stockInDeltaBySku[sku]);
    var stockOutTotal = safeToNumber_(currentValues[cols.stokOut - startCol]) + safeToNumber_(stockOutDeltaBySku[sku]);
    var output = buildAdminSpaceMasterOutputRow_(productRef.object, stockInTotal, stockOutTotal);
    var targetRow = mirror ? mirror.rowNumber : nextAppendRow++;
    adminSheet.getRange(targetRow, startCol, 1, columnCount).setValues([output]);
    refreshed++;
  }
  return refreshed;
}

function buildAdminSpaceMasterOutputRow_(product, stockInTotal, stockOutTotal) {
  return [
    String(product.Product_ID || '').trim(),
    normalizeSku_(product.SKU),
    String(product.Nama_Produk || '').trim(),
    String(product.Kategori || '').trim(),
    safeToNumber_(stockInTotal),
    safeToNumber_(stockOutTotal),
    safeToNumber_(product.Stok_Aktif),
    safeToNumber_(product.Harga_Jual),
    safeToNumber_(product.Harga_Modal),
    String(product.Status_Produk || '').trim()
  ];
}

function refreshAdminSpaceSummaryFromLookup_(adminSheet, adminCfg, productLookup) {
  var cfg = tvjConfig_();
  productLookup = productLookup || {};
  var metrics = {
    totalSku: 0,
    totalProdukAktif: 0,
    low: 0,
    outOfStock: 0
  };

  for (var sku in productLookup) {
    if (!productLookup.hasOwnProperty(sku)) {
      continue;
    }
    var product = productLookup[sku].object;
    metrics.totalSku++;
    if (normalizeText_(product.Status_Produk) !== cfg.statuses.inactive) {
      metrics.totalProdukAktif++;
    }
    var status = normalizeText_(product.Status_Stok || calculateStockStatus_(product.Stok_Aktif, product.Minimum_Stok));
    if (status === cfg.statuses.low) {
      metrics.low++;
    } else if (status === cfg.statuses.outOfStock) {
      metrics.outOfStock++;
    }
  }

  var existingSummary = adminSheet.getRange(adminCfg.ranges.summary).getValues();
  var omzetHariIni = existingSummary[1] ? existingSummary[1][3] : 0;
  var profitHariIni = existingSummary[1] ? existingSummary[1][4] : 0;
  adminSheet.getRange(adminCfg.ranges.summary).setValues([
    ['Total Produk', 'Low Stock', 'Out of Stock', 'Omzet Hari Ini', 'Profit Hari Ini'],
    [
      safeToNumber_(metrics.totalSku),
      safeToNumber_(metrics.low),
      safeToNumber_(metrics.outOfStock),
      omzetHariIni,
      profitHariIni
    ]
  ]);
}

function updateAdminSpaceInputNotes_(adminSheet, adminCfg) {
  var stockInRows = adminCfg.formRows.stockIn.endRow - adminCfg.formRows.stockIn.startRow + 1;
  var stockOutRows = adminCfg.formRows.stockOut.endRow - adminCfg.formRows.stockOut.startRow + 1;
  adminSheet
    .getRange(adminCfg.formRows.stockIn.startRow, adminCfg.columns.stockIn.hargaModal, stockInRows, 1)
    .setNote('HPP / Modal. Kosongkan untuk memakai Harga_Modal default dari MASTER_PRODUCTS. Isi untuk update Harga_Modal + margin produk saat barang masuk.');
  adminSheet
    .getRange(adminCfg.formRows.stockIn.startRow, adminCfg.columns.stockIn.hargaJual, stockInRows, 1)
    .setNote('Harga Jual. Kosongkan untuk tidak mengubah Harga Jual produk. Isi untuk update Harga_Jual + margin produk.');
  adminSheet
    .getRange(adminCfg.formRows.stockOut.startRow, adminCfg.columns.stockOut.hargaJual, stockOutRows, 1)
    .setNote('Harga Jual. Kosongkan untuk memakai Harga Jual default dari MASTER_PRODUCTS. Isi untuk diskon, harga offline, bundle, atau harga khusus (hanya transaksi ini).');
  adminSheet
    .getRange(adminCfg.formRows.stockOut.startRow, adminCfg.columns.stockOut.hargaModal, stockOutRows, 1)
    .setNote('HPP / Modal transaksi ini (opsional, catatan margin). Kosongkan untuk memakai Harga_Modal default.');
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
  var adminMasterCols = adminCfg.columns.adminMaster;
  var ranges = [
    sheet.getRange(adminCfg.ranges.stockCorrection),
    sheet.getRange(adminCfg.ranges.addProduct),
    sheet.getRange(adminCfg.ranges.stockIn),
    sheet.getRange(adminCfg.ranges.stockOut)
  ];
  var lastRow = Math.max(sheet.getLastRow(), adminCfg.masterStartRow);
  var masterRows = lastRow - adminCfg.masterStartRow + 1;
  if (masterRows > 0) {
    ranges.push(sheet.getRange(
      adminCfg.masterStartRow,
      adminMasterCols.namaProduk,
      masterRows,
      adminMasterCols.kategori - adminMasterCols.namaProduk + 1
    ));
    ranges.push(sheet.getRange(
      adminCfg.masterStartRow,
      adminMasterCols.hargaJual,
      masterRows,
      adminMasterCols.statusProduk - adminMasterCols.hargaJual + 1
    ));
  }
  return ranges;
}

function getAdminSpaceMasterColumnCount_(adminCfg) {
  var cols = adminCfg.columns.adminMaster;
  var maxColumn = 0;
  for (var key in cols) {
    if (cols.hasOwnProperty(key)) {
      maxColumn = Math.max(maxColumn, cols[key]);
    }
  }
  return maxColumn - cols.productId + 1;
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
    masterStartRow: 28,
    formRows: {
      stockIn: { startRow: 7, endRow: 16 },
      stockOut: { startRow: 7, endRow: 16 },
      stockCorrection: { startRow: 20, endRow: 22 },
      addProduct: { startRow: 20, endRow: 22 }
    },
    ranges: {
      summary: 'A2:E3',
      stockIn: 'A7:F16',
      stockOut: 'H7:M16',
      stockCorrection: 'A20:F22',
      addProduct: 'H20:M22',
      masterProducts: 'A28:J'
    },
    columns: {
      stockIn: {
        productOption: 1,
        skuAuto: 2,
        qty: 3,
        hargaModal: 4,
        hargaJual: 5,
        submit: 6
      },
      stockOut: {
        productOption: 8,
        skuAuto: 9,
        qty: 10,
        hargaJual: 11,
        hargaModal: 12,
        submit: 13
      },
      stockCorrection: {
        productOption: 1,
        skuAuto: 2,
        qty: 3,
        reason: 4,
        note: 5,
        submit: 6
      },
      addProduct: {
        name: 8,
        category: 9,
        hargaJual: 10,
        hargaModal: 11,
        stokAwal: 12,
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

function processStockInRowByNumber(rowNumber) {
  return withDocumentLock_(function() {
    var sheet = getSheetOrThrow_(SHEETS.STOCK_IN);
    assertExpectedHeaders_(sheet);

    if (rowNumber < 2) {
      throw new Error('Row STOCK_IN tidak valid: ' + rowNumber);
    }

    var rowObject = getRowObject_(sheet, rowNumber);
    if (isRowCompletelyEmpty_(rowObject, ['Tanggal', 'SKU', 'Qty_Masuk', 'Harga_Modal_Satuan'])) {
      throw new Error('Row STOCK_IN ' + rowNumber + ' kosong.');
    }

    validateStockInRowData_(rowObject, rowNumber);

    var inId = ensureTransactionId_(sheet, rowNumber, 'In_ID');
    if (inventoryLogExists_('STOCK_IN', inId)) {
      throw new Error('Transaksi STOCK_IN sudah pernah diproses: ' + inId);
    }

    var sku = String(rowObject.SKU).trim();
    var product = getProductBySku_(sku);
    var qtyMasuk = parsePositiveNumber_(rowObject.Qty_Masuk, 'Qty_Masuk');
    var hargaModalSatuan = parseNonNegativeNumber_(rowObject.Harga_Modal_Satuan, 'Harga_Modal_Satuan');
    var stockBefore = parseNonNegativeNumber_(product.Stok_Aktif, 'Stok_Aktif');
    var stockAfter = stockBefore + qtyMasuk;
    var actor = getCurrentActor_(rowObject.Input_By);
    var totalModalMasuk = qtyMasuk * hargaModalSatuan;

    setCellValueRespectFormula_(sheet, rowNumber, 'Nama_Produk', product.Nama_Produk);
    setCellValueRespectFormula_(sheet, rowNumber, 'Total_Modal_Masuk', totalModalMasuk);

    applyStockInToMasterProduct_(product, stockAfter, hargaModalSatuan, actor);

    writeInventoryLog_({
      Timestamp: new Date(),
      SKU: product.SKU,
      Nama_Produk: product.Nama_Produk,
      Tipe_Log: 'STOCK_IN',
      Qty_Change: qtyMasuk,
      Stok_Sebelum: stockBefore,
      Stok_Sesudah: stockAfter,
      Reference_ID: inId,
      Note: buildStockInNote_(rowObject),
      Actor: actor
    });

    showToast_('STOCK_IN berhasil diproses: ' + inId);

    return {
      In_ID: inId,
      SKU: product.SKU,
      Stock_Before: stockBefore,
      Stock_After: stockAfter
    };
  });
}

function processStockOutRowByNumber(rowNumber) {
  return withDocumentLock_(function() {
    var sheet = getSheetOrThrow_(SHEETS.STOCK_OUT);
    assertExpectedHeaders_(sheet);

    if (rowNumber < 2) {
      throw new Error('Row STOCK_OUT tidak valid: ' + rowNumber);
    }

    var rowObject = getRowObject_(sheet, rowNumber);
    if (isRowCompletelyEmpty_(rowObject, ['Tanggal', 'SKU', 'Jenis_Keluar', 'Qty_Keluar'])) {
      throw new Error('Row STOCK_OUT ' + rowNumber + ' kosong.');
    }

    validateStockOutRowData_(rowObject, rowNumber);

    var outId = ensureTransactionId_(sheet, rowNumber, 'Out_ID');
    if (inventoryLogExists_('STOCK_OUT', outId)) {
      throw new Error('Transaksi STOCK_OUT sudah pernah diproses: ' + outId);
    }

    var sku = String(rowObject.SKU).trim();
    var product = getProductBySku_(sku);
    var qtyKeluar = parsePositiveNumber_(rowObject.Qty_Keluar, 'Qty_Keluar');
    var jenisKeluar = validateEnumValue_('Jenis_Keluar', rowObject.Jenis_Keluar, ENUMS.JENIS_KELUAR);
    var stockBefore = parseNonNegativeNumber_(product.Stok_Aktif, 'Stok_Aktif');
    var actor = getCurrentActor_(rowObject.Input_By);
    var hargaJualSatuan = resolveStockOutHargaJualSatuan_(rowObject, product);
    var totalPenjualan = jenisKeluar === 'ORDER' ? qtyKeluar * hargaJualSatuan : 0;

    if (qtyKeluar > stockBefore) {
      throw new Error(
        'Stok tidak cukup untuk SKU ' +
          product.SKU +
          '. Stok aktif: ' +
          stockBefore +
          ', Qty_Keluar: ' +
          qtyKeluar
      );
    }

    setCellValueRespectFormula_(sheet, rowNumber, 'Nama_Produk', product.Nama_Produk);
    setCellValueRespectFormula_(sheet, rowNumber, 'Harga_Jual_Satuan', hargaJualSatuan);
    setCellValueRespectFormula_(sheet, rowNumber, 'Total_Penjualan', totalPenjualan);

    var stockAfter = stockBefore - qtyKeluar;
    applyStockOutToMasterProduct_(product, stockAfter, actor);

    writeInventoryLog_({
      Timestamp: new Date(),
      SKU: product.SKU,
      Nama_Produk: product.Nama_Produk,
      Tipe_Log: 'STOCK_OUT',
      Qty_Change: qtyKeluar * -1,
      Stok_Sebelum: stockBefore,
      Stok_Sesudah: stockAfter,
      Reference_ID: outId,
      Note: buildStockOutNote_(rowObject),
      Actor: actor
    });

    showToast_('STOCK_OUT berhasil diproses: ' + outId);

    return {
      Out_ID: outId,
      SKU: product.SKU,
      Stock_Before: stockBefore,
      Stock_After: stockAfter
    };
  });
}

function processPendingStockInRows() {
  var sheet = getSheetOrThrow_(SHEETS.STOCK_IN);
  assertExpectedHeaders_(sheet);

  var lastRow = sheet.getLastRow();
  var processedCount = 0;

  for (var rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    var rowObject = getRowObject_(sheet, rowNumber);
    if (!isStockInRowReady_(rowObject)) {
      continue;
    }

    var inId = rowObject.In_ID || ensureTransactionId_(sheet, rowNumber, 'In_ID');
    if (inventoryLogExists_('STOCK_IN', inId)) {
      continue;
    }

    processStockInRowByNumber(rowNumber);
    processedCount += 1;
  }

  showToast_('Pending STOCK_IN diproses: ' + processedCount + ' row');
  return processedCount;
}

function processPendingStockOutRows() {
  var sheet = getSheetOrThrow_(SHEETS.STOCK_OUT);
  assertExpectedHeaders_(sheet);

  var lastRow = sheet.getLastRow();
  var processedCount = 0;

  for (var rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    var rowObject = getRowObject_(sheet, rowNumber);
    if (!isStockOutRowReady_(rowObject)) {
      continue;
    }

    var outId = rowObject.Out_ID || ensureTransactionId_(sheet, rowNumber, 'Out_ID');
    if (inventoryLogExists_('STOCK_OUT', outId)) {
      continue;
    }

    processStockOutRowByNumber(rowNumber);
    processedCount += 1;
  }

  showToast_('Pending STOCK_OUT diproses: ' + processedCount + ' row');
  return processedCount;
}

function recomputeAllStockStatus() {
  return withDocumentLock_(function() {
    var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
    assertExpectedHeaders_(sheet);

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      showToast_('MASTER_PRODUCTS belum memiliki data.');
      return 0;
    }

    var updatedCount = 0;
    for (var rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      var product = getRowObject_(sheet, rowNumber);
      if (isRowCompletelyEmpty_(product, ['SKU', 'Nama_Produk'])) {
        continue;
      }

      var status = computeStatusStok_(product.Stok_Aktif, product.Minimum_Stok);
      if (setCellValueRespectFormula_(sheet, rowNumber, 'Status_Stok', status)) {
        updatedCount += 1;
      }
    }

    showToast_('Recompute Status_Stok selesai. Row diperbarui: ' + updatedCount);
    return updatedCount;
  });
}

function validateMasterProducts() {
  var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
  assertExpectedHeaders_(sheet);

  var lastRow = sheet.getLastRow();
  var issues = [];
  var skuSeen = {};
  var productIdSeen = {};

  for (var rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    var product = getRowObject_(sheet, rowNumber);
    if (isRowCompletelyEmpty_(product, ['Product_ID', 'SKU', 'Nama_Produk'])) {
      continue;
    }

    var productId = String(product.Product_ID || '').trim();
    var sku = String(product.SKU || '').trim();
    var statusProduk = String(product.Status_Produk || '').trim().toUpperCase();
    var hargaModal = toNumber_(product.Harga_Modal);
    var hargaJual = product.Harga_Jual === '' ? '' : toNumber_(product.Harga_Jual);
    var stokAktif = toNumber_(product.Stok_Aktif);
    var minimumStok = product.Minimum_Stok === '' ? '' : toNumber_(product.Minimum_Stok);

    if (!productId) {
      issues.push('Row ' + rowNumber + ': Product_ID wajib diisi.');
    } else if (productIdSeen[normalizeString_(productId)]) {
      issues.push('Row ' + rowNumber + ': Product_ID duplikat ' + productId);
    } else {
      productIdSeen[normalizeString_(productId)] = true;
    }

    if (!sku) {
      issues.push('Row ' + rowNumber + ': SKU wajib diisi.');
    } else if (skuSeen[normalizeString_(sku)]) {
      issues.push('Row ' + rowNumber + ': SKU duplikat ' + sku);
    } else {
      skuSeen[normalizeString_(sku)] = true;
    }

    if (!product.Nama_Produk) {
      issues.push('Row ' + rowNumber + ': Nama_Produk wajib diisi.');
    }

    if (hargaModal < 0) {
      issues.push('Row ' + rowNumber + ': Harga_Modal tidak boleh negatif.');
    }

    if (hargaJual !== '' && hargaJual < 0) {
      issues.push('Row ' + rowNumber + ': Harga_Jual tidak boleh negatif.');
    }

    if (stokAktif < 0) {
      issues.push('Row ' + rowNumber + ': Stok_Aktif tidak boleh negatif.');
    }

    if (minimumStok !== '' && minimumStok < 0) {
      issues.push('Row ' + rowNumber + ': Minimum_Stok tidak boleh negatif.');
    }

    if (statusProduk && ENUMS.STATUS_PRODUK.indexOf(statusProduk) === -1) {
      issues.push('Row ' + rowNumber + ': Status_Produk tidak valid (' + statusProduk + ').');
    }
  }

  if (issues.length) {
    throw new Error('validateMasterProducts menemukan masalah:\n- ' + issues.join('\n- '));
  }

  showToast_('MASTER_PRODUCTS valid.');
  return {
    ok: true,
    checkedRows: Math.max(0, lastRow - 1)
  };
}

function generateMissingProductIds() {
  return withDocumentLock_(function() {
    var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
    assertExpectedHeaders_(sheet);

    var lastRow = sheet.getLastRow();
    var generatedCount = 0;

    for (var rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      var product = getRowObject_(sheet, rowNumber);
      if (isRowCompletelyEmpty_(product, ['SKU', 'Nama_Produk'])) {
        continue;
      }

      if (!String(product.Product_ID || '').trim()) {
        var productId = generateUniqueId_('Product_ID');
        sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Product_ID')).setValue(productId);
        generatedCount += 1;
      }
    }

    showToast_('Product_ID berhasil dibuat: ' + generatedCount);
    return generatedCount;
  });
}

function backfillMargins() {
  return withDocumentLock_(function() {
    var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
    assertExpectedHeaders_(sheet);

    var lastRow = sheet.getLastRow();
    var updatedCount = 0;

    for (var rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      var product = getRowObject_(sheet, rowNumber);
      if (isRowCompletelyEmpty_(product, ['SKU', 'Nama_Produk'])) {
        continue;
      }

      var hargaModal = parseNonNegativeNumber_(product.Harga_Modal, 'Harga_Modal', true);
      var hargaJual = parseNonNegativeNumber_(product.Harga_Jual, 'Harga_Jual', true);
      var marginRp = '';
      var marginPersen = '';

      if (hargaModal !== '' && hargaJual !== '') {
        marginRp = hargaJual - hargaModal;
        marginPersen = hargaModal > 0 ? (hargaJual - hargaModal) / hargaModal : '';
      }

      if (setCellValueRespectFormula_(sheet, rowNumber, 'Margin_Rp', marginRp)) {
        updatedCount += 1;
      }
      setCellValueRespectFormula_(sheet, rowNumber, 'Margin_Persen', marginPersen);
    }

    showToast_('Backfill margin selesai. Row Margin_Rp diperbarui: ' + updatedCount);
    return updatedCount;
  });
}

function createSampleDataIfEmpty() {
  return withDocumentLock_(function() {
    assertExpectedHeaders_(SHEETS.SETTINGS);
    assertExpectedHeaders_(SHEETS.MASTER_PRODUCTS);

    var actor = getCurrentActor_();
    var created = {
      settings: 0,
      products: 0
    };

    if (!hasDataRows_(SHEETS.SETTINGS)) {
      var settingsRows = [
        [SETTINGS_KEYS.NAMA_TOKO, 'Toko Vespa Jogja', 'Nama toko utama'],
        [SETTINGS_KEYS.NO_WHATSAPP, '6288802500388', 'Nomor WhatsApp admin'],
        [SETTINGS_KEYS.URL_WEBSITE, 'https://example.com', 'URL website utama'],
        [SETTINGS_KEYS.URL_SHOPEE, '', 'URL Shopee'],
        [SETTINGS_KEYS.URL_TOKOPEDIA, '', 'URL Tokopedia'],
        [SETTINGS_KEYS.URL_INSTAGRAM, '', 'URL Instagram'],
        [SETTINGS_KEYS.URL_TIKTOK, '', 'URL TikTok'],
        [SETTINGS_KEYS.MATA_UANG, APP_CURRENCY, 'Mata uang operasional'],
        [SETTINGS_KEYS.ZONA_WAKTU, APP_TIMEZONE, 'Timezone operasional'],
        [SETTINGS_KEYS.LOW_STOCK_THRESHOLD_DEFAULT, 2, 'Default minimum stok'],
        [SETTINGS_KEYS.LAST_BACKUP_TIME, formatTimestampJakarta_(new Date()), 'Waktu backup terakhir']
      ];

      getSheetOrThrow_(SHEETS.SETTINGS)
        .getRange(2, 1, settingsRows.length, settingsRows[0].length)
        .setValues(settingsRows);
      created.settings = settingsRows.length;
    }

    if (!hasDataRows_(SHEETS.MASTER_PRODUCTS)) {
      var sampleProducts = [
        [
          generateUniqueId_('Product_ID'),
          'TVJ-SAMPLE-001',
          'Kabel Kopling Vespa Sprint',
          'Kaki-Kaki',
          'Sprint',
          'Sample produk untuk testing stock in/out',
          50000,
          75000,
          25000,
          0.5,
          10,
          2,
          'READY',
          'AKTIF',
          '',
          250,
          'RAK-A1',
          '',
          '',
          '',
          new Date(),
          actor
        ],
        [
          generateUniqueId_('Product_ID'),
          'TVJ-SAMPLE-002',
          'Kampas Rem Vespa PX',
          'Kaki-Kaki',
          'PX',
          'Sample produk kedua untuk testing inventory',
          30000,
          '',
          '',
          '',
          3,
          3,
          'LOW',
          'AKTIF',
          '',
          200,
          'RAK-A2',
          '',
          '',
          '',
          new Date(),
          actor
        ]
      ];

      getSheetOrThrow_(SHEETS.MASTER_PRODUCTS)
        .getRange(2, 1, sampleProducts.length, sampleProducts[0].length)
        .setValues(sampleProducts);
      created.products = sampleProducts.length;
    }

    showToast_(
      'Sample data selesai. SETTINGS: ' +
        created.settings +
        ', MASTER_PRODUCTS: ' +
        created.products
    );

    return created;
  });
}

function validateStockInRowData_(rowObject, rowNumber) {
  if (!rowObject.Tanggal) {
    throw new Error('Tanggal wajib diisi pada STOCK_IN row ' + rowNumber);
  }

  if (!String(rowObject.SKU || '').trim()) {
    throw new Error('SKU wajib diisi pada STOCK_IN row ' + rowNumber);
  }

  parsePositiveNumber_(rowObject.Qty_Masuk, 'Qty_Masuk');
  parseNonNegativeNumber_(rowObject.Harga_Modal_Satuan, 'Harga_Modal_Satuan');

  if (!findRowByValue_(SHEETS.MASTER_PRODUCTS, 'SKU', rowObject.SKU)) {
    throw new Error('SKU wajib ada di MASTER_PRODUCTS untuk STOCK_IN: ' + rowObject.SKU);
  }

  if (rowObject.In_ID) {
    assertUniqueValueInSheet_(SHEETS.STOCK_IN, 'In_ID', rowObject.In_ID, rowNumber);
  }
}

function validateStockOutRowData_(rowObject, rowNumber) {
  if (!rowObject.Tanggal) {
    throw new Error('Tanggal wajib diisi pada STOCK_OUT row ' + rowNumber);
  }

  if (!String(rowObject.SKU || '').trim()) {
    throw new Error('SKU wajib diisi pada STOCK_OUT row ' + rowNumber);
  }

  validateEnumValue_('Jenis_Keluar', rowObject.Jenis_Keluar, ENUMS.JENIS_KELUAR);
  parsePositiveNumber_(rowObject.Qty_Keluar, 'Qty_Keluar');
  parseNonNegativeNumber_(rowObject.Harga_Jual_Satuan, 'Harga_Jual_Satuan', true);

  if (!findRowByValue_(SHEETS.MASTER_PRODUCTS, 'SKU', rowObject.SKU)) {
    throw new Error('SKU wajib ada di MASTER_PRODUCTS untuk STOCK_OUT: ' + rowObject.SKU);
  }

  if (rowObject.Out_ID) {
    assertUniqueValueInSheet_(SHEETS.STOCK_OUT, 'Out_ID', rowObject.Out_ID, rowNumber);
  }
}

function applyStockInToMasterProduct_(product, stockAfter, hargaModalSatuan, actor) {
  var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
  var rowNumber = product.__rowNumber;

  sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Stok_Aktif')).setValue(stockAfter);
  sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Harga_Modal')).setValue(hargaModalSatuan);
  setCellValueRespectFormula_(sheet, rowNumber, 'Status_Stok', computeStatusStok_(stockAfter, product.Minimum_Stok));
  sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Last_Updated')).setValue(new Date());
  sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Updated_By')).setValue(actor);

  syncMasterProductComputedFields_(product.SKU);
}

function applyStockOutToMasterProduct_(product, stockAfter, actor) {
  var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
  var rowNumber = product.__rowNumber;

  if (stockAfter < 0) {
    throw new Error('Stok_Aktif tidak boleh minus untuk SKU ' + product.SKU);
  }

  sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Stok_Aktif')).setValue(stockAfter);
  setCellValueRespectFormula_(sheet, rowNumber, 'Status_Stok', computeStatusStok_(stockAfter, product.Minimum_Stok));
  sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Last_Updated')).setValue(new Date());
  sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Updated_By')).setValue(actor);

  syncMasterProductComputedFields_(product.SKU);
}

function resolveStockOutHargaJualSatuan_(rowObject, product) {
  if (rowObject.Harga_Jual_Satuan !== '' && rowObject.Harga_Jual_Satuan !== null && rowObject.Harga_Jual_Satuan !== undefined) {
    return parseNonNegativeNumber_(rowObject.Harga_Jual_Satuan, 'Harga_Jual_Satuan');
  }

  if (normalizeString_(rowObject.Jenis_Keluar) === 'ORDER') {
    return parseNonNegativeNumber_(product.Harga_Jual, 'Harga_Jual', true) || 0;
  }

  return 0;
}

function buildStockInNote_(rowObject) {
  var noteParts = [];

  if (rowObject.Supplier) {
    noteParts.push('Supplier: ' + rowObject.Supplier);
  }

  if (rowObject.Catatan) {
    noteParts.push('Catatan: ' + rowObject.Catatan);
  }

  return noteParts.join(' | ');
}

function buildStockOutNote_(rowObject) {
  var noteParts = ['Jenis_Keluar: ' + rowObject.Jenis_Keluar];

  if (rowObject.Referensi_ID) {
    noteParts.push('Referensi_ID: ' + rowObject.Referensi_ID);
  }

  if (rowObject.Catatan) {
    noteParts.push('Catatan: ' + rowObject.Catatan);
  }

  return noteParts.join(' | ');
}

function isStockInRowReady_(rowObject) {
  return Boolean(
    rowObject &&
      rowObject.Tanggal &&
      String(rowObject.SKU || '').trim() &&
      rowObject.Qty_Masuk !== '' &&
      rowObject.Harga_Modal_Satuan !== ''
  );
}

function isStockOutRowReady_(rowObject) {
  return Boolean(
    rowObject &&
      rowObject.Tanggal &&
      String(rowObject.SKU || '').trim() &&
      String(rowObject.Jenis_Keluar || '').trim() &&
      rowObject.Qty_Keluar !== ''
  );
}

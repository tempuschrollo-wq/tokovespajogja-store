var ADMIN_PRODUCT_FIELD_MAP = {
  nama_produk: 'Nama_Produk',
  kategori: 'Kategori',
  model_vespa: 'Model_Vespa',
  deskripsi_singkat: 'Deskripsi_Singkat',
  harga_modal: 'Harga_Modal',
  harga_jual: 'Harga_Jual',
  stok_aktif: 'Stok_Aktif',
  minimum_stok: 'Minimum_Stok',
  status_produk: 'Status_Produk',
  image_url: 'Image_URL',
  berat: 'Berat',
  lokasi_rak: 'Lokasi_Rak',
  marketplace_sku_shopee: 'Marketplace_SKU_Shopee',
  marketplace_sku_tokopedia: 'Marketplace_SKU_Tokopedia',
  marketplace_sku_tiktok: 'Marketplace_SKU_TikTok'
};

function apiAdminProductCreate_(payload, e) {
  requireAdminToken_(payload, e);

  return withDocumentLock_(function() {
    var sku = String(payload.sku || '').trim().toUpperCase();
    var namaProduk = String(payload.nama_produk || '').trim();
    var actor = getCurrentActor_(payload.updated_by || payload.actor || 'API_ADMIN');

    if (!sku) {
      throw apiError_('VALIDATION_ERROR', 'sku wajib diisi.', 400);
    }

    if (!namaProduk) {
      throw apiError_('VALIDATION_ERROR', 'nama_produk wajib diisi.', 400);
    }

    if (findRowByValue_(SHEETS.MASTER_PRODUCTS, 'SKU', sku)) {
      throw apiError_('DUPLICATE_SKU', 'SKU sudah ada di MASTER_PRODUCTS.', 409);
    }

    var hargaModal = parseNullableNumberForApi_(payload.harga_modal, 'harga_modal');
    var hargaJual = parseNullableNumberForApi_(payload.harga_jual, 'harga_jual');
    var stokAktif = parseNonNegativeInteger_(
      payload.stok_aktif === undefined ? 0 : payload.stok_aktif,
      'stok_aktif'
    );
    var minimumStok = parseNonNegativeInteger_(
      payload.minimum_stok === undefined || payload.minimum_stok === ''
        ? getMinimumStockThreshold_('')
        : payload.minimum_stok,
      'minimum_stok'
    );
    var statusProduk = payload.status_produk
      ? validateApiEnumValue_('status_produk', payload.status_produk, ENUMS.STATUS_PRODUK)
      : DEFAULT_VALUES.STATUS_PRODUK;
    var statusStok = computeStatusStok_(stokAktif, minimumStok);
    var marginRp = '';
    var marginPersen = '';

    if (hargaModal !== '' && hargaJual !== '') {
      marginRp = hargaJual - hargaModal;
      marginPersen = hargaModal > 0 ? (hargaJual - hargaModal) / hargaModal : '';
    }

    var rowObject = {
      Product_ID: generateUniqueId_('Product_ID'),
      SKU: sku,
      Nama_Produk: namaProduk,
      Kategori: payload.kategori || '',
      Model_Vespa: payload.model_vespa || '',
      Deskripsi_Singkat: payload.deskripsi_singkat || '',
      Harga_Modal: hargaModal === '' ? '' : hargaModal,
      Harga_Jual: hargaJual === '' ? '' : hargaJual,
      Margin_Rp: marginRp,
      Margin_Persen: marginPersen,
      Stok_Aktif: stokAktif,
      Minimum_Stok: minimumStok,
      Status_Stok: statusStok,
      Status_Produk: statusProduk,
      Image_URL: payload.image_url || '',
      Berat:
        payload.berat === '' || payload.berat === null || payload.berat === undefined
          ? ''
          : parseNullableNumberForApi_(payload.berat, 'berat'),
      Lokasi_Rak: payload.lokasi_rak || '',
      Marketplace_SKU_Shopee: payload.marketplace_sku_shopee || '',
      Marketplace_SKU_Tokopedia: payload.marketplace_sku_tokopedia || '',
      Marketplace_SKU_TikTok: payload.marketplace_sku_tiktok || '',
      Last_Updated: new Date(),
      Updated_By: actor
    };

    appendRowObject_(SHEETS.MASTER_PRODUCTS, rowObject);
    syncMasterProductComputedFields_(sku);

    return buildSuccessEnvelope_(
      'Produk berhasil dibuat.',
      {
        product: mapMasterProductToApi_(getProductBySku_(sku))
      },
      null
    );
  });
}

function apiAdminProductUpdate_(payload, e) {
  requireAdminToken_(payload, e);

  return withDocumentLock_(function() {
    var identifier = getProductIdentifierForApi_(payload);
    var product = null;

    if (identifier.productId) {
      product = findMasterProductByProductId_(identifier.productId);
    } else if (identifier.sku) {
      var skuRowNumber = findRowByValue_(SHEETS.MASTER_PRODUCTS, 'SKU', identifier.sku);
      product = skuRowNumber ? getRowObject_(SHEETS.MASTER_PRODUCTS, skuRowNumber) : null;
    }

    if (!product) {
      throw apiError_('NOT_FOUND', 'Produk tidak ditemukan untuk diupdate.', 404);
    }

    var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
    var rowNumber = product.__rowNumber;
    var actor = getCurrentActor_(payload.updated_by || payload.actor || 'API_ADMIN');
    var changedFields = [];
    var stockBefore = toNumber_(product.Stok_Aktif);
    var stockAfter = stockBefore;

    Object.keys(ADMIN_PRODUCT_FIELD_MAP).forEach(function(payloadKey) {
      if (!payload.hasOwnProperty(payloadKey)) {
        return;
      }

      var headerName = ADMIN_PRODUCT_FIELD_MAP[payloadKey];
      var nextValue = payload[payloadKey];

      if (payloadKey === 'harga_modal' || payloadKey === 'harga_jual' || payloadKey === 'berat') {
        nextValue = parseNullableNumberForApi_(nextValue, payloadKey);
      } else if (payloadKey === 'stok_aktif' || payloadKey === 'minimum_stok') {
        nextValue = parseNonNegativeInteger_(nextValue, payloadKey);
      } else if (payloadKey === 'status_produk') {
        nextValue = validateApiEnumValue_(payloadKey, nextValue, ENUMS.STATUS_PRODUK);
      } else {
        nextValue = nextValue === null || nextValue === undefined ? '' : String(nextValue).trim();
      }

      var currentValue = product[headerName];
      if (String(currentValue) === String(nextValue)) {
        return;
      }

      sheet.getRange(rowNumber, getColumnIndex_(sheet, headerName)).setValue(nextValue);
      changedFields.push(headerName);

      if (headerName === 'Stok_Aktif') {
        stockAfter = toNumber_(nextValue);
      }
    });

    if (!changedFields.length) {
      throw apiError_('NO_CHANGES', 'Tidak ada field yang berubah.', 400);
    }

    syncMasterProductComputedFields_(product.SKU);
    stampMasterProductUpdate_(product.SKU, actor);

    if (stockAfter !== stockBefore) {
      writeInventoryLog_({
        Timestamp: new Date(),
        SKU: product.SKU,
        Nama_Produk: product.Nama_Produk,
        Tipe_Log: stockAfter > stockBefore ? 'STOCK_IN' : 'STOCK_OUT',
        Qty_Change: stockAfter - stockBefore,
        Stok_Sebelum: stockBefore,
        Stok_Sesudah: stockAfter,
        Reference_ID: 'ADMIN_PRODUCT_UPDATE:' + (product.Product_ID || product.SKU),
        Note: 'Penyesuaian stok dari endpoint /admin/product/update',
        Actor: actor
      });
    }

    return buildSuccessEnvelope_(
      'Produk berhasil diperbarui.',
      {
        product: mapMasterProductToApi_(getProductBySku_(product.SKU)),
        changed_fields: changedFields
      },
      null
    );
  });
}

function apiAdminProductDelete_(payload, e) {
  requireAdminToken_(payload, e);

  return withDocumentLock_(function() {
    var identifier = getProductIdentifierForApi_(payload);
    var actor = getCurrentActor_(payload.actor || payload.updated_by || 'API_ADMIN');
    var forceDelete = payload.force_delete === true || String(payload.force_delete || '').toUpperCase() === 'TRUE';
    var product = null;

    if (identifier.productId) {
      product = findMasterProductByProductId_(identifier.productId);
    } else if (identifier.sku) {
      var rowNumberBySku = findRowByValue_(SHEETS.MASTER_PRODUCTS, 'SKU', identifier.sku);
      product = rowNumberBySku ? getRowObject_(SHEETS.MASTER_PRODUCTS, rowNumberBySku) : null;
    }

    if (!product) {
      throw apiError_('NOT_FOUND', 'Produk tidak ditemukan untuk dihapus.', 404);
    }

    var deleteCheck = validateProductDeletionSafety_(product.SKU);
    if (!forceDelete && !deleteCheck.allowed) {
      throw apiError_(
        'PRODUCT_DELETE_BLOCKED',
        'Produk tidak bisa dihapus permanen karena sudah punya riwayat transaksi. Pakai NONAKTIFKAN saja.',
        409,
        deleteCheck
      );
    }

    var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
    sheet.deleteRow(product.__rowNumber);

    return buildSuccessEnvelope_(
      'Produk berhasil dihapus permanen dari MASTER_PRODUCTS.',
      {
        deleted_product_id: product.Product_ID || '',
        deleted_sku: product.SKU || '',
        deleted_name: product.Nama_Produk || '',
        deleted_by: actor,
        force_delete: forceDelete,
        history_warning: forceDelete && !deleteCheck.allowed ? deleteCheck.reasons : []
      },
      null
    );
  });
}

function validateProductDeletionSafety_(sku) {
  var normalizedSku = normalizeString_(sku);
  var reasons = [];

  if (
    getSheetRows_(SHEETS.STOCK_IN).some(function(row) {
      return normalizeString_(row.SKU) === normalizedSku;
    })
  ) {
    reasons.push('SKU sudah tercatat di STOCK_IN');
  }

  if (
    getSheetRows_(SHEETS.STOCK_OUT).some(function(row) {
      return normalizeString_(row.SKU) === normalizedSku;
    })
  ) {
    reasons.push('SKU sudah tercatat di STOCK_OUT');
  }

  if (
    getSheetRows_(SHEETS.ORDERS_WEBSITE).some(function(row) {
      var skuList = String(row.SKU_List || '')
        .split(',')
        .map(function(item) {
          return normalizeString_(item);
        })
        .filter(Boolean);
      return skuList.indexOf(normalizedSku) !== -1;
    })
  ) {
    reasons.push('SKU sudah tercatat di ORDERS_WEBSITE');
  }

  return {
    allowed: reasons.length === 0,
    reasons: reasons
  };
}

function apiAdminStockIn_(payload, e) {
  requireAdminToken_(payload, e);

  return withDocumentLock_(function() {
    var result = createProcessedStockInTransaction_({
      sku: payload.sku,
      qty_masuk: payload.qty_masuk,
      harga_modal_satuan: payload.harga_modal_satuan,
      supplier: payload.supplier,
      catatan: payload.catatan,
      input_by: payload.input_by || payload.actor || 'API_ADMIN',
      tanggal: payload.tanggal
    });

    return buildSuccessEnvelope_('Stock in berhasil diproses.', result, null);
  });
}

function apiAdminStockOut_(payload, e) {
  requireAdminToken_(payload, e);

  return withDocumentLock_(function() {
    var result = createProcessedStockOutTransaction_({
      sku: payload.sku,
      qty_keluar: payload.qty_keluar,
      harga_jual_satuan: payload.harga_jual_satuan,
      jenis_keluar: payload.jenis_keluar,
      referensi_id: payload.referensi_id,
      catatan: payload.catatan,
      input_by: payload.input_by || payload.actor || 'API_ADMIN',
      tanggal: payload.tanggal
    });

    return buildSuccessEnvelope_('Stock out berhasil diproses.', result, null);
  });
}

function createProcessedStockInTransaction_(input) {
  assertExpectedHeaders_(SHEETS.STOCK_IN);

  var sku = String(input.sku || '').trim();
  if (!sku) {
    throw apiError_('VALIDATION_ERROR', 'sku wajib diisi.', 400);
  }

  var product = null;
  try {
    product = getProductBySku_(sku);
  } catch (error) {
    throw apiError_('INVALID_SKU', 'SKU tidak ditemukan di MASTER_PRODUCTS: ' + sku, 400);
  }
  var qtyMasuk = parsePositiveInteger_(input.qty_masuk, 'qty_masuk');
  var hargaModalSatuan = parseNullableNumberForApi_(input.harga_modal_satuan, 'harga_modal_satuan');
  var actor = getCurrentActor_(input.input_by || 'API_ADMIN');
  var inId = input.in_id ? String(input.in_id).trim() : generateUniqueId_('In_ID');

  try {
    assertUniqueValueInSheet_(SHEETS.STOCK_IN, 'In_ID', inId);
  } catch (error) {
    throw apiError_('DUPLICATE_TRANSACTION', error.message, 409);
  }

  var stockBefore = toNumber_(product.Stok_Aktif);
  var stockAfter = stockBefore + qtyMasuk;
  var tanggal = input.tanggal ? new Date(input.tanggal) : new Date();

  appendRowObject_(SHEETS.STOCK_IN, {
    In_ID: inId,
    Tanggal: tanggal,
    SKU: product.SKU,
    Nama_Produk: product.Nama_Produk,
    Qty_Masuk: qtyMasuk,
    Harga_Modal_Satuan: hargaModalSatuan,
    Total_Modal_Masuk: qtyMasuk * hargaModalSatuan,
    Supplier: input.supplier || '',
    Catatan: input.catatan || '',
    Input_By: actor
  });

  applyStockInToMasterProduct_(product, stockAfter, hargaModalSatuan, actor);

  writeInventoryLog_({
    Timestamp: tanggal,
    SKU: product.SKU,
    Nama_Produk: product.Nama_Produk,
    Tipe_Log: 'STOCK_IN',
    Qty_Change: qtyMasuk,
    Stok_Sebelum: stockBefore,
    Stok_Sesudah: stockAfter,
    Reference_ID: inId,
    Note: appendInternalNote_(
      input.catatan,
      input.supplier ? 'Supplier: ' + input.supplier : ''
    ),
    Actor: actor
  });

  return {
    in_id: inId,
    sku: product.SKU,
    qty_masuk: qtyMasuk,
    stock_before: stockBefore,
    stock_after: stockAfter
  };
}

function createProcessedStockOutTransaction_(input) {
  assertExpectedHeaders_(SHEETS.STOCK_OUT);

  var sku = String(input.sku || '').trim();
  if (!sku) {
    throw apiError_('VALIDATION_ERROR', 'sku wajib diisi.', 400);
  }

  var product = null;
  try {
    product = getProductBySku_(sku);
  } catch (error) {
    throw apiError_('INVALID_SKU', 'SKU tidak ditemukan di MASTER_PRODUCTS: ' + sku, 400);
  }
  var qtyKeluar = parsePositiveInteger_(input.qty_keluar, 'qty_keluar');
  var jenisKeluar = validateApiEnumValue_('jenis_keluar', input.jenis_keluar, ENUMS.JENIS_KELUAR);
  var actor = getCurrentActor_(input.input_by || 'API_ADMIN');
  var outId = input.out_id ? String(input.out_id).trim() : generateUniqueId_('Out_ID');

  try {
    assertUniqueValueInSheet_(SHEETS.STOCK_OUT, 'Out_ID', outId);
  } catch (error) {
    throw apiError_('DUPLICATE_TRANSACTION', error.message, 409);
  }

  if (jenisKeluar === 'ORDER' && !String(input.referensi_id || '').trim()) {
    throw apiError_('VALIDATION_ERROR', 'referensi_id wajib diisi jika jenis_keluar = ORDER.', 400);
  }

  var stockBefore = toNumber_(product.Stok_Aktif);
  if (qtyKeluar > stockBefore) {
    throw apiError_(
      'INSUFFICIENT_STOCK',
      'Stok tidak cukup untuk SKU ' + product.SKU + '.',
      409,
      {
        stok_aktif: stockBefore,
        qty_keluar: qtyKeluar
      }
    );
  }

  var hargaJualSatuan =
    input.harga_jual_satuan === '' ||
    input.harga_jual_satuan === null ||
    input.harga_jual_satuan === undefined
      ? parseNullableNumberForApi_(product.Harga_Jual, 'harga_jual_satuan') || 0
      : parseNullableNumberForApi_(input.harga_jual_satuan, 'harga_jual_satuan');
  var stockAfter = stockBefore - qtyKeluar;
  var tanggal = input.tanggal ? new Date(input.tanggal) : new Date();

  appendRowObject_(SHEETS.STOCK_OUT, {
    Out_ID: outId,
    Tanggal: tanggal,
    SKU: product.SKU,
    Nama_Produk: product.Nama_Produk,
    Jenis_Keluar: jenisKeluar,
    Referensi_ID: input.referensi_id || '',
    Qty_Keluar: qtyKeluar,
    Harga_Jual_Satuan: hargaJualSatuan,
    Total_Penjualan: jenisKeluar === 'ORDER' ? qtyKeluar * hargaJualSatuan : 0,
    Catatan: input.catatan || '',
    Input_By: actor
  });

  applyStockOutToMasterProduct_(product, stockAfter, actor);

  writeInventoryLog_({
    Timestamp: tanggal,
    SKU: product.SKU,
    Nama_Produk: product.Nama_Produk,
    Tipe_Log: 'STOCK_OUT',
    Qty_Change: qtyKeluar * -1,
    Stok_Sebelum: stockBefore,
    Stok_Sesudah: stockAfter,
    Reference_ID: outId,
    Note: appendInternalNote_(
      input.catatan,
      'Jenis_Keluar: ' + jenisKeluar + (input.referensi_id ? ' | Referensi_ID: ' + input.referensi_id : '')
    ),
    Actor: actor
  });

  return {
    out_id: outId,
    sku: product.SKU,
    qty_keluar: qtyKeluar,
    stock_before: stockBefore,
    stock_after: stockAfter
  };
}

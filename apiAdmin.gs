/**
 * Lists website orders for admin callers.
 */
function apiAdminOrdersList_(payload) {
  var cfg = tvjConfig_();
  var rows = getRowsAsObjects_(cfg.sheets.orders);
  var page = Math.max(1, parseInt(payload.page || 1, 10) || 1);
  var limit = Math.max(1, Math.min(50, parseInt(payload.limit || 50, 10) || 50));
  var statusFilter = normalizeText_(payload.status || payload.status_order || payload.Status_Order || '');
  var paymentFilter = normalizeText_(payload.payment_status || payload.Payment_Status || '');
  var search = normalizeText_(payload.search || payload.q || '');
  var matchingRows = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    if (statusFilter === '' && normalizeText_(rows[i].Status_Order) === 'DELETED') {
      continue;
    }
    if (statusFilter !== '' && normalizeText_(rows[i].Status_Order) !== statusFilter) {
      continue;
    }
    if (paymentFilter !== '' && normalizeText_(rows[i].Payment_Status) !== paymentFilter) {
      continue;
    }
    if (search !== '') {
      var haystack = normalizeText_([
        rows[i].Order_ID,
        rows[i].Customer_Nama,
        rows[i].Customer_WhatsApp,
        rows[i].SKU_List
      ].join(' '));
      if (haystack.indexOf(search) < 0) {
        continue;
      }
    }
    matchingRows.push(rows[i]);
  }
  var total = matchingRows.length;
  var start = (page - 1) * limit;
  var pageRows = matchingRows.slice(start, start + limit);
  var results = [];
  for (var r = 0; r < pageRows.length; r++) {
    results.push(orderRowToApi_(pageRows[r]));
  }
  return apiSuccess_('ORDERS_OK', {
    orders: results,
    total: total,
    page: page,
    limit: limit,
    total_pages: Math.max(1, Math.ceil(total / limit))
  });
}

/**
 * Creates and immediately processes one admin stock-in transaction.
 */
function apiAdminStockIn_(payload) {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var now = new Date();
    var suppliedInId = sanitizeId_(payload.in_id || payload.In_ID || '');
    var inId = suppliedInId || generateOperationalId_('IN');
    if (suppliedInId && inventoryReferenceExists_(inId)) {
      return apiSuccess_('STOCK_IN_ALREADY_PROCESSED', { in_id: inId, idempotent: true });
    }
    var qtyMasuk = safeToNumber_(payload.qty || payload.Qty_Masuk || payload.qty_masuk);
    var hargaModal = safeToNumber_(payload.harga_modal || payload.Harga_Modal_Satuan || payload.harga_modal_satuan);
    var totalModal = payload.hasOwnProperty('total_modal_masuk') || payload.hasOwnProperty('Total_Modal_Masuk')
      ? safeToNumber_(payload.total_modal_masuk || payload.Total_Modal_Masuk)
      : qtyMasuk * hargaModal;
    var rowNumber = appendObjectRow_(cfg.sheets.stockIn, {
      In_ID: inId,
      Tanggal: payload.tanggal || payload.Tanggal || now,
      SKU: normalizeSku_(payload.sku || payload.SKU),
      Nama_Produk: payload.nama_produk || payload.Nama_Produk || '',
      Qty_Masuk: qtyMasuk,
      Harga_Modal_Satuan: hargaModal,
      Total_Modal_Masuk: totalModal,
      Supplier: payload.supplier || payload.Supplier || 'ADMIN_API',
      Catatan: payload.catatan || payload.Catatan || '',
      Input_By: payload.actor || payload.Input_By || 'ADMIN_API'
    });
    var result = processStockInRowUnlocked_(getSheet_(cfg.sheets.stockIn, true), rowNumber, 'ADMIN_API');
    return apiSuccess_('STOCK_IN_PROCESSED', { in_id: inId, result: result });
  });
}

/**
 * Creates and immediately processes one admin stock-out transaction.
 */
function apiAdminStockOut_(payload) {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var now = new Date();
    var suppliedOutId = sanitizeId_(payload.out_id || payload.Out_ID || '');
    var outId = suppliedOutId || generateOperationalId_('OUT');
    if (suppliedOutId && inventoryReferenceExists_(outId)) {
      return apiSuccess_('STOCK_OUT_ALREADY_PROCESSED', { out_id: outId, idempotent: true });
    }
    var referenceId = sanitizeId_(payload.reference_id || payload.Reference_ID || '') || outId;
    var qtyKeluar = safeToNumber_(payload.qty || payload.Qty_Keluar || payload.qty_keluar);
    var hargaJual = safeToNumber_(payload.harga_jual || payload.Harga_Jual_Satuan || payload.harga_jual_satuan);
    var totalPenjualan = payload.hasOwnProperty('total_penjualan') || payload.hasOwnProperty('Total_Penjualan')
      ? safeToNumber_(payload.total_penjualan || payload.Total_Penjualan)
      : qtyKeluar * hargaJual;
    var rowNumber = appendObjectRow_(cfg.sheets.stockOut, {
      Out_ID: outId,
      Tanggal: payload.tanggal || payload.Tanggal || now,
      SKU: normalizeSku_(payload.sku || payload.SKU),
      Nama_Produk: payload.nama_produk || payload.Nama_Produk || '',
      Jenis_Keluar: payload.jenis_keluar || payload.Jenis_Keluar || 'ADMIN_OUT',
      Reference_ID: referenceId,
      Qty_Keluar: qtyKeluar,
      Harga_Jual_Satuan: hargaJual,
      Total_Penjualan: totalPenjualan,
      Catatan: payload.catatan || payload.Catatan || '',
      Input_By: payload.actor || payload.Input_By || 'ADMIN_API'
    });
    var result = processStockOutRowUnlocked_(getSheet_(cfg.sheets.stockOut, true), rowNumber, 'ADMIN_API');
    return apiSuccess_('STOCK_OUT_PROCESSED', { out_id: outId, result: result });
  });
}

/**
 * Updates product fields and logs direct stock adjustments when requested.
 */
function apiAdminProductsUpdate_(payload) {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var sku = normalizeSku_(payload.sku || payload.SKU || '');
    var productId = String(payload.product_id || payload.Product_ID || payload.id || '').trim();
    if (sku === '' && productId === '') {
      throw new Error('sku or product_id is required.');
    }
    var productRef = null;
    var rows = getRowsAsObjects_(cfg.sheets.master);
    for (var i = 0; i < rows.length; i++) {
      if ((sku !== '' && normalizeSku_(rows[i].SKU) === sku) || (productId !== '' && String(rows[i].Product_ID || '').trim() === productId)) {
        productRef = {
          sheet: getSheet_(cfg.sheets.master, true),
          rowNumber: rows[i]._rowNumber,
          object: rows[i]
        };
        break;
      }
    }
    if (!productRef) {
      throw new Error('Product not found.');
    }

    var actor = payload.actor || payload.Actor || 'ADMIN_API';
    var updates = buildProductUpdatesFromPayload_(payload);
    if (updates.hasOwnProperty('Harga_Modal') || updates.hasOwnProperty('Harga_Jual')) {
      var modalForMargin = updates.hasOwnProperty('Harga_Modal') ? safeToNumber_(updates.Harga_Modal) : safeToNumber_(productRef.object.Harga_Modal);
      var jualForMargin = updates.hasOwnProperty('Harga_Jual') ? safeToNumber_(updates.Harga_Jual) : safeToNumber_(productRef.object.Harga_Jual);
      updates.Margin_Rp = jualForMargin > 0 ? jualForMargin - modalForMargin : 0;
      updates.Margin_Persen = jualForMargin > 0 ? updates.Margin_Rp / jualForMargin : 0;
    }
    var hasStockUpdate = payload.hasOwnProperty('stok_aktif') || payload.hasOwnProperty('Stok_Aktif');
    if (hasStockUpdate) {
      var oldStock = safeToNumber_(productRef.object.Stok_Aktif);
      var newStock = safeToNumber_(payload.stok_aktif || payload.Stok_Aktif);
      updates.Stok_Aktif = newStock;
      updates.Status_Stok = calculateStockStatus_(newStock, productRef.object.Minimum_Stok);
      appendInventoryLog_({
        SKU: normalizeSku_(productRef.object.SKU),
        Nama_Produk: productRef.object.Nama_Produk || '',
        Tipe_Log: 'STOCK_ADJUSTMENT',
        Qty_Change: newStock - oldStock,
        Stok_Sebelum: oldStock,
        Stok_Sesudah: newStock,
        Reference_ID: generateOperationalId_('ADJ'),
        Note: 'ADMIN_PRODUCTS_UPDATE',
        Actor: actor
      });
    } else if (updates.hasOwnProperty('Minimum_Stok')) {
      updates.Status_Stok = calculateStockStatus_(productRef.object.Stok_Aktif, updates.Minimum_Stok);
    }
    updates.Last_Updated = new Date();
    updates.Updated_By = actor;
    updateRowByHeaders_(productRef.sheet, productRef.rowNumber, updates);
    return apiSuccess_('PRODUCT_UPDATED', { sku: normalizeSku_(productRef.object.SKU), updated_fields: Object.keys(updates) });
  });
}

/**
 * Calls spreadsheet backup from an admin API route.
 */
function apiAdminSystemBackup_() {
  backupSpreadsheetNow();
  return apiSuccess_('BACKUP_COMPLETE', {});
}

/**
 * Calls reporting refresh from an admin API route.
 */
function apiAdminRefreshReporting_() {
  refreshAllReporting();
  return apiSuccess_('REPORTING_REFRESHED', {});
}

/**
 * Converts one order row into a simple API object.
 */
function orderRowToApi_(row) {
  var items = normalizeItems_(parseJsonSafe_(row.Item_JSON, []));
  return {
    order_id: String(row.Order_ID || '').trim(),
    order_date: row.Order_Date || '',
    customer_nama: String(row.Customer_Nama || '').trim(),
    customer_whatsapp: String(row.Customer_WhatsApp || '').trim(),
    customer_alamat: String(row.Customer_Alamat || '').trim(),
    items: items,
    item_summary: buildOrderItemSummary_(items),
    sku_list: String(row.SKU_List || '').trim(),
    qty_total: safeToNumber_(row.Qty_Total),
    subtotal: safeToNumber_(row.Subtotal),
    ongkir: safeToNumber_(row.Ongkir),
    grand_total: safeToNumber_(row.Grand_Total),
    status_order: String(row.Status_Order || '').trim(),
    payment_status: String(row.Payment_Status || '').trim(),
    source: String(row.Source || '').trim(),
    catatan: String(row.Catatan || '').trim(),
    created_at: row.Created_At || ''
  };
}

/**
 * Builds a compact admin display summary from order items.
 */
function buildOrderItemSummary_(items) {
  if (!items || items.length === 0) {
    return '';
  }
  var parts = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var label = String(item.nama_produk || item.sku || '').trim();
    if (label === '') {
      continue;
    }
    parts.push(label + ' x' + safeToNumber_(item.qty));
  }
  return parts.join(', ');
}

/**
 * Maps safe product update payload keys to MASTER_PRODUCTS headers.
 */
function buildProductUpdatesFromPayload_(payload) {
  var mapping = {
    nama_produk: 'Nama_Produk',
    Nama_Produk: 'Nama_Produk',
    kategori: 'Kategori',
    Kategori: 'Kategori',
    model_vespa: 'Model_Vespa',
    Model_Vespa: 'Model_Vespa',
    deskripsi_singkat: 'Deskripsi_Singkat',
    Deskripsi_Singkat: 'Deskripsi_Singkat',
    harga_modal: 'Harga_Modal',
    Harga_Modal: 'Harga_Modal',
    harga_jual: 'Harga_Jual',
    Harga_Jual: 'Harga_Jual',
    minimum_stok: 'Minimum_Stok',
    Minimum_Stok: 'Minimum_Stok',
    status_stok: 'Status_Stok',
    Status_Stok: 'Status_Stok',
    status_produk: 'Status_Produk',
    Status_Produk: 'Status_Produk',
    image_url: 'Image_URL',
    Image_URL: 'Image_URL',
    berat: 'Berat',
    Berat: 'Berat',
    lokasi_rak: 'Lokasi_Rak',
    Lokasi_Rak: 'Lokasi_Rak',
    marketplace_sku_shopee: 'Marketplace_SKU_Shopee',
    Marketplace_SKU_Shopee: 'Marketplace_SKU_Shopee',
    marketplace_sku_tokopedia: 'Marketplace_SKU_Tokopedia',
    Marketplace_SKU_Tokopedia: 'Marketplace_SKU_Tokopedia',
    marketplace_sku_tiktok: 'Marketplace_SKU_TikTok',
    Marketplace_SKU_TikTok: 'Marketplace_SKU_TikTok'
  };
  var numericHeaders = {
    Harga_Modal: true,
    Harga_Jual: true,
    Minimum_Stok: true,
    Berat: true
  };
  var updates = {};
  for (var key in mapping) {
    if (mapping.hasOwnProperty(key) && payload.hasOwnProperty(key)) {
      var header = mapping[key];
      updates[header] = numericHeaders[header] ? safeToNumber_(payload[key]) : payload[key];
    }
  }
  return updates;
}

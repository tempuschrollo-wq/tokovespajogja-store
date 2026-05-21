/**
 * Returns active products with marketplace SKU fields for marketplace sync tools.
 */
function apiMarketplaceProducts_(params) {
  var rows = getRowsAsObjects_(tvjConfig_().sheets.master);
  var products = [];
  for (var i = 0; i < rows.length; i++) {
    if (!isActiveProduct_(rows[i])) {
      continue;
    }
    var product = productRowToApi_(rows[i]);
    product.marketplace_sku_shopee = String(rows[i].Marketplace_SKU_Shopee || '').trim();
    product.marketplace_sku_tokopedia = String(rows[i].Marketplace_SKU_Tokopedia || '').trim();
    product.marketplace_sku_tiktok = String(rows[i].Marketplace_SKU_TikTok || '').trim();
    products.push(product);
  }
  return apiSuccess_('MARKETPLACE_PRODUCTS_OK', {
    products: products,
    total: products.length
  });
}

/**
 * Returns marketplace transactions for admin screens without creating sheets.
 */
function apiAdminMarketplaceList_(params) {
  var limit = Math.max(1, Math.min(100, parseInt(params.limit || 20, 10) || 20));
  var items = getRecentMarketplaceStockOutTransactions_(limit);
  var marketplaceSheets = findMarketplaceTransactionSheets_();
  var transactions = [];
  for (var i = 0; i < marketplaceSheets.length; i++) {
    transactions = transactions.concat(readMarketplaceTransactionsFromSheet_(marketplaceSheets[i]));
  }
  return apiSuccess_('MARKETPLACE_TRANSACTIONS_OK', {
    items: items,
    transactions: transactions,
    total: items.length,
    legacy_total: transactions.length,
    source_sheets: marketplaceSheets.map(function(sheet) {
      return sheet.getName();
    })
  });
}

/**
 * Creates a marketplace or offline selling transaction through STOCK_OUT only.
 */
function apiAdminMarketplaceCreate_(payload, endpoint) {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var isOfflineEndpoint = String(endpoint || '') === '/admin/offline-selling/create';
    var channel = normalizeMarketplaceChannelKey_(
      isOfflineEndpoint ? 'OFFLINE_SELLING' : payload.channel || payload.sales_channel || payload.source || ''
    );
    var sku = normalizeSku_(payload.sku || payload.SKU || '');
    var qtyKeluar = safeToNumber_(payload.qty_keluar || payload.Qty_Keluar || payload.qty || payload.quantity);
    var marketplaceOrderNo = String(payload.marketplace_order_no || payload.order_no || payload.order_id || '').trim();
    var clientRequestId = String(payload.client_request_id || payload.request_id || payload.idempotency_key || '').trim();
    var userNote = String(payload.catatan || payload.note || '').trim();
    var actor = String(payload.input_by || payload.actor || 'ADMIN_MARKETPLACE').trim();

    if (sku === '') {
      throw new Error('sku is required.');
    }
    if (qtyKeluar <= 0) {
      throw new Error('qty_keluar must be greater than zero.');
    }

    var productRef = getProductLookupBySku_()[sku];
    if (!productRef) {
      throw new Error('SKU not found in MASTER_PRODUCTS: ' + sku);
    }
    var product = productRef.object;
    var hargaJual = payload.harga_jual === '' || payload.harga_jual === null || typeof payload.harga_jual === 'undefined'
      ? safeToNumber_(product.Harga_Jual)
      : safeToNumber_(payload.harga_jual || payload.Harga_Jual_Satuan || payload.harga_jual_satuan);
    var referenceId = buildMarketplaceReferenceId_(channel, marketplaceOrderNo, clientRequestId);

    if (inventoryReferenceExists_(referenceId, 'STOCK_OUT')) {
      return apiSuccess_('MARKETPLACE_ORDER_ALREADY_PROCESSED', {
        idempotent: true,
        transaction: buildMarketplaceTransactionPayload_({
          row: null,
          product: product,
          channel: channel,
          qtyKeluar: qtyKeluar,
          hargaJual: hargaJual,
          referenceId: referenceId,
          marketplaceOrderNo: marketplaceOrderNo,
          stockBefore: safeToNumber_(product.Stok_Aktif),
          stockAfter: safeToNumber_(product.Stok_Aktif)
        })
      });
    }

    var stockBefore = safeToNumber_(product.Stok_Aktif);
    var rowNumber = appendObjectRow_(cfg.sheets.stockOut, {
      Out_ID: referenceId,
      Tanggal: payload.tanggal || payload.Tanggal || new Date(),
      SKU: sku,
      Nama_Produk: product.Nama_Produk || '',
      Jenis_Keluar: 'ORDER',
      Reference_ID: referenceId,
      Qty_Keluar: qtyKeluar,
      Harga_Jual_Satuan: hargaJual,
      Total_Penjualan: qtyKeluar * hargaJual,
      Catatan: buildMarketplaceCatatan_(channel, marketplaceOrderNo, clientRequestId, userNote),
      Input_By: actor
    });
    var result = processStockOutRowUnlocked_(getSheet_(cfg.sheets.stockOut, true), rowNumber, actor);
    var stockAfter = result && result.skipped ? stockBefore : stockBefore - qtyKeluar;

    return apiSuccess_('MARKETPLACE_ORDER_CREATED', {
      transaction: buildMarketplaceTransactionPayload_({
        row: getRowObject_(getSheet_(cfg.sheets.stockOut, true), rowNumber),
        product: product,
        channel: channel,
        qtyKeluar: qtyKeluar,
        hargaJual: hargaJual,
        referenceId: referenceId,
        marketplaceOrderNo: marketplaceOrderNo,
        stockBefore: stockBefore,
        stockAfter: stockAfter
      }),
      process_result: result
    });
  });
}

/**
 * Returns recent marketplace/offline transactions stored as tagged STOCK_OUT rows.
 */
function getRecentMarketplaceStockOutTransactions_(limit) {
  var rows = getRowsAsObjects_(tvjConfig_().sheets.stockOut);
  var items = [];
  for (var i = rows.length - 1; i >= 0 && items.length < limit; i--) {
    if (!isMarketplaceStockOutRow_(rows[i])) {
      continue;
    }
    items.push(mapMarketplaceStockOutRowToApi_(rows[i]));
  }
  return items;
}

/**
 * Returns true for marketplace/offline stock-out audit rows only.
 */
function isMarketplaceStockOutRow_(row) {
  if (normalizeText_(row && row.Jenis_Keluar) !== 'ORDER') {
    return false;
  }
  return parseMarketplaceNoteMeta_(row && row.Catatan).isMarketplace;
}

/**
 * Maps one tagged STOCK_OUT row to the admin/reporting API contract.
 */
function mapMarketplaceStockOutRowToApi_(row) {
  var meta = parseMarketplaceNoteMeta_(row.Catatan);
  return {
    out_id: String(row.Out_ID || '').trim(),
    waktu: row.Tanggal || '',
    tanggal: row.Tanggal || '',
    channel: meta.channel,
    channel_label: getMarketplaceChannelLabel_(meta.channel),
    sku: normalizeSku_(row.SKU),
    nama_produk: String(row.Nama_Produk || '').trim(),
    qty_keluar: safeToNumber_(row.Qty_Keluar),
    harga_jual_satuan: safeToNumber_(row.Harga_Jual_Satuan),
    total_penjualan: safeToNumber_(row.Total_Penjualan),
    marketplace_order_no: meta.marketplaceOrderNo,
    client_request_id: meta.clientRequestId,
    referensi_id: String(row.Reference_ID || row.Out_ID || '').trim(),
    catatan: meta.userNote,
    input_by: String(row.Input_By || '').trim()
  };
}

function buildMarketplaceTransactionPayload_(options) {
  return {
    out_id: options.referenceId,
    waktu: options.row ? options.row.Tanggal || '' : '',
    channel: options.channel,
    channel_label: getMarketplaceChannelLabel_(options.channel),
    sku: normalizeSku_(options.product.SKU),
    nama_produk: String(options.product.Nama_Produk || '').trim(),
    qty_keluar: options.qtyKeluar,
    harga_jual_satuan: options.hargaJual,
    total_penjualan: options.qtyKeluar * options.hargaJual,
    marketplace_order_no: options.marketplaceOrderNo,
    referensi_id: options.referenceId,
    stock_before: options.stockBefore,
    stock_after: options.stockAfter
  };
}

function buildMarketplaceReferenceId_(channel, marketplaceOrderNo, clientRequestId) {
  var token = sanitizeMarketplaceReferenceToken_(marketplaceOrderNo || clientRequestId);
  if (token === '') {
    token = generateOperationalId_('OUT');
  }
  return (channel === 'OFFLINE_SELLING' ? 'OFFLINE' : 'MP') + '-' + channel + '-' + token;
}

function buildMarketplaceCatatan_(channel, marketplaceOrderNo, clientRequestId, userNote) {
  var source = channel === 'OFFLINE_SELLING' ? 'OFFLINE_SELLING' : 'MARKETPLACE';
  var parts = [
    'ORDER_SOURCE:' + source,
    'SALES_CHANNEL:' + channel
  ];
  if (marketplaceOrderNo) {
    parts.push('MARKETPLACE_ORDER_NO:' + String(marketplaceOrderNo).trim());
  }
  if (clientRequestId) {
    parts.push('CLIENT_REQUEST_ID:' + String(clientRequestId).trim());
  }
  if (userNote) {
    parts.push('USER_NOTE:' + String(userNote).trim());
  }
  return parts.join(' | ');
}

function parseMarketplaceNoteMeta_(note) {
  var text = String(note || '');
  var source = normalizeText_(extractMarketplaceNoteValue_(text, 'ORDER_SOURCE'));
  var channel = normalizeMarketplaceChannelKey_(
    extractMarketplaceNoteValue_(text, 'SALES_CHANNEL') || source,
    true
  );
  if (channel === '' && source === 'OFFLINE_SELLING') {
    channel = 'OFFLINE_SELLING';
  }
  return {
    isMarketplace: source === 'MARKETPLACE' || source === 'OFFLINE_SELLING',
    source: source,
    channel: channel,
    marketplaceOrderNo: extractMarketplaceNoteValue_(text, 'MARKETPLACE_ORDER_NO'),
    clientRequestId: extractMarketplaceNoteValue_(text, 'CLIENT_REQUEST_ID'),
    userNote: extractMarketplaceNoteValue_(text, 'USER_NOTE')
  };
}

function extractMarketplaceNoteValue_(text, key) {
  var pattern = new RegExp(key + ':([^|]+)', 'i');
  var match = String(text || '').match(pattern);
  return match && match[1] ? String(match[1]).trim() : '';
}

function getMarketplaceChannelLabel_(channel) {
  var labels = {
    SHOPEE: 'Shopee',
    TOKOPEDIA: 'Tokopedia',
    TIKTOK: 'TikTok Shop',
    OFFLINE_SELLING: 'Offline Selling'
  };
  return labels[normalizeMarketplaceChannelKey_(channel, true)] || 'Marketplace';
}

function normalizeMarketplaceChannelKey_(value, allowBlank) {
  var key = normalizeText_(value)
    .replace(/[\s-]+/g, '_')
    .replace(/^OFFLINE$/, 'OFFLINE_SELLING')
    .replace(/^OFFLINE_SALES$/, 'OFFLINE_SELLING')
    .replace(/^OFFLINE_SELLING_CREATE$/, 'OFFLINE_SELLING');
  var allowed = ['SHOPEE', 'TOKOPEDIA', 'TIKTOK', 'OFFLINE_SELLING'];
  if (key === '') {
    if (allowBlank) {
      return '';
    }
    throw new Error('channel is required.');
  }
  if (allowed.indexOf(key) === -1) {
    if (allowBlank) {
      return '';
    }
    throw new Error('channel is invalid. Allowed: ' + allowed.join(', '));
  }
  return key;
}

function sanitizeMarketplaceReferenceToken_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 64);
}

/**
 * Finds existing marketplace-like sheets, if the spreadsheet has any.
 */
function findMarketplaceTransactionSheets_() {
  var sheets = getSpreadsheet_().getSheets();
  var found = [];
  for (var i = 0; i < sheets.length; i++) {
    var name = normalizeText_(sheets[i].getName());
    if (name.indexOf('MARKETPLACE') >= 0 && sheets[i].getLastRow() >= 2) {
      found.push(sheets[i]);
    }
  }
  return found;
}

/**
 * Reads marketplace rows as plain objects with original headers preserved.
 */
function readMarketplaceTransactionsFromSheet_(sheet) {
  var output = [];
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
    return output;
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var r = 0; r < values.length; r++) {
    var hasValue = false;
    var transaction = {
      source_sheet: sheet.getName(),
      row_number: r + 2
    };
    for (var c = 0; c < headers.length; c++) {
      var header = String(headers[c] || '').trim();
      if (header === '') {
        continue;
      }
      var value = values[r][c];
      if (String(value || '').trim() !== '') {
        hasValue = true;
      }
      transaction[header] = value;
    }
    if (hasValue) {
      output.push(transaction);
    }
  }
  return output;
}

var MARKETPLACE_CHANNELS = ['SHOPEE', 'TOKOPEDIA', 'TIKTOK'];

var MARKETPLACE_CHANNEL_LABELS = {
  SHOPEE: 'Shopee',
  TOKOPEDIA: 'Tokopedia',
  TIKTOK: 'TikTok Shop'
};

function apiAdminMarketplaceCreate_(payload, e) {
  requireAdminToken_(payload, e);

  return withDocumentLock_(function() {
    var channelKey = validateApiEnumValue_('channel', payload.channel, MARKETPLACE_CHANNELS);
    var sku = String(payload.sku || '').trim().toUpperCase();
    var qtyKeluar = parsePositiveInteger_(payload.qty_keluar, 'qty_keluar');
    var actor = getCurrentActor_(payload.input_by || payload.actor || 'ADMIN_MARKETPLACE');
    var marketplaceOrderNo = String(payload.marketplace_order_no || '').trim();
    var catatanUser = String(payload.catatan || '').trim();
    var product = null;

    if (!sku) {
      throw apiError_('VALIDATION_ERROR', 'sku wajib diisi.', 400);
    }

    try {
      product = getProductBySku_(sku);
    } catch (error) {
      throw apiError_('INVALID_SKU', 'SKU tidak ditemukan di MASTER_PRODUCTS.', 400);
    }

    var hargaJualSatuan =
      payload.harga_jual === '' || payload.harga_jual === null || payload.harga_jual === undefined
        ? toNumber_(product.Harga_Jual)
        : parseNullableNumberForApi_(payload.harga_jual, 'harga_jual');

    if (hargaJualSatuan === '') {
      hargaJualSatuan = 0;
    }

    var referensiId = buildMarketplaceReferenceId_(channelKey, marketplaceOrderNo);
    var result = createProcessedStockOutTransaction_({
      sku: product.SKU,
      qty_keluar: qtyKeluar,
      harga_jual_satuan: hargaJualSatuan,
      jenis_keluar: 'ORDER',
      referensi_id: referensiId,
      catatan: buildMarketplaceCatatan_(channelKey, marketplaceOrderNo, catatanUser),
      input_by: actor,
      tanggal: payload.tanggal
    });

    return buildSuccessEnvelope_(
      'Order marketplace berhasil dicatat.',
      {
        transaction: {
          out_id: result.out_id,
          channel: channelKey,
          channel_label: getMarketplaceChannelLabel_(channelKey),
          sku: product.SKU,
          nama_produk: product.Nama_Produk || '',
          qty_keluar: qtyKeluar,
          harga_jual_satuan: hargaJualSatuan,
          total_penjualan: qtyKeluar * hargaJualSatuan,
          marketplace_order_no: marketplaceOrderNo,
          referensi_id: referensiId,
          stock_before: result.stock_before,
          stock_after: result.stock_after
        }
      },
      null
    );
  });
}

function apiAdminMarketplaceList_(payload, e) {
  requireAdminToken_(payload, e);

  var limit = parseLimitParam_(payload.limit || 8);
  var items = getRecentMarketplaceTransactions_(limit);

  return buildSuccessEnvelope_(
    'Riwayat marketplace berhasil diambil.',
    {
      items: items
    },
    {
      total: items.length,
      limit: limit
    }
  );
}

function getRecentMarketplaceTransactions_(limit) {
  var rows = getSheetRows_(SHEETS.STOCK_OUT);
  var items = [];

  for (var index = rows.length - 1; index >= 0 && items.length < limit; index -= 1) {
    var row = rows[index];
    if (!isMarketplaceStockOutRow_(row)) {
      continue;
    }
    items.push(mapMarketplaceStockOutRowToApi_(row));
  }

  return items;
}

function isMarketplaceStockOutRow_(row) {
  if (normalizeString_(row && row.Jenis_Keluar) !== 'ORDER') {
    return false;
  }

  return parseMarketplaceNoteMeta_(row && row.Catatan).isMarketplace;
}

function mapMarketplaceStockOutRowToApi_(row) {
  var meta = parseMarketplaceNoteMeta_(row.Catatan);
  var timestamp = coerceMarketplaceDate_(row.Tanggal);

  return {
    out_id: String(row.Out_ID || '').trim(),
    waktu: timestamp ? formatTimestampJakarta_(timestamp) : String(row.Tanggal || '').trim(),
    channel: meta.channelKey,
    channel_label: getMarketplaceChannelLabel_(meta.channelKey),
    sku: String(row.SKU || '').trim().toUpperCase(),
    nama_produk: row.Nama_Produk || '',
    qty_keluar: toNumber_(row.Qty_Keluar),
    harga_jual_satuan: toNumber_(row.Harga_Jual_Satuan),
    total_penjualan: toNumber_(row.Total_Penjualan),
    marketplace_order_no: meta.marketplaceOrderNo,
    referensi_id: row.Referensi_ID || '',
    catatan: meta.userNote || '',
    input_by: row.Input_By || ''
  };
}

function buildMarketplaceReferenceId_(channelKey, marketplaceOrderNo) {
  var normalizedChannel = normalizeString_(channelKey);
  var sourcePart = marketplaceOrderNo
    ? sanitizeMarketplaceReferenceToken_(marketplaceOrderNo)
    : generateUniqueId_('Order_ID');
  return 'MP-' + normalizedChannel + '-' + sourcePart;
}

function buildMarketplaceCatatan_(channelKey, marketplaceOrderNo, userNote) {
  var parts = [
    'ORDER_SOURCE:MARKETPLACE',
    'SALES_CHANNEL:' + normalizeString_(channelKey)
  ];

  if (marketplaceOrderNo) {
    parts.push('MARKETPLACE_ORDER_NO:' + String(marketplaceOrderNo).trim());
  }

  if (userNote) {
    parts.push('USER_NOTE:' + String(userNote).trim());
  }

  return parts.join(' | ');
}

function parseMarketplaceNoteMeta_(note) {
  var text = String(note || '');
  return {
    isMarketplace: /ORDER_SOURCE:MARKETPLACE/i.test(text),
    channelKey: normalizeString_(extractMarketplaceNoteValue_(text, 'SALES_CHANNEL')),
    marketplaceOrderNo: extractMarketplaceNoteValue_(text, 'MARKETPLACE_ORDER_NO'),
    userNote: extractMarketplaceNoteValue_(text, 'USER_NOTE')
  };
}

function extractMarketplaceNoteValue_(text, key) {
  var pattern = new RegExp(key + ':([^|]+)', 'i');
  var match = String(text || '').match(pattern);
  return match && match[1] ? String(match[1]).trim() : '';
}

function getMarketplaceChannelLabel_(channelKey) {
  return MARKETPLACE_CHANNEL_LABELS[normalizeString_(channelKey)] || 'Marketplace';
}

function sanitizeMarketplaceReferenceToken_(value) {
  var text = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!text) {
    return generateUniqueId_('Order_ID');
  }

  return text.slice(0, 48);
}

function coerceMarketplaceDate_(value) {
  if (!value) {
    return null;
  }

  var dateValue = new Date(value);
  return isNaN(dateValue.getTime()) ? null : dateValue;
}

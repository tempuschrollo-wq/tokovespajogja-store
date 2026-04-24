function apiError_(code, message, status, details) {
  var error = new Error(message || 'API error');
  error.apiCode = code || 'API_ERROR';
  error.apiStatus = status || 400;
  error.apiDetails = details || null;
  return error;
}

function buildSuccessEnvelope_(message, data, meta) {
  return {
    success: true,
    message: message || 'OK',
    data: data === undefined ? null : data,
    error: null,
    meta: meta || null
  };
}

function buildErrorEnvelope_(error) {
  var normalizedError = normalizeApiError_(error);
  return {
    success: false,
    message: normalizedError.message,
    data: null,
    error: {
      code: normalizedError.code,
      details: normalizedError.details
    },
    meta: null
  };
}

function normalizeApiError_(error) {
  return {
    code: error && error.apiCode ? error.apiCode : 'INTERNAL_ERROR',
    message: error && error.message ? error.message : 'Terjadi kesalahan internal.',
    status: error && error.apiStatus ? error.apiStatus : 500,
    details: error && error.apiDetails ? error.apiDetails : null
  };
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function parseApiRoute_(e) {
  var rawRoute = '';

  if (e && e.pathInfo) {
    rawRoute = e.pathInfo;
  } else if (e && e.parameter && e.parameter.route) {
    rawRoute = e.parameter.route;
  }

  rawRoute = String(rawRoute || '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();

  return rawRoute;
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw apiError_('INVALID_JSON', 'Body request harus berupa JSON valid.', 400);
  }
}

function parsePositiveInteger_(value, fieldName) {
  var parsed = Number(value);
  if (!isFinite(parsed) || parsed <= 0 || Math.floor(parsed) !== parsed) {
    throw apiError_('VALIDATION_ERROR', fieldName + ' harus integer lebih besar dari 0.', 400);
  }
  return parsed;
}

function parseNonNegativeInteger_(value, fieldName, allowBlank) {
  if (allowBlank && (value === '' || value === null || value === undefined)) {
    return '';
  }

  var parsed = Number(value);
  if (!isFinite(parsed) || parsed < 0 || Math.floor(parsed) !== parsed) {
    throw apiError_('VALIDATION_ERROR', fieldName + ' harus integer >= 0.', 400);
  }
  return parsed;
}

function parseNullableNumberForApi_(value, fieldName) {
  if (value === '' || value === null || value === undefined) {
    return '';
  }

  var parsed = Number(value);
  if (!isFinite(parsed) || parsed < 0) {
    throw apiError_('VALIDATION_ERROR', fieldName + ' tidak valid.', 400);
  }
  return parsed;
}

function validateApiEnumValue_(fieldName, value, allowedValues, allowBlank) {
  try {
    return validateEnumValue_(fieldName, value, allowedValues, allowBlank);
  } catch (error) {
    throw apiError_('VALIDATION_ERROR', error.message, 400);
  }
}

function getSheetRows_(sheetName) {
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

function mapMasterProductToApi_(product) {
  var hargaModal = product.Harga_Modal === '' ? null : toNumber_(product.Harga_Modal);
  var hargaJual = product.Harga_Jual === '' ? null : toNumber_(product.Harga_Jual);
  var marginRp = product.Margin_Rp === '' ? null : toNumber_(product.Margin_Rp);
  var marginPersen = product.Margin_Persen === '' ? null : Number(product.Margin_Persen);

  return {
    product_id: product.Product_ID || '',
    sku: product.SKU || '',
    nama_produk: product.Nama_Produk || '',
    kategori: product.Kategori || '',
    model_vespa: product.Model_Vespa || '',
    deskripsi_singkat: product.Deskripsi_Singkat || '',
    harga_modal: hargaModal,
    harga_jual: hargaJual,
    margin_rp: marginRp,
    margin_persen: marginPersen,
    stok_aktif: toNumber_(product.Stok_Aktif),
    minimum_stok: product.Minimum_Stok === '' ? null : toNumber_(product.Minimum_Stok),
    status_stok: product.Status_Stok || '',
    status_produk: product.Status_Produk || '',
    image_url: product.Image_URL || '',
    berat: product.Berat === '' ? null : toNumber_(product.Berat),
    lokasi_rak: product.Lokasi_Rak || '',
    marketplace_sku_shopee: product.Marketplace_SKU_Shopee || '',
    marketplace_sku_tokopedia: product.Marketplace_SKU_Tokopedia || '',
    marketplace_sku_tiktok: product.Marketplace_SKU_TikTok || '',
    last_updated: product.Last_Updated ? formatTimestampJakarta_(new Date(product.Last_Updated)) : '',
    updated_by: product.Updated_By || '',
    harga_label: hargaJual === null ? 'Hubungi admin' : null
  };
}

function getActiveMasterProducts_() {
  return getSheetRows_(SHEETS.MASTER_PRODUCTS).filter(function(product) {
    return normalizeString_(product.Status_Produk) === 'AKTIF';
  });
}

function findMasterProductByProductId_(productId) {
  var rowNumber = findRowByValue_(SHEETS.MASTER_PRODUCTS, 'Product_ID', productId);
  if (!rowNumber) {
    return null;
  }
  return getRowObject_(SHEETS.MASTER_PRODUCTS, rowNumber);
}

function findActiveProductBySku_(sku) {
  var rowNumber = findRowByValue_(SHEETS.MASTER_PRODUCTS, 'SKU', sku);
  if (!rowNumber) {
    return null;
  }

  var product = getRowObject_(SHEETS.MASTER_PRODUCTS, rowNumber);
  if (normalizeString_(product.Status_Produk) !== 'AKTIF') {
    return null;
  }
  return product;
}

function findActiveProductById_(productId) {
  var product = findMasterProductByProductId_(productId);
  if (!product) {
    return null;
  }

  if (normalizeString_(product.Status_Produk) !== 'AKTIF') {
    return null;
  }

  return product;
}

function getProductIdentifierForApi_(payloadOrParams) {
  return {
    sku: payloadOrParams.sku || payloadOrParams.SKU || '',
    productId:
      payloadOrParams.product_id ||
      payloadOrParams.Product_ID ||
      payloadOrParams.id ||
      payloadOrParams.productId ||
      ''
  };
}

function requireAdminToken_(payload, e) {
  var configuredToken = PropertiesService.getScriptProperties().getProperty(
    SCRIPT_PROPERTY_KEYS.ADMIN_API_TOKEN
  );

  if (!configuredToken) {
    throw apiError_(
      'ADMIN_TOKEN_NOT_CONFIGURED',
      'ADMIN_API_TOKEN belum di-set di Script Properties.',
      500
    );
  }

  var bodyToken = payload && payload.admin_token ? String(payload.admin_token) : '';
  var queryToken = e && e.parameter && e.parameter.admin_token ? String(e.parameter.admin_token) : '';
  var receivedToken = bodyToken || queryToken;

  if (!receivedToken || receivedToken !== configuredToken) {
    throw apiError_('UNAUTHORIZED', 'Admin token tidak valid.', 401);
  }
}

function parseLimitParam_(value) {
  if (value === '' || value === null || value === undefined) {
    return API_DEFAULT_LIMIT;
  }

  var limit = parsePositiveInteger_(value, 'limit');
  return Math.min(limit, API_MAX_LIMIT);
}

function parsePageParam_(value) {
  if (value === '' || value === null || value === undefined) {
    return 1;
  }

  return parsePositiveInteger_(value, 'page');
}

function summarizeForLog_(value) {
  var text = '';

  if (typeof value === 'string') {
    text = value;
  } else {
    text = JSON.stringify(sanitizeForLog_(value || {}));
  }

  if (!text) {
    return '';
  }
  return text.length > 500 ? text.slice(0, 497) + '...' : text;
}

function sanitizeForLog_(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Object.prototype.toString.call(value) === '[object Array]') {
    return value.map(sanitizeForLog_);
  }

  if (typeof value === 'object') {
    var sanitized = {};
    Object.keys(value).forEach(function(key) {
      var normalizedKey = String(key).toLowerCase();

      if (normalizedKey === 'admin_token') {
        sanitized[key] = '[REDACTED]';
        return;
      }

      if (normalizedKey === 'customer_whatsapp') {
        sanitized[key] = maskPhoneForLog_(value[key]);
        return;
      }

      sanitized[key] = sanitizeForLog_(value[key]);
    });
    return sanitized;
  }

  return value;
}

function maskPhoneForLog_(value) {
  var raw = String(value || '');
  if (raw.length <= 4) {
    return '****';
  }
  return raw.slice(0, 3) + '****' + raw.slice(-2);
}

function buildOrderFingerprint_(payload) {
  var normalizedItems = (payload.items || [])
    .map(function(item) {
      return {
        sku: String(item.sku || '').trim().toUpperCase(),
        qty: Number(item.qty || 0)
      };
    })
    .sort(function(left, right) {
      return left.sku.localeCompare(right.sku);
    });

  var fingerprintPayload = {
    customer_name: String(payload.customer_name || '').trim().toUpperCase(),
    customer_whatsapp: String(payload.customer_whatsapp || '').trim(),
    customer_address: String(payload.customer_address || '').trim().toUpperCase(),
    items: normalizedItems
  };

  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    JSON.stringify(fingerprintPayload)
  );

  return digest
    .map(function(byte) {
      var normalizedByte = byte < 0 ? byte + 256 : byte;
      return normalizedByte.toString(16).padStart(2, '0');
    })
    .join('');
}

function reserveOrderFingerprint_(fingerprint) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'ORDER_FP_' + fingerprint;

  if (cache.get(cacheKey)) {
    throw apiError_(
      'DUPLICATE_ORDER',
      'Request order terdeteksi duplikat. Tunggu sebentar lalu cek status order.',
      409
    );
  }

  cache.put(cacheKey, 'LOCKED', API_ORDER_DUPLICATE_WINDOW_SECONDS);
  return cacheKey;
}

function releaseOrderFingerprint_(cacheKey) {
  if (!cacheKey) {
    return;
  }
  CacheService.getScriptCache().remove(cacheKey);
}

function hasRecentOrderFingerprint_(fingerprint) {
  var rows = getSheetRows_(SHEETS.ORDERS_WEBSITE);
  var compareAfter = new Date().getTime() - API_RECENT_DUPLICATE_LOOKBACK_MINUTES * 60 * 1000;

  return rows.some(function(order) {
    var catatan = String(order.Catatan || '');
    if (catatan.indexOf('[API_FP:' + fingerprint + ']') === -1) {
      return false;
    }

    var createdAt = order.Created_At ? new Date(order.Created_At).getTime() : 0;
    return createdAt >= compareAfter;
  });
}

function appendInternalNote_(existingNote, extraNote) {
  var parts = [];

  if (existingNote) {
    parts.push(String(existingNote).trim());
  }

  if (extraNote) {
    parts.push(String(extraNote).trim());
  }

  return parts.filter(Boolean).join(' | ');
}

function safeWriteApiLog_(payload) {
  try {
    writeApiLog_({
      Timestamp: payload.Timestamp || new Date(),
      Method: payload.Method || '',
      Endpoint: payload.Endpoint || '',
      Payload_Singkat: summarizeForLog_(payload.Payload_Singkat),
      Status: payload.Status || '',
      Response_Singkat: summarizeForLog_(payload.Response_Singkat)
    });
  } catch (error) {
    Logger.log('safeWriteApiLog_ error: ' + error.message);
  }
}

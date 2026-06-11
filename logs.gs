/**
 * Appends a durable inventory log entry for every stock mutation.
 */
function appendInventoryLog_(entry) {
  var cfg = tvjConfig_();
  ensureSheet_(cfg.sheets.inventoryLog, cfg.headers.INVENTORY_LOG);
  var row = {
    Log_ID: entry.Log_ID || generateOperationalId_('LOG'),
    Timestamp: entry.Timestamp || new Date(),
    SKU: entry.SKU || '',
    Nama_Produk: entry.Nama_Produk || '',
    Tipe_Log: entry.Tipe_Log || '',
    Qty_Change: entry.Qty_Change || 0,
    Stok_Sebelum: entry.Stok_Sebelum || 0,
    Stok_Sesudah: entry.Stok_Sesudah || 0,
    Reference_ID: entry.Reference_ID || '',
    Note: entry.Note || '',
    Actor: entry.Actor || ''
  };
  return appendObjectRow_(cfg.sheets.inventoryLog, row);
}

/**
 * Returns true when an inventory Reference_ID already exists.
 */
function inventoryReferenceExists_(referenceId, tipeLog) {
  if (!referenceId) {
    return false;
  }
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.inventoryLog, false);
  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }
  var map = getHeaderMap_(sheet);
  var refCol = requireColumn_(map, 'Reference_ID', cfg.sheets.inventoryLog);
  var typeCol = map.Tipe_Log || 0;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var target = String(referenceId || '').trim();
  var typeTarget = tipeLog ? normalizeText_(tipeLog) : '';
  for (var i = 0; i < values.length; i++) {
    var ref = String(values[i][refCol - 1] || '').trim();
    if (ref === target) {
      if (!typeTarget || !typeCol || normalizeText_(values[i][typeCol - 1]) === typeTarget) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Counts inventory log rows matching a Reference_ID and optional Tipe_Log.
 */
function countInventoryLogsByReference_(referenceId, tipeLog) {
  if (!referenceId) {
    return 0;
  }
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.inventoryLog, false);
  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }
  var map = getHeaderMap_(sheet);
  var refCol = requireColumn_(map, 'Reference_ID', cfg.sheets.inventoryLog);
  var typeCol = map.Tipe_Log || 0;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var target = String(referenceId || '').trim();
  var typeTarget = tipeLog ? normalizeText_(tipeLog) : '';
  var count = 0;
  for (var i = 0; i < values.length; i++) {
    var ref = String(values[i][refCol - 1] || '').trim();
    if (ref === target) {
      if (!typeTarget || !typeCol || normalizeText_(values[i][typeCol - 1]) === typeTarget) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Builds a lookup of existing inventory Reference_ID values.
 */
function getInventoryReferenceLookup_() {
  var cfg = tvjConfig_();
  var lookup = {};
  var sheet = getSheet_(cfg.sheets.inventoryLog, false);
  if (!sheet || sheet.getLastRow() < 2) {
    return lookup;
  }
  var map = getHeaderMap_(sheet);
  var refCol = requireColumn_(map, 'Reference_ID', cfg.sheets.inventoryLog);
  var values = sheet.getRange(2, refCol, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var ref = String(values[i][0] || '').trim();
    if (ref !== '') {
      lookup[ref] = true;
    }
  }
  return lookup;
}

/**
 * Appends one API call log while redacting tokens from payloads.
 */
function appendApiLog_(method, endpoint, payload, status, response) {
  var cfg = tvjConfig_();
  try {
    ensureSheet_(cfg.sheets.apiLog, cfg.headers.API_LOG);
    appendObjectRow_(cfg.sheets.apiLog, {
      Timestamp: new Date(),
      Method: method || '',
      Endpoint: endpoint || '',
      Payload_Singkat: truncate_(sanitizeForLog_(payload || {}), cfg.apiLogPayloadLimit),
      Status: status || '',
      Response_Singkat: truncate_(sanitizeForLog_(response || {}), cfg.apiLogResponseLimit)
    });
  } catch (err) {
    Logger.log('API log failed: ' + err.message);
  }
}

/**
 * Returns recent inventory activity for dashboard rendering.
 */
function getRecentInventoryActivity_(limit) {
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.inventoryLog, false);
  var output = [];
  if (!sheet || sheet.getLastRow() < 2) {
    return output;
  }
  var lastRow = sheet.getLastRow();
  var count = Math.min(limit || cfg.recentActivityLimit, lastRow - 1);
  var startRow = lastRow - count + 1;
  var values = sheet.getRange(startRow, 1, count, sheet.getLastColumn()).getValues();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var r = values.length - 1; r >= 0; r--) {
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      var key = String(headers[c] || '').trim();
      if (key !== '') {
        row[key] = values[r][c];
      }
    }
    output.push(row);
  }
  return output;
}

function writeInventoryLog_(payload) {
  assertExpectedHeaders_(SHEETS.INVENTORY_LOG);

  var logId = payload.Log_ID || generateUniqueId_('Log_ID');
  var timestamp = payload.Timestamp || new Date();
  var tipeLog = validateEnumValue_('Tipe_Log', payload.Tipe_Log, ENUMS.INVENTORY_LOG_TYPE);
  var qtyChange = toNumber_(payload.Qty_Change);

  if (qtyChange === 0) {
    throw new Error('Qty_Change pada INVENTORY_LOG tidak boleh 0.');
  }

  var rowObject = {
    Log_ID: logId,
    Timestamp: timestamp,
    SKU: payload.SKU || '',
    Nama_Produk: payload.Nama_Produk || '',
    Tipe_Log: tipeLog,
    Qty_Change: qtyChange,
    Stok_Sebelum: parseNonNegativeNumber_(payload.Stok_Sebelum, 'Stok_Sebelum'),
    Stok_Sesudah: parseNonNegativeNumber_(payload.Stok_Sesudah, 'Stok_Sesudah'),
    Reference_ID: payload.Reference_ID || '',
    Note: payload.Note || '',
    Actor: getCurrentActor_(payload.Actor)
  };

  appendRowObject_(SHEETS.INVENTORY_LOG, rowObject);
  return rowObject;
}

function inventoryLogExists_(tipeLog, referenceId) {
  if (!referenceId) {
    return false;
  }

  var sheet = getSheetOrThrow_(SHEETS.INVENTORY_LOG);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return false;
  }

  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var headerMap = getHeaderMap_(sheet);
  var tipeIndex = headerMap.Tipe_Log - 1;
  var referenceIndex = headerMap.Reference_ID - 1;
  var normalizedType = normalizeString_(tipeLog);
  var normalizedReference = normalizeString_(referenceId);

  for (var index = 0; index < values.length; index += 1) {
    if (
      normalizeString_(values[index][tipeIndex]) === normalizedType &&
      normalizeString_(values[index][referenceIndex]) === normalizedReference
    ) {
      return true;
    }
  }

  return false;
}

function writeApiLog_(payload) {
  assertExpectedHeaders_(SHEETS.API_LOG);

  var method = payload.Method
    ? validateEnumValue_('Method', payload.Method, ENUMS.API_METHOD)
    : '';
  var status = payload.Status === '' || payload.Status === null || payload.Status === undefined
    ? ''
    : parseNonNegativeNumber_(payload.Status, 'Status');

  var rowObject = {
    Timestamp: payload.Timestamp || new Date(),
    Method: method,
    Endpoint: payload.Endpoint || '',
    Payload_Singkat: payload.Payload_Singkat || '',
    Status: status,
    Response_Singkat: payload.Response_Singkat || ''
  };

  appendRowObject_(SHEETS.API_LOG, rowObject);
  return rowObject;
}

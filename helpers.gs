var HEADER_CACHE = {};

function getSpreadsheet_() {
  var spreadsheet = null;

  try {
    spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  } catch (error) {
    spreadsheet = null;
  }

  if (spreadsheet) {
    return spreadsheet;
  }

  var spreadsheetId = PropertiesService.getScriptProperties().getProperty(
    SCRIPT_PROPERTY_KEYS.SPREADSHEET_ID
  );

  if (!spreadsheetId) {
    throw new Error(
      'Spreadsheet tidak bisa diakses dari konteks ini. Set Script Property SPREADSHEET_ID terlebih dahulu.'
    );
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getSheetOrThrow_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet tidak ditemukan: ' + sheetName);
  }
  return sheet;
}

function getHeaderMap_(sheetOrName) {
  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var cacheKey = sheet.getSheetId() + ':' + sheet.getName();
  if (HEADER_CACHE[cacheKey]) {
    return HEADER_CACHE[cacheKey];
  }

  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error('Sheet kosong tanpa header: ' + sheet.getName());
  }

  var headerValues = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var headerMap = {};

  headerValues.forEach(function(header, index) {
    var normalizedHeader = String(header || '').trim();
    if (normalizedHeader) {
      headerMap[normalizedHeader] = index + 1;
    }
  });

  HEADER_CACHE[cacheKey] = headerMap;
  return headerMap;
}

function assertExpectedHeaders_(sheetOrName) {
  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var expectedHeaders = HEADERS[sheet.getName()];
  if (!expectedHeaders || !expectedHeaders.length) {
    return;
  }

  var headerMap = getHeaderMap_(sheet);
  var missingHeaders = expectedHeaders.filter(function(header) {
    return !headerMap[header];
  });

  if (missingHeaders.length) {
    throw new Error(
      'Header wajib belum lengkap di sheet ' +
        sheet.getName() +
        ': ' +
        missingHeaders.join(', ')
    );
  }
}

function getColumnIndex_(sheetOrName, headerName) {
  var headerMap = getHeaderMap_(sheetOrName);
  var columnIndex = headerMap[headerName];
  if (!columnIndex) {
    var sheetName = typeof sheetOrName === 'string' ? sheetOrName : sheetOrName.getName();
    throw new Error('Header "' + headerName + '" tidak ditemukan di sheet ' + sheetName);
  }
  return columnIndex;
}

function getRowObject_(sheetOrName, rowNumber) {
  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var headerMap = getHeaderMap_(sheet);
  var lastColumn = sheet.getLastColumn();
  var rowValues = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];
  var rowObject = { __rowNumber: rowNumber, __sheetName: sheet.getName() };

  Object.keys(headerMap).forEach(function(header) {
    rowObject[header] = rowValues[headerMap[header] - 1];
  });

  return rowObject;
}

function isRowCompletelyEmpty_(rowObject, fieldNames) {
  return fieldNames.every(function(fieldName) {
    var value = rowObject[fieldName];
    return value === '' || value === null || value === undefined;
  });
}

function findRowByValue_(sheetOrName, headerName, targetValue) {
  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }

  var columnIndex = getColumnIndex_(sheet, headerName);
  var values = sheet.getRange(2, columnIndex, lastRow - 1, 1).getValues();
  var normalizedTarget = normalizeString_(targetValue);

  for (var index = 0; index < values.length; index += 1) {
    if (normalizeString_(values[index][0]) === normalizedTarget) {
      return index + 2;
    }
  }

  return 0;
}

function assertUniqueValueInSheet_(sheetOrName, headerName, value, currentRow) {
  if (value === '' || value === null || value === undefined) {
    return;
  }

  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return;
  }

  var columnIndex = getColumnIndex_(sheet, headerName);
  var values = sheet.getRange(2, columnIndex, lastRow - 1, 1).getValues();
  var target = normalizeString_(value);

  for (var index = 0; index < values.length; index += 1) {
    var rowNumber = index + 2;
    if (rowNumber === currentRow) {
      continue;
    }

    if (normalizeString_(values[index][0]) === target) {
      throw new Error(
        'Nilai "' +
          value +
          '" pada kolom ' +
          headerName +
          ' sudah dipakai di row ' +
          rowNumber +
          ' sheet ' +
          sheet.getName()
      );
    }
  }
}

function findProductRowBySku_(sku) {
  var rowNumber = findRowByValue_(SHEETS.MASTER_PRODUCTS, 'SKU', sku);
  if (!rowNumber) {
    throw new Error('SKU tidak ditemukan di MASTER_PRODUCTS: ' + sku);
  }
  return rowNumber;
}

function getProductBySku_(sku) {
  var rowNumber = findProductRowBySku_(sku);
  var product = getRowObject_(SHEETS.MASTER_PRODUCTS, rowNumber);
  product.__rowNumber = rowNumber;
  return product;
}

function updateProductStock_(sku, nextStock, actor) {
  var product = getProductBySku_(sku);
  var normalizedStock = parseNonNegativeNumber_(nextStock, 'Stok_Aktif');
  var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);

  sheet.getRange(product.__rowNumber, getColumnIndex_(sheet, 'Stok_Aktif')).setValue(normalizedStock);
  updateProductStockStatus_(sku);
  stampMasterProductUpdate_(sku, actor);

  return getProductBySku_(sku);
}

function updateProductStockStatus_(sku) {
  var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
  var product = getProductBySku_(sku);
  var status = computeStatusStok_(product.Stok_Aktif, product.Minimum_Stok);
  setCellValueRespectFormula_(sheet, product.__rowNumber, 'Status_Stok', status);
  return status;
}

function stampMasterProductUpdate_(sku, actor) {
  var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
  var product = getProductBySku_(sku);
  var effectiveActor = getCurrentActor_(actor);

  sheet
    .getRange(product.__rowNumber, getColumnIndex_(sheet, 'Last_Updated'))
    .setValue(new Date());
  sheet
    .getRange(product.__rowNumber, getColumnIndex_(sheet, 'Updated_By'))
    .setValue(effectiveActor);
}

function syncMasterProductComputedFields_(sku) {
  var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);
  var product = getProductBySku_(sku);
  var hargaModal = parseNonNegativeNumber_(product.Harga_Modal, 'Harga_Modal', true);
  var hargaJual = parseNonNegativeNumber_(product.Harga_Jual, 'Harga_Jual', true);
  var marginRp = '';
  var marginPersen = '';

  if (hargaModal !== '' && hargaJual !== '') {
    marginRp = hargaJual - hargaModal;
    marginPersen = hargaModal > 0 ? (hargaJual - hargaModal) / hargaModal : '';
  }

  setCellValueRespectFormula_(sheet, product.__rowNumber, 'Margin_Rp', marginRp);
  setCellValueRespectFormula_(sheet, product.__rowNumber, 'Margin_Persen', marginPersen);
  updateProductStockStatus_(sku);
}

function computeStatusStok_(stockActive, minimumStock) {
  var normalizedStock = parseNonNegativeNumber_(stockActive, 'Stok_Aktif');
  var threshold = getMinimumStockThreshold_(minimumStock);

  if (normalizedStock <= 0) {
    return 'OUT OF STOCK';
  }

  if (normalizedStock <= threshold) {
    return 'LOW';
  }

  return 'READY';
}

function getMinimumStockThreshold_(minimumStock) {
  if (minimumStock !== '' && minimumStock !== null && minimumStock !== undefined) {
    return Math.max(0, toNumber_(minimumStock));
  }

  return Math.max(
    0,
    toNumber_(getSettingValue_(SETTINGS_KEYS.LOW_STOCK_THRESHOLD_DEFAULT, DEFAULT_VALUES.LOW_STOCK_THRESHOLD_DEFAULT))
  );
}

function getSettingValue_(key, defaultValue) {
  var sheet = getSheetOrThrow_(SHEETS.SETTINGS);
  var rowNumber = findRowByValue_(sheet, 'Key', key);
  if (!rowNumber) {
    return defaultValue;
  }

  return getRowObject_(sheet, rowNumber).Value;
}

function setSettingValue_(key, value, description) {
  var sheet = getSheetOrThrow_(SHEETS.SETTINGS);
  assertExpectedHeaders_(sheet);

  var rowNumber = findRowByValue_(sheet, 'Key', key);
  if (rowNumber) {
    sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Value')).setValue(value);

    if (description !== undefined) {
      sheet
        .getRange(rowNumber, getColumnIndex_(sheet, 'Description'))
        .setValue(description);
    }

    return rowNumber;
  }

  return appendRowObject_(sheet, {
    Key: key,
    Value: value,
    Description: description || ''
  });
}

function formatTimestampJakarta_(dateValue) {
  return Utilities.formatDate(dateValue || new Date(), APP_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function generateUniqueId_(fieldName) {
  var prefix = ID_PREFIX[fieldName];
  if (!prefix) {
    throw new Error('Prefix ID belum didefinisikan untuk field: ' + fieldName);
  }

  var stamp = Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyyyMMddHHmmss');
  var randomPart = Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase();

  return prefix + '-' + stamp + '-' + randomPart;
}

function validateEnumValue_(fieldName, value, allowedValues, allowBlank) {
  var normalizedValue = normalizeString_(value);

  if (!normalizedValue) {
    if (allowBlank) {
      return '';
    }
    throw new Error(fieldName + ' wajib diisi.');
  }

  var match = allowedValues.some(function(item) {
    return normalizeString_(item) === normalizedValue;
  });

  if (!match) {
    throw new Error(fieldName + ' tidak valid. Nilai yang diperbolehkan: ' + allowedValues.join(', '));
  }

  return String(value).trim().toUpperCase();
}

function getCurrentActor_(fallbackValue) {
  if (fallbackValue !== '' && fallbackValue !== null && fallbackValue !== undefined) {
    return String(fallbackValue).trim();
  }

  var email = '';
  try {
    email = Session.getActiveUser().getEmail();
  } catch (error) {
    email = '';
  }

  return email || DEFAULT_VALUES.UPDATED_BY_FALLBACK;
}

function normalizeString_(value) {
  return String(value === null || value === undefined ? '' : value).trim().toUpperCase();
}

function toNumber_(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  var cleaned = String(value)
    .replace(/[^0-9,.\-]/g, '')
    .replace(/,/g, '');
  var numberValue = Number(cleaned);
  return isNaN(numberValue) ? 0 : numberValue;
}

function parsePositiveNumber_(value, fieldName) {
  var numberValue = toNumber_(value);
  if (numberValue <= 0) {
    throw new Error(fieldName + ' harus lebih besar dari 0.');
  }
  return numberValue;
}

function parseNonNegativeNumber_(value, fieldName, allowBlank) {
  if (allowBlank && (value === '' || value === null || value === undefined)) {
    return '';
  }

  var numberValue = toNumber_(value);
  if (numberValue < 0) {
    throw new Error(fieldName + ' tidak boleh negatif.');
  }
  return numberValue;
}

function setCellValueRespectFormula_(sheetOrName, rowNumber, headerName, value) {
  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var columnIndex = getColumnIndex_(sheet, headerName);
  var range = sheet.getRange(rowNumber, columnIndex);
  if (range.getFormula()) {
    return false;
  }
  range.setValue(value);
  return true;
}

function appendRowObject_(sheetOrName, rowObject) {
  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var headerValues = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowValues = headerValues.map(function(header) {
    return rowObject[header] !== undefined ? rowObject[header] : '';
  });
  sheet.appendRow(rowValues);
  return sheet.getLastRow();
}

function ensureTransactionId_(sheetOrName, rowNumber, fieldName) {
  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var rowObject = getRowObject_(sheet, rowNumber);
  var currentValue = rowObject[fieldName];

  if (currentValue !== '' && currentValue !== null && currentValue !== undefined) {
    assertUniqueValueInSheet_(sheet, fieldName, currentValue, rowNumber);
    return String(currentValue).trim();
  }

  var generatedId = generateUniqueId_(fieldName);
  sheet.getRange(rowNumber, getColumnIndex_(sheet, fieldName)).setValue(generatedId);
  return generatedId;
}

function withDocumentLock_(callback) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    var lockError = new Error('Sistem sedang memproses transaksi lain. Coba lagi beberapa detik.');
    lockError.apiCode = 'LOCK_TIMEOUT';
    lockError.apiStatus = 409;
    throw lockError;
  }

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function showUiAlert_(title, message) {
  SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
}

function showToast_(message) {
  getSpreadsheet_().toast(message, 'Toko Vespa Jogja', 5);
}

function hasDataRows_(sheetOrName) {
  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  return sheet.getLastRow() > 1;
}

/**
 * Returns the active spreadsheet used by this bound Apps Script project.
 */
function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Gets a sheet by configured name and optionally throws when missing.
 */
function getSheet_(sheetName, required) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet && required !== false) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  return sheet;
}

/**
 * Creates a required operational sheet only when it is missing.
 */
function ensureSheet_(sheetName, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  ensureHeaders_(sheet, headers);
  return sheet;
}

/**
 * Ensures a sheet has a header row. Existing non-empty headers are preserved.
 */
function ensureHeaders_(sheet, headers) {
  if (!headers || headers.length === 0) {
    return;
  }
  var lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  var existing = [];
  if (sheet.getLastRow() >= 1 && lastColumn > 0) {
    existing = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  }
  var isEmpty = true;
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i] || '').trim() !== '') {
      isEmpty = false;
      break;
    }
  }
  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

/**
 * Builds a case-sensitive header map from row 1. Values are 1-based columns.
 */
function getHeaderMap_(sheetOrName) {
  var sheet = typeof sheetOrName === 'string' ? getSheet_(sheetOrName, true) : sheetOrName;
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error('Sheet has no headers: ' + sheet.getName());
  }
  var values = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var header = String(values[i] || '').trim();
    if (header !== '') {
      map[header] = i + 1;
    }
  }
  return map;
}

/**
 * Returns a required header column number or throws a readable error.
 */
function requireColumn_(headerMap, header, sheetName) {
  if (!headerMap[header]) {
    throw new Error('Missing header "' + header + '" in ' + sheetName);
  }
  return headerMap[header];
}

/**
 * Validates required headers for one sheet and returns the missing list.
 */
function findMissingHeaders_(sheetName, requiredHeaders) {
  var sheet = getSheet_(sheetName, false);
  if (!sheet) {
    return requiredHeaders.slice();
  }
  var map = getHeaderMap_(sheet);
  var missing = [];
  for (var i = 0; i < requiredHeaders.length; i++) {
    if (!map[requiredHeaders[i]]) {
      missing.push(requiredHeaders[i]);
    }
  }
  return missing;
}

/**
 * Reads data rows as objects keyed by the sheet headers.
 */
function getRowsAsObjects_(sheetName) {
  var sheet = getSheet_(sheetName, true);
  var headerMap = getHeaderMap_(sheet);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  var rows = [];
  if (lastRow < 2) {
    return rows;
  }
  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  for (var r = 0; r < values.length; r++) {
    var obj = { _rowNumber: r + 2 };
    for (var c = 0; c < headers.length; c++) {
      var key = String(headers[c] || '').trim();
      if (key !== '') {
        obj[key] = values[r][c];
      }
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * Reads a single row as an object keyed by the sheet headers.
 */
function getRowObject_(sheet, rowNumber) {
  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var values = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];
  var obj = { _rowNumber: rowNumber };
  for (var c = 0; c < headers.length; c++) {
    var key = String(headers[c] || '').trim();
    if (key !== '') {
      obj[key] = values[c];
    }
  }
  return obj;
}

/**
 * Appends an object row using the current sheet headers.
 */
function appendObjectRow_(sheetName, obj) {
  var sheet = getSheet_(sheetName, true);
  var headerMap = getHeaderMap_(sheet);
  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i] || '').trim();
    row.push(obj.hasOwnProperty(key) ? obj[key] : '');
  }
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/**
 * Updates cells on one row by header names.
 */
function updateRowByHeaders_(sheet, rowNumber, valuesByHeader) {
  var headerMap = getHeaderMap_(sheet);
  for (var key in valuesByHeader) {
    if (valuesByHeader.hasOwnProperty(key) && headerMap[key]) {
      sheet.getRange(rowNumber, headerMap[key]).setValue(valuesByHeader[key]);
    }
  }
}

/**
 * Normalizes SKU values for matching.
 */
function normalizeSku_(sku) {
  return String(sku || '').trim().toUpperCase();
}

/**
 * Returns a normalized uppercase text value.
 */
function normalizeText_(value) {
  return String(value || '').trim().toUpperCase();
}

/**
 * Safely parses Indonesian and common currency formats to a number.
 */
function safeToNumber_(value) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    if (isNaN(value)) {
      return 0;
    }
    return value;
  }
  var text = String(value).trim();
  if (text === '') {
    return 0;
  }
  var isNegative = false;
  if (/^\(.*\)$/.test(text)) {
    isNegative = true;
  }
  text = text.replace(/[()]/g, '');
  text = text.replace(/rp/ig, '');
  text = text.replace(/idr/ig, '');
  text = text.replace(/\s/g, '');
  text = text.replace(/[^0-9,\.\-]/g, '');
  if (text.charAt(0) === '-') {
    isNegative = true;
    text = text.substring(1);
  }
  if (text === '') {
    return 0;
  }

  var lastComma = text.lastIndexOf(',');
  var lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    text = normalizeSingleSeparatorNumber_(text, ',');
  } else if (lastDot >= 0) {
    text = normalizeSingleSeparatorNumber_(text, '.');
  }

  var numberValue = parseFloat(text);
  if (isNaN(numberValue)) {
    return 0;
  }
  return isNegative ? -numberValue : numberValue;
}

/**
 * Interprets a single separator as thousands when it has 3 trailing digits.
 */
function normalizeSingleSeparatorNumber_(text, separator) {
  var escaped = separator === '.' ? '\\.' : ',';
  var parts = text.split(separator);
  if (parts.length > 2) {
    return text.replace(new RegExp(escaped, 'g'), '');
  }
  if (parts.length === 2 && parts[1].length === 3) {
    return parts[0] + parts[1];
  }
  if (parts.length === 2) {
    return parts[0] + '.' + parts[1];
  }
  return text;
}

/**
 * Returns true when a value can be treated as an enabled boolean.
 */
function isTruthySetting_(value) {
  var text = normalizeText_(value);
  return text === 'TRUE' || text === 'YES' || text === 'YA' || text === '1' || text === 'ON';
}

/**
 * Returns the configured script timezone.
 */
function getConfiguredTimezone_() {
  var cfg = tvjConfig_();
  var setting = getSettingValue_(cfg.settingsKeys.timezone, '');
  if (setting) {
    return String(setting);
  }
  try {
    return Session.getScriptTimeZone() || cfg.defaultTimezone;
  } catch (err) {
    return cfg.defaultTimezone;
  }
}

/**
 * Formats dates consistently for IDs, reports, and logs.
 */
function formatDate_(dateValue, pattern) {
  return Utilities.formatDate(dateValue || new Date(), getConfiguredTimezone_(), pattern);
}

/**
 * Pads a number with leading zeros.
 */
function padNumber_(numberValue, width) {
  var text = String(numberValue);
  while (text.length < width) {
    text = '0' + text;
  }
  return text;
}

/**
 * Builds a compact random uppercase token.
 */
function randomToken_(length) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var token = '';
  for (var i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Generates a readable operational ID with timestamp and random suffix.
 */
function generateOperationalId_(prefix) {
  return prefix + '-' + formatDate_(new Date(), 'yyyyMMddHHmmss') + '-' + randomToken_(4);
}

/**
 * Reads a setting value from SETTINGS by key.
 */
function getSettingValue_(key, defaultValue) {
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.settings, false);
  if (!sheet || sheet.getLastRow() < 2) {
    return defaultValue;
  }
  var map = getHeaderMap_(sheet);
  var keyCol = requireColumn_(map, 'Key', cfg.sheets.settings);
  var valueCol = requireColumn_(map, 'Value', cfg.sheets.settings);
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][keyCol - 1] || '').trim() === key) {
      var value = values[i][valueCol - 1];
      return value === '' || typeof value === 'undefined' ? defaultValue : value;
    }
  }
  return defaultValue;
}

/**
 * Updates or appends a setting value.
 */
function setSettingValue_(key, value, description) {
  var cfg = tvjConfig_();
  var sheet = ensureSheet_(cfg.sheets.settings, cfg.headers.SETTINGS);
  var map = getHeaderMap_(sheet);
  var keyCol = requireColumn_(map, 'Key', cfg.sheets.settings);
  var valueCol = requireColumn_(map, 'Value', cfg.sheets.settings);
  var descriptionCol = map.Description || 0;
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var keys = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || '').trim() === key) {
        sheet.getRange(i + 2, valueCol).setValue(value);
        if (descriptionCol && typeof description !== 'undefined') {
          sheet.getRange(i + 2, descriptionCol).setValue(description);
        }
        return i + 2;
      }
    }
  }
  var row = {};
  row.Key = key;
  row.Value = value;
  row.Description = description || '';
  return appendObjectRow_(cfg.sheets.settings, row);
}

/**
 * Shows a toast when running from Sheets and always logs to Apps Script.
 */
function notifyUser_(message) {
  Logger.log(message);
  try {
    getSpreadsheet_().toast(String(message), tvjConfig_().appName, 8);
  } catch (err) {
    Logger.log('Toast skipped: ' + err.message);
  }
  return message;
}

/**
 * Runs a function inside a document lock.
 */
function withDocumentLock_(callback) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(tvjConfig_().lockWaitMs)) {
    throw new Error('Could not acquire document lock. Please try again.');
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Finds the first data row where a header equals a value.
 */
function findRowByHeaderValue_(sheetName, header, value) {
  var sheet = getSheet_(sheetName, true);
  var map = getHeaderMap_(sheet);
  var col = requireColumn_(map, header, sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  var target = String(value || '').trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === target) {
      return {
        sheet: sheet,
        rowNumber: i + 2,
        object: getRowObject_(sheet, i + 2)
      };
    }
  }
  return null;
}

/**
 * Builds a product lookup keyed by normalized SKU.
 */
function getProductLookupBySku_() {
  var cfg = tvjConfig_();
  var sheet = getSheet_(cfg.sheets.master, true);
  var rows = getRowsAsObjects_(cfg.sheets.master);
  var lookup = {};
  for (var i = 0; i < rows.length; i++) {
    var sku = normalizeSku_(rows[i].SKU);
    if (sku !== '') {
      lookup[sku] = {
        sheet: sheet,
        rowNumber: rows[i]._rowNumber,
        object: rows[i]
      };
    }
  }
  return lookup;
}

/**
 * Returns whether a product status should be treated as active.
 */
function isActiveProduct_(product) {
  var cfg = tvjConfig_();
  var status = normalizeText_(product.Status_Produk);
  return status !== cfg.statuses.inactive;
}

/**
 * Calculates stock status from current stock and minimum stock.
 */
function calculateStockStatus_(stock, minimumStock) {
  var cfg = tvjConfig_();
  var current = safeToNumber_(stock);
  var minimum = safeToNumber_(minimumStock);
  if (current <= 0) {
    return cfg.statuses.outOfStock;
  }
  if (current <= minimum) {
    return cfg.statuses.low;
  }
  return cfg.statuses.ready;
}

/**
 * Parses JSON safely with a caller-provided fallback value.
 */
function parseJsonSafe_(text, fallbackValue) {
  if (typeof text === 'object' && text !== null) {
    return text;
  }
  if (!text) {
    return fallbackValue;
  }
  try {
    return JSON.parse(String(text));
  } catch (err) {
    return fallbackValue;
  }
}

/**
 * Stringifies values without allowing circular structures to break logging.
 */
function stringifySafe_(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

/**
 * Truncates a text value for compact spreadsheet logs.
 */
function truncate_(value, maxLength) {
  var text = typeof value === 'string' ? value : stringifySafe_(value);
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Removes sensitive token-like fields before API logging.
 */
function sanitizeForLog_(value) {
  var obj = parseJsonSafe_(value, value);
  if (typeof obj !== 'object' || obj === null) {
    return String(value || '');
  }
  var clone = {};
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      var lower = String(key).toLowerCase();
      if (lower.indexOf('token') >= 0 || lower.indexOf('password') >= 0 || lower === 'authorization') {
        clone[key] = '[REDACTED]';
      } else {
        clone[key] = obj[key];
      }
    }
  }
  return stringifySafe_(clone);
}

/**
 * Returns whether two dates fall on the same configured calendar day.
 */
function isSameConfiguredDate_(a, b) {
  return formatDate_(a, 'yyyy-MM-dd') === formatDate_(b, 'yyyy-MM-dd');
}

/**
 * Converts a value to a Date or null.
 */
function asDateOrNull_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }
  if (!value) {
    return null;
  }
  var parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

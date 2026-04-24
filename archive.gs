var LOG_ARCHIVE_DEFAULT_DAYS = 30;
var ARCHIVE_TRIGGER_HANDLER = 'scheduledArchiveOldLogs';
var ARCHIVE_TARGET_SHEETS = [SHEETS.API_LOG, SHEETS.INVENTORY_LOG];
var ARCHIVE_DATE_HEADER_CANDIDATES = {
  API_LOG: ['Timestamp', 'Created_At', 'Tanggal'],
  INVENTORY_LOG: ['Timestamp', 'Created_At', 'Tanggal']
};

function archiveOldLogs() {
  return withDocumentLock_(function() {
    ensureArchiveSettingsDefaults_();

    var archiveDays = getLogArchiveDays_();
    var cutoffDate = getArchiveCutoffDate_(archiveDays);
    var archiveSpreadsheet = getArchiveSpreadsheet_();
    var results = [];
    var totalArchived = 0;

    ARCHIVE_TARGET_SHEETS.forEach(function(sheetName) {
      var result = archiveSheetRows_(sheetName, cutoffDate, archiveSpreadsheet);
      if (result.archived_count > 0) {
        results.push(result);
        totalArchived += result.archived_count;
      }
    });

    safeWriteArchiveLog_({
      status: 200,
      event: 'ARCHIVE_SUCCESS',
      message: 'Archive log berhasil diproses.',
      details: {
        archive_days: archiveDays,
        cutoff_date: formatTimestampJakarta_(cutoffDate),
        archive_spreadsheet_id: archiveSpreadsheet.getId(),
        total_archived: totalArchived,
        sheets: results
      }
    });

    return {
      success: true,
      archive_days: archiveDays,
      cutoff_date: formatTimestampJakarta_(cutoffDate),
      archive_spreadsheet_id: archiveSpreadsheet.getId(),
      total_archived: totalArchived,
      sheets: results
    };
  });
}

function scheduledArchiveOldLogs() {
  archiveOldLogs();
}

function installArchiveTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var archiveTriggers = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === ARCHIVE_TRIGGER_HANDLER;
  });

  if (archiveTriggers.length > 1) {
    archiveTriggers.slice(1).forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  }

  if (archiveTriggers.length >= 1) {
    return {
      installed: false,
      message: 'Trigger archive harian sudah ada. Tidak dibuat duplikat.',
      handler: ARCHIVE_TRIGGER_HANDLER
    };
  }

  ScriptApp.newTrigger(ARCHIVE_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .inTimezone(APP_TIMEZONE)
    .create();

  return {
    installed: true,
    message: 'Trigger archive harian berhasil dipasang.',
    handler: ARCHIVE_TRIGGER_HANDLER
  };
}

function getOrCreateArchiveSheet_(name, sourceHeaders) {
  var archiveSpreadsheet = getArchiveSpreadsheet_();
  var archiveSheet = archiveSpreadsheet.getSheetByName(name);

  if (!archiveSheet) {
    archiveSheet = archiveSpreadsheet.insertSheet(name);
  }

  ensureArchiveSheetHeader_(archiveSheet, sourceHeaders || []);
  return archiveSheet;
}

function cleanupCodexTestArtifacts() {
  return withDocumentLock_(function() {
    var cleanupConfig = {
      stockOutIds: ['OUT-20260423165332-UTI61O', 'OUT-20260423165615-HUKWWT'],
      stockInIds: ['IN-20260423165414-UK6PKG', 'IN-20260423165808-PMUFCL'],
      inventoryReferenceIds: [
        'OUT-20260423165332-UTI61O',
        'OUT-20260423165615-HUKWWT',
        'IN-20260423165414-UK6PKG',
        'IN-20260423165808-PMUFCL'
      ],
      skuToReset: 'JVS-0659'
    };

    var removedStockOut = deleteRowsByHeaderValues_(SHEETS.STOCK_OUT, 'Out_ID', cleanupConfig.stockOutIds);
    var removedStockIn = deleteRowsByHeaderValues_(SHEETS.STOCK_IN, 'In_ID', cleanupConfig.stockInIds);
    var removedInventoryLog = deleteRowsByHeaderValues_(
      SHEETS.INVENTORY_LOG,
      'Reference_ID',
      cleanupConfig.inventoryReferenceIds
    );
    var productReset = resetCleanupProductFields_(cleanupConfig.skuToReset);

    safeWriteArchiveLog_({
      status: 200,
      event: 'TEST_CLEANUP_SUCCESS',
      message: 'Cleanup data test Codex selesai.',
      details: {
        removed_stock_out: removedStockOut,
        removed_stock_in: removedStockIn,
        removed_inventory_log: removedInventoryLog,
        product_reset: productReset
      }
    });

    return {
      removed_stock_out: removedStockOut,
      removed_stock_in: removedStockIn,
      removed_inventory_log: removedInventoryLog,
      product_reset: productReset
    };
  });
}

function ensureArchiveSettingsDefaults_() {
  var settingsSheet = getSheetOrThrow_(SHEETS.SETTINGS);
  assertExpectedHeaders_(settingsSheet);

  if (!findRowByValue_(settingsSheet, 'Key', SETTINGS_KEYS.LOG_ARCHIVE_DAYS)) {
    setSettingValue_(
      SETTINGS_KEYS.LOG_ARCHIVE_DAYS,
      LOG_ARCHIVE_DEFAULT_DAYS,
      'Jumlah hari log aktif sebelum dipindahkan ke archive.'
    );
  }

  if (!findRowByValue_(settingsSheet, 'Key', SETTINGS_KEYS.ARCHIVE_SPREADSHEET_ID)) {
    setSettingValue_(
      SETTINGS_KEYS.ARCHIVE_SPREADSHEET_ID,
      '',
      'Jika kosong, archive log disimpan di spreadsheet yang sama.'
    );
  }
}

function getLogArchiveDays_() {
  var configuredValue = getSettingValue_(
    SETTINGS_KEYS.LOG_ARCHIVE_DAYS,
    LOG_ARCHIVE_DEFAULT_DAYS
  );
  var parsedDays = Math.floor(toNumber_(configuredValue));
  return parsedDays > 0 ? parsedDays : LOG_ARCHIVE_DEFAULT_DAYS;
}

function getArchiveCutoffDate_(archiveDays) {
  var cutoffDate = new Date();
  cutoffDate.setHours(0, 0, 0, 0);
  cutoffDate.setDate(cutoffDate.getDate() - archiveDays);
  return cutoffDate;
}

function getArchiveSpreadsheet_() {
  var archiveSpreadsheetId = String(
    getSettingValue_(SETTINGS_KEYS.ARCHIVE_SPREADSHEET_ID, '')
  ).trim();

  if (!archiveSpreadsheetId) {
    return getSpreadsheet_();
  }

  try {
    return SpreadsheetApp.openById(archiveSpreadsheetId);
  } catch (error) {
    throw new Error(
      'Archive_Spreadsheet_Id tidak valid atau tidak bisa diakses: ' + archiveSpreadsheetId
    );
  }
}

function archiveSheetRows_(sheetName, cutoffDate, archiveSpreadsheet) {
  var sourceSheet = getSheetOrThrow_(sheetName);
  assertExpectedHeaders_(sourceSheet);

  var lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) {
    return {
      source_sheet: sheetName,
      archived_count: 0,
      archive_sheets: []
    };
  }

  var sourceHeaders = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
  var dateHeader = getArchiveDateHeaderName_(sourceSheet);
  var dateColumn = getColumnIndex_(sourceSheet, dateHeader);
  var dateValues = sourceSheet.getRange(2, dateColumn, lastRow - 1, 1).getValues();
  var rowMetaList = [];

  for (var index = 0; index < dateValues.length; index += 1) {
    var parsedDate = parseArchiveDateValue_(dateValues[index][0]);
    if (!parsedDate || parsedDate.getTime() >= cutoffDate.getTime()) {
      continue;
    }

    rowMetaList.push({
      rowNumber: index + 2,
      archiveSheetName: buildArchiveSheetName_(sheetName, parsedDate)
    });
  }

  if (!rowMetaList.length) {
    return {
      source_sheet: sheetName,
      archived_count: 0,
      archive_sheets: []
    };
  }

  var rowNumbers = rowMetaList.map(function(item) {
    return item.rowNumber;
  });
  var rowDataMap = getSheetRowDataByNumbers_(sourceSheet, rowNumbers);
  var rowsByArchiveSheet = {};

  rowMetaList.forEach(function(item) {
    if (!rowDataMap[item.rowNumber]) {
      return;
    }

    if (!rowsByArchiveSheet[item.archiveSheetName]) {
      rowsByArchiveSheet[item.archiveSheetName] = [];
    }

    rowsByArchiveSheet[item.archiveSheetName].push(rowDataMap[item.rowNumber]);
  });

  var archiveSheetNames = Object.keys(rowsByArchiveSheet).sort();

  archiveSheetNames.forEach(function(archiveSheetName) {
    var archiveSheet = getOrCreateArchiveSheetInSpreadsheet_(
      archiveSpreadsheet,
      archiveSheetName,
      sourceHeaders
    );
    appendRowsToSheet_(archiveSheet, rowsByArchiveSheet[archiveSheetName]);
  });

  deleteRowsByNumbers_(sourceSheet, rowNumbers);

  return {
    source_sheet: sheetName,
    archived_count: rowNumbers.length,
    archive_sheets: archiveSheetNames
  };
}

function getArchiveDateHeaderName_(sheetOrName) {
  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var candidateHeaders = ARCHIVE_DATE_HEADER_CANDIDATES[sheet.getName()] || [
    'Timestamp',
    'Created_At',
    'Tanggal'
  ];

  for (var index = 0; index < candidateHeaders.length; index += 1) {
    var headerName = candidateHeaders[index];
    try {
      getColumnIndex_(sheet, headerName);
      return headerName;
    } catch (error) {
      // lanjut ke kandidat berikutnya
    }
  }

  throw new Error(
    'Kolom tanggal tidak ditemukan untuk sheet ' +
      sheet.getName() +
      '. Tambahkan kandidat header yang sesuai.'
  );
}

function parseArchiveDateValue_(value) {
  if (!value) {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : value;
  }

  var parsedDate = new Date(value);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function buildArchiveSheetName_(baseSheetName, dateValue) {
  return (
    baseSheetName +
    '_' +
    Utilities.formatDate(dateValue, APP_TIMEZONE, 'yyyy_MM')
  );
}

function getOrCreateArchiveSheetInSpreadsheet_(spreadsheet, sheetName, sourceHeaders) {
  var archiveSheet = spreadsheet.getSheetByName(sheetName);

  if (!archiveSheet) {
    archiveSheet = spreadsheet.insertSheet(sheetName);
  }

  ensureArchiveSheetHeader_(archiveSheet, sourceHeaders || []);
  return archiveSheet;
}

function ensureArchiveSheetHeader_(sheet, sourceHeaders) {
  if (!sourceHeaders || !sourceHeaders.length) {
    return;
  }

  var lastColumn = Math.max(sheet.getLastColumn(), sourceHeaders.length);

  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, sourceHeaders.length).setValues([sourceHeaders]);
    return;
  }

  var currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var normalizedCurrentHeaders = currentHeaders
    .slice(0, sourceHeaders.length)
    .map(function(header) {
      return String(header || '').trim();
    });
  var normalizedSourceHeaders = sourceHeaders.map(function(header) {
    return String(header || '').trim();
  });

  var hasAnyHeader = normalizedCurrentHeaders.some(function(header) {
    return header !== '';
  });

  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, sourceHeaders.length).setValues([sourceHeaders]);
    return;
  }

  if (normalizedCurrentHeaders.join('||') !== normalizedSourceHeaders.join('||')) {
    throw new Error('Header archive sheet tidak cocok untuk ' + sheet.getName());
  }
}

function getSheetRowDataByNumbers_(sheet, rowNumbers) {
  var rowDataMap = {};

  buildContiguousRowGroups_(rowNumbers).forEach(function(group) {
    var values = sheet
      .getRange(group.startRow, 1, group.count, sheet.getLastColumn())
      .getValues();

    values.forEach(function(rowValues, index) {
      rowDataMap[group.startRow + index] = rowValues;
    });
  });

  return rowDataMap;
}

function appendRowsToSheet_(sheet, rows) {
  if (!rows || !rows.length) {
    return 0;
  }

  var startRow = Math.max(sheet.getLastRow(), 1) + 1;
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length;
}

function deleteRowsByNumbers_(sheetOrName, rowNumbers) {
  if (!rowNumbers || !rowNumbers.length) {
    return 0;
  }

  var sheet = typeof sheetOrName === 'string' ? getSheetOrThrow_(sheetOrName) : sheetOrName;
  var deletedCount = 0;
  var groups = buildContiguousRowGroups_(rowNumbers).reverse();

  groups.forEach(function(group) {
    sheet.deleteRows(group.startRow, group.count);
    deletedCount += group.count;
  });

  return deletedCount;
}

function buildContiguousRowGroups_(rowNumbers) {
  if (!rowNumbers || !rowNumbers.length) {
    return [];
  }

  var sortedRows = rowNumbers
    .map(function(rowNumber) {
      return Number(rowNumber) || 0;
    })
    .filter(function(rowNumber) {
      return rowNumber >= 2;
    })
    .sort(function(left, right) {
      return left - right;
    });

  if (!sortedRows.length) {
    return [];
  }

  var groups = [];
  var currentStart = sortedRows[0];
  var currentEnd = sortedRows[0];

  for (var index = 1; index < sortedRows.length; index += 1) {
    var rowNumber = sortedRows[index];

    if (rowNumber === currentEnd || rowNumber === currentEnd + 1) {
      currentEnd = rowNumber;
      continue;
    }

    groups.push({
      startRow: currentStart,
      count: currentEnd - currentStart + 1
    });

    currentStart = rowNumber;
    currentEnd = rowNumber;
  }

  groups.push({
    startRow: currentStart,
    count: currentEnd - currentStart + 1
  });

  return groups;
}

function deleteRowsByHeaderValues_(sheetName, headerName, targetValues) {
  if (!targetValues || !targetValues.length) {
    return 0;
  }

  var normalizedTargets = {};
  targetValues.forEach(function(value) {
    normalizedTargets[normalizeString_(value)] = true;
  });

  var sheet = getSheetOrThrow_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }

  var columnIndex = getColumnIndex_(sheet, headerName);
  var values = sheet.getRange(2, columnIndex, lastRow - 1, 1).getValues();
  var rowsToDelete = [];

  values.forEach(function(rowValue, index) {
    if (normalizedTargets[normalizeString_(rowValue[0])]) {
      rowsToDelete.push(index + 2);
    }
  });

  return deleteRowsByNumbers_(sheet, rowsToDelete);
}

function resetCleanupProductFields_(sku) {
  if (!sku) {
    return false;
  }

  var product = getProductBySku_(sku);
  var sheet = getSheetOrThrow_(SHEETS.MASTER_PRODUCTS);

  setCellValueRespectFormula_(sheet, product.__rowNumber, 'Harga_Modal', '');
  setCellValueRespectFormula_(sheet, product.__rowNumber, 'Margin_Rp', '');
  setCellValueRespectFormula_(sheet, product.__rowNumber, 'Margin_Persen', '');
  stampMasterProductUpdate_(sku, 'ADMIN_CLEANUP');

  return true;
}

function safeWriteArchiveLog_(payload) {
  try {
    writeApiLog_({
      Timestamp: new Date(),
      Method: '',
      Endpoint: 'archiveOldLogs',
      Payload_Singkat: '',
      Status: payload.status || '',
      Response_Singkat: JSON.stringify({
        event: payload.event || '',
        message: payload.message || '',
        details: payload.details || {}
      })
    });
  } catch (error) {
    Logger.log('safeWriteArchiveLog_ error: ' + error.message);
  }
}

var SYSTEM_MONITOR_RECENT_LOG_LIMIT = 300;
var SYSTEM_MONITOR_RECENT_ORDER_LIMIT = 300;
var SYSTEM_MONITOR_NEW_ORDER_WARNING_HOURS = 6;
var SYSTEM_MONITOR_BACKUP_WARNING_HOURS = 24;
var SYSTEM_MONITOR_BACKUP_ERROR_HOURS = 48;
var SYSTEM_MONITOR_REPORTING_WARNING_HOURS = 24;

function apiAdminSystemMonitor_(payload, e) {
  requireAdminToken_(payload, e);

  var now = new Date();
  var apiLogs = getRecentSheetRowsForSystem_(SHEETS.API_LOG, SYSTEM_MONITOR_RECENT_LOG_LIMIT);
  var orders = getRecentSheetRowsForSystem_(SHEETS.ORDERS_WEBSITE, SYSTEM_MONITOR_RECENT_ORDER_LIMIT);
  var products = getActiveMasterProducts_();
  var todayKey = Utilities.formatDate(now, APP_TIMEZONE, 'yyyy-MM-dd');
  var todayApiLogs = apiLogs.filter(function(row) {
    return getSystemDateKey_(row.Timestamp) === todayKey;
  });
  var apiSummary = summarizeSystemApiLogs_(todayApiLogs);
  var cancelReviewOrders = findCancelReviewOrders_(orders);
  var stuckOrders = findStuckNewOrders_(orders, now);
  var productIssues = findSystemProductIssues_(products);
  var backupStatus = getBackupSystemStatus_(now);
  var reportingStatus = getReportingSystemStatus_(now);
  var alerts = buildSystemAlerts_({
    backupStatus: backupStatus,
    reportingStatus: reportingStatus,
    apiSummary: apiSummary,
    cancelReviewOrders: cancelReviewOrders,
    stuckOrders: stuckOrders,
    productIssues: productIssues
  });
  var recentIssues = buildRecentSystemIssues_({
    apiLogs: todayApiLogs,
    cancelReviewOrders: cancelReviewOrders,
    stuckOrders: stuckOrders,
    productIssues: productIssues
  });

  return buildSuccessEnvelope_(
    'System monitor berhasil diambil.',
    {
      generated_at: formatTimestampJakarta_(now),
      thresholds: {
        backup_warning_hours: SYSTEM_MONITOR_BACKUP_WARNING_HOURS,
        backup_error_hours: SYSTEM_MONITOR_BACKUP_ERROR_HOURS,
        reporting_warning_hours: SYSTEM_MONITOR_REPORTING_WARNING_HOURS,
        new_order_warning_hours: SYSTEM_MONITOR_NEW_ORDER_WARNING_HOURS,
        recent_log_limit: SYSTEM_MONITOR_RECENT_LOG_LIMIT,
        recent_order_limit: SYSTEM_MONITOR_RECENT_ORDER_LIMIT
      },
      status_cards: {
        apps_script: {
          status: 'HEALTHY',
          label: 'Aktif',
          detail: 'Apps Script menjawab request monitor.',
          checked_at: formatTimestampJakarta_(now)
        },
        backup: backupStatus,
        reporting: reportingStatus
      },
      summary: {
        total_requests_today: apiSummary.totalRequests,
        total_errors_today: apiSummary.errorCount,
        total_timeouts_today: apiSummary.timeoutCount,
        duplicate_blocked_today: apiSummary.duplicateBlockedCount,
        cancel_review_count: cancelReviewOrders.length,
        stuck_new_order_count: stuckOrders.length,
        negative_stock_count: productIssues.negativeStock.length,
        missing_product_data_count: productIssues.missingRequired.length
      },
      alerts: alerts,
      recent_issues: recentIssues
    },
    null
  );
}

function getRecentSheetRowsForSystem_(sheetName, limit) {
  var sheet = getSheetOrThrow_(sheetName);
  assertExpectedHeaders_(sheet);

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  var safeLimit = Math.max(1, Math.min(Number(limit || 100), 1000));
  var startRow = Math.max(2, lastRow - safeLimit + 1);
  var rowCount = lastRow - startRow + 1;
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var values = sheet.getRange(startRow, 1, rowCount, lastColumn).getValues();

  return values.map(function(rowValues, index) {
    var rowObject = {
      __rowNumber: startRow + index,
      __sheetName: sheetName
    };

    headers.forEach(function(header, columnIndex) {
      rowObject[String(header).trim()] = rowValues[columnIndex];
    });

    return rowObject;
  });
}

function summarizeSystemApiLogs_(logs) {
  var summary = {
    totalRequests: logs.length,
    errorCount: 0,
    timeoutCount: 0,
    duplicateBlockedCount: 0
  };

  logs.forEach(function(log) {
    var status = toNumber_(log.Status);
    var text = [
      log.Endpoint,
      log.Payload_Singkat,
      log.Response_Singkat
    ]
      .join(' ')
      .toUpperCase();

    if (status >= 400 || text.indexOf('"SUCCESS":FALSE') !== -1 || text.indexOf('ERROR') !== -1) {
      summary.errorCount += 1;
    }

    if (text.indexOf('TIMEOUT') !== -1 || text.indexOf('UPSTREAM_TIMEOUT') !== -1 || text.indexOf('LOCK_TIMEOUT') !== -1) {
      summary.timeoutCount += 1;
    }

    if (text.indexOf('DUPLICATE_ORDER') !== -1 || text.indexOf('DUPLICATE SUBMIT') !== -1) {
      summary.duplicateBlockedCount += 1;
    }
  });

  return summary;
}

function getBackupSystemStatus_(now) {
  var rawValue = getSettingValue_(SETTINGS_KEYS.LAST_BACKUP_TIME, '');
  var dateValue = coerceSystemDate_(rawValue);
  if (!dateValue) {
    return {
      status: 'UNKNOWN',
      label: 'Belum terbaca',
      detail: 'Last_Backup_Time belum ada di SETTINGS.',
      last_backup_time: ''
    };
  }

  var ageHours = getAgeHours_(dateValue, now);
  var status = 'HEALTHY';
  var label = 'Aman';
  var detail = 'Backup terakhir masih dalam rentang aman.';

  if (ageHours > SYSTEM_MONITOR_BACKUP_ERROR_HOURS) {
    status = 'ERROR';
    label = 'Perlu dicek';
    detail = 'Backup terakhir sudah lebih dari 48 jam.';
  } else if (ageHours > SYSTEM_MONITOR_BACKUP_WARNING_HOURS) {
    status = 'WARNING';
    label = 'Lewat 24 jam';
    detail = 'Backup terakhir sudah lebih dari 24 jam.';
  }

  return {
    status: status,
    label: label,
    detail: detail,
    last_backup_time: formatTimestampJakarta_(dateValue),
    age_hours: Math.round(ageHours * 10) / 10
  };
}

function getReportingSystemStatus_(now) {
  var rows = [];
  try {
    rows = getSheetRows_(SHEETS.DASHBOARD);
  } catch (error) {
    rows = [];
  }

  var latestDate = null;
  rows.forEach(function(row) {
    var dateValue = coerceSystemDate_(row.Last_Refreshed);
    if (dateValue && (!latestDate || dateValue.getTime() > latestDate.getTime())) {
      latestDate = dateValue;
    }
  });

  if (!latestDate) {
    return {
      status: 'UNKNOWN',
      label: 'Belum terbaca',
      detail: 'Last_Refreshed DASHBOARD belum tersedia.',
      last_refreshed: ''
    };
  }

  var ageHours = getAgeHours_(latestDate, now);
  var status = ageHours > SYSTEM_MONITOR_REPORTING_WARNING_HOURS ? 'WARNING' : 'HEALTHY';

  return {
    status: status,
    label: status === 'HEALTHY' ? 'Aman' : 'Perlu refresh',
    detail:
      status === 'HEALTHY'
        ? 'Dashboard/reporting baru saja diperbarui.'
        : 'Reporting terakhir sudah lebih dari 24 jam.',
    last_refreshed: formatTimestampJakarta_(latestDate),
    age_hours: Math.round(ageHours * 10) / 10
  };
}

function findCancelReviewOrders_(orders) {
  return orders.filter(function(order) {
    var note = String(order.Catatan || '');
    return note.indexOf('[CANCEL_PROCESSING:') !== -1 && note.indexOf('[CANCEL_RESTORED:') === -1;
  });
}

function findStuckNewOrders_(orders, now) {
  return orders.filter(function(order) {
    if (normalizeString_(order.Status_Order) !== 'NEW') {
      return false;
    }

    var dateValue = coerceSystemDate_(order.Created_At || order.Order_Date);
    return dateValue && getAgeHours_(dateValue, now) > SYSTEM_MONITOR_NEW_ORDER_WARNING_HOURS;
  });
}

function findSystemProductIssues_(products) {
  var issues = {
    negativeStock: [],
    missingRequired: []
  };

  products.forEach(function(product) {
    var stock = toNumber_(product.Stok_Aktif);
    if (stock < 0) {
      issues.negativeStock.push(product);
    }

    if (!String(product.SKU || '').trim() || !String(product.Nama_Produk || '').trim() || product.Stok_Aktif === '' || product.Stok_Aktif === null || product.Stok_Aktif === undefined) {
      issues.missingRequired.push(product);
    }
  });

  return issues;
}

function buildSystemAlerts_(context) {
  var alerts = [];

  if (context.backupStatus.status === 'ERROR' || context.backupStatus.status === 'WARNING' || context.backupStatus.status === 'UNKNOWN') {
    alerts.push(createSystemAlert_(
      context.backupStatus.status === 'ERROR' ? 'ERROR' : 'WARNING',
      'Backup perlu dicek',
      context.backupStatus.detail,
      'SETTINGS'
    ));
  }

  if (context.reportingStatus.status === 'WARNING' || context.reportingStatus.status === 'UNKNOWN') {
    alerts.push(createSystemAlert_(
      'WARNING',
      'Reporting perlu refresh',
      context.reportingStatus.detail,
      'DASHBOARD'
    ));
  }

  if (context.cancelReviewOrders.length) {
    alerts.push(createSystemAlert_(
      'ERROR',
      'Ada cancel order perlu review',
      context.cancelReviewOrders.length + ' order memiliki marker CANCEL_PROCESSING tanpa CANCEL_RESTORED.',
      'ORDERS_WEBSITE'
    ));
  }

  if (context.stuckOrders.length) {
    alerts.push(createSystemAlert_(
      'WARNING',
      'Ada order NEW terlalu lama',
      context.stuckOrders.length + ' order NEW lebih dari ' + SYSTEM_MONITOR_NEW_ORDER_WARNING_HOURS + ' jam.',
      'ORDERS_WEBSITE'
    ));
  }

  if (context.apiSummary.errorCount) {
    alerts.push(createSystemAlert_(
      'WARNING',
      'Ada error API hari ini',
      context.apiSummary.errorCount + ' error tercatat di API_LOG hari ini.',
      'API_LOG'
    ));
  }

  if (context.apiSummary.timeoutCount) {
    alerts.push(createSystemAlert_(
      'WARNING',
      'Ada timeout hari ini',
      context.apiSummary.timeoutCount + ' timeout tercatat di API_LOG hari ini.',
      'API_LOG'
    ));
  }

  if (context.productIssues.negativeStock.length) {
    alerts.push(createSystemAlert_(
      'ERROR',
      'Ada stok minus',
      context.productIssues.negativeStock.length + ' produk aktif punya stok minus.',
      'MASTER_PRODUCTS'
    ));
  }

  if (context.productIssues.missingRequired.length) {
    alerts.push(createSystemAlert_(
      'WARNING',
      'Ada data produk penting kosong',
      context.productIssues.missingRequired.length + ' produk aktif perlu dicek SKU, nama, atau stok.',
      'MASTER_PRODUCTS'
    ));
  }

  return alerts.slice(0, 12);
}

function buildRecentSystemIssues_(context) {
  var issues = [];

  context.apiLogs.forEach(function(log) {
    var status = toNumber_(log.Status);
    var text = String(log.Response_Singkat || '').toUpperCase();
    if (status < 400 && text.indexOf('ERROR') === -1 && text.indexOf('TIMEOUT') === -1 && text.indexOf('DUPLICATE_ORDER') === -1) {
      return;
    }

    issues.push({
      timestamp: formatSystemTimestampOrFallback_(log.Timestamp),
      source: 'API_LOG',
      type: text.indexOf('DUPLICATE_ORDER') !== -1 ? 'DUPLICATE_BLOCKED' : text.indexOf('TIMEOUT') !== -1 ? 'TIMEOUT' : 'API_ERROR',
      severity: status >= 500 || text.indexOf('TIMEOUT') !== -1 ? 'ERROR' : 'WARNING',
      note: String(log.Endpoint || '-') + ' | status ' + String(log.Status || '-')
    });
  });

  context.cancelReviewOrders.forEach(function(order) {
    issues.push({
      timestamp: formatSystemTimestampOrFallback_(order.Created_At || order.Order_Date),
      source: 'ORDERS_WEBSITE',
      type: 'CANCEL_REVIEW',
      severity: 'ERROR',
      note: String(order.Order_ID || '-') + ' perlu review cancel.'
    });
  });

  context.stuckOrders.forEach(function(order) {
    issues.push({
      timestamp: formatSystemTimestampOrFallback_(order.Created_At || order.Order_Date),
      source: 'ORDERS_WEBSITE',
      type: 'ORDER_STUCK',
      severity: 'WARNING',
      note: String(order.Order_ID || '-') + ' masih NEW lebih dari ' + SYSTEM_MONITOR_NEW_ORDER_WARNING_HOURS + ' jam.'
    });
  });

  context.productIssues.negativeStock.slice(0, 5).forEach(function(product) {
    issues.push({
      timestamp: formatTimestampJakarta_(new Date()),
      source: 'MASTER_PRODUCTS',
      type: 'NEGATIVE_STOCK',
      severity: 'ERROR',
      note: String(product.SKU || '-') + ' stok ' + String(product.Stok_Aktif)
    });
  });

  return issues
    .sort(function(left, right) {
      return String(right.timestamp || '').localeCompare(String(left.timestamp || ''));
    })
    .slice(0, 12);
}

function createSystemAlert_(severity, title, message, source) {
  return {
    severity: severity,
    title: title,
    message: message,
    source: source
  };
}

function getSystemDateKey_(value) {
  var dateValue = coerceSystemDate_(value);
  return dateValue ? Utilities.formatDate(dateValue, APP_TIMEZONE, 'yyyy-MM-dd') : '';
}

function getAgeHours_(dateValue, now) {
  return Math.max(0, (now.getTime() - dateValue.getTime()) / (60 * 60 * 1000));
}

function coerceSystemDate_(value) {
  if (!value) {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }

  var rawValue = String(value).trim();
  var match = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }

  var parsed = new Date(rawValue);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatSystemTimestampOrFallback_(value) {
  var dateValue = coerceSystemDate_(value);
  return dateValue ? formatTimestampJakarta_(dateValue) : 'Belum terbaca';
}

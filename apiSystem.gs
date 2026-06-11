/**
 * Returns a compact dashboard summary for website or admin views.
 */
function apiDashboardSummary_() {
  return apiSuccess_('DASHBOARD_SUMMARY_OK', getDashboardMetrics_());
}

/**
 * Returns health information and validates required sheets/headers.
 */
function apiHealth_() {
  var smoke = runInternalSmokeTest();
  return apiSuccess_('HEALTH_OK', smoke);
}

/**
 * Returns admin system monitor data with warnings instead of route failures.
 */
function apiAdminSystemMonitor_() {
  var lastBackupTime = getSettingValue_('Last_Backup_Time', '');
  var lastReportingRefresh = getSettingValue_('Last_Refreshed_DASHBOARD', '');
  var alerts = [];
  if (!lastBackupTime) {
    alerts.push(buildSystemMonitorAlert_('Last_Backup_Time belum ada di SETTINGS.', 'BACKUP'));
  }
  if (!lastReportingRefresh) {
    alerts.push(buildSystemMonitorAlert_('Last_Refreshed_DASHBOARD belum ada di SETTINGS.', 'REPORTING'));
  }

  var data = {
    status: alerts.length > 0 ? 'WARNING' : 'OK',
    api_proxy_status: 'ACTIVE',
    apps_script_status: 'ACTIVE',
    last_backup_time: lastBackupTime || 'UNKNOWN',
    last_reporting_refresh: lastReportingRefresh || 'UNKNOWN',
    generated_at: new Date(),
    warnings: alerts.map(function(alert) {
      return alert.title;
    }),
    alerts: alerts,
    status_cards: buildLightweightSystemMonitorStatusCards_(lastBackupTime, lastReportingRefresh),
    summary: {
      total_requests_today: 0,
      total_errors_today: 0,
      total_timeouts_today: 0,
      duplicate_blocked_today: 0,
      cancel_review_count: 0
    },
    thresholds: buildSystemMonitorThresholds_(),
    recent_issues: [],
    settings: {
      last_backup_time: lastBackupTime || 'UNKNOWN',
      last_reporting_refresh: lastReportingRefresh || 'UNKNOWN'
    }
  };

  return apiSuccess_(alerts.length > 0 ? 'SYSTEM_MONITOR_WARNING' : 'SYSTEM_MONITOR_OK', data);
}

/**
 * Builds lightweight status cards for the admin system monitor UI.
 */
function buildLightweightSystemMonitorStatusCards_(lastBackupTime, lastReportingRefresh) {
  var hasBackupTime = !!lastBackupTime;
  var hasReportingRefresh = !!lastReportingRefresh;
  return {
    proxy: {
      status: 'HEALTHY',
      label: 'ACTIVE',
      detail: 'Proxy berhasil meneruskan request ke Apps Script.'
    },
    apps_script: {
      status: 'HEALTHY',
      label: 'ACTIVE',
      detail: 'Endpoint system monitor Apps Script aktif.'
    },
    backup: {
      status: hasBackupTime ? 'HEALTHY' : 'UNKNOWN',
      label: hasBackupTime ? 'Terbaca' : 'UNKNOWN',
      detail: hasBackupTime ? 'Last_Backup_Time terbaca dari SETTINGS.' : 'Last_Backup_Time belum ada di SETTINGS.',
      last_backup_time: hasBackupTime ? lastBackupTime : ''
    },
    reporting: {
      status: hasReportingRefresh ? 'HEALTHY' : 'UNKNOWN',
      label: hasReportingRefresh ? 'Terbaca' : 'UNKNOWN',
      detail: hasReportingRefresh ? 'Last_Refreshed_DASHBOARD terbaca dari SETTINGS.' : 'Last_Refreshed_DASHBOARD belum ada di SETTINGS.',
      last_refreshed: hasReportingRefresh ? lastReportingRefresh : ''
    }
  };
}

/**
 * Builds one lightweight monitor alert.
 */
function buildSystemMonitorAlert_(message, source) {
  return {
    severity: 'WARNING',
    title: 'SETTING_UNKNOWN',
    message: message,
    source: source
  };
}

/**
 * Returns default monitor thresholds used by the UI.
 */
function buildSystemMonitorThresholds_() {
  return {
    backup_warning_hours: 24,
    backup_error_hours: 48,
    new_order_warning_hours: 6,
    recent_log_limit: 300
  };
}

/**
 * Summarizes configured sheets for the admin system monitor.
 */
function summarizeSheetsForMonitor_() {
  var cfg = tvjConfig_();
  var names = [
    cfg.sheets.master,
    cfg.sheets.stockIn,
    cfg.sheets.stockOut,
    cfg.sheets.orders,
    cfg.sheets.inventoryLog,
    cfg.sheets.settings,
    cfg.sheets.dashboard,
    cfg.sheets.weeklyReport,
    cfg.sheets.monthlyReport,
    cfg.sheets.apiLog,
    cfg.sheets.apiLogArchive
  ];
  var summary = {};
  for (var i = 0; i < names.length; i++) {
    var sheet = getSheet_(names[i], false);
    summary[names[i]] = {
      exists: !!sheet,
      rows: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0,
      columns: sheet ? sheet.getLastColumn() : 0
    };
  }
  return summary;
}

/**
 * Summarizes a log-like sheet without requiring it to exist.
 */
function summarizeLogSheet_(sheetName) {
  var sheet = getSheet_(sheetName, false);
  if (!sheet) {
    return {
      exists: false,
      rows: 0,
      last_timestamp: ''
    };
  }
  var lastTimestamp = '';
  if (sheet.getLastRow() >= 2 && sheet.getLastColumn() >= 1) {
    var map = getHeaderMap_(sheet);
    var timestampCol = map.Timestamp || 1;
    lastTimestamp = sheet.getRange(sheet.getLastRow(), timestampCol).getValue();
  }
  return {
    exists: true,
    rows: Math.max(0, sheet.getLastRow() - 1),
    last_timestamp: lastTimestamp
  };
}

/**
 * Internal smoke test that validates structure and parsing without stock mutation.
 */
function runInternalSmokeTest() {
  var cfg = tvjConfig_();
  var results = {
    ok: true,
    generated_at: new Date(),
    sheets: {},
    number_tests: {},
    test_mode: isTruthySetting_(getSettingValue_(cfg.settingsKeys.testMode, 'FALSE')),
    notes: []
  };
  var sheetNames = [
    cfg.sheets.master,
    cfg.sheets.stockIn,
    cfg.sheets.stockOut,
    cfg.sheets.orders,
    cfg.sheets.inventoryLog,
    cfg.sheets.settings,
    cfg.sheets.dashboard,
    cfg.sheets.weeklyReport,
    cfg.sheets.monthlyReport,
    cfg.sheets.apiLog,
    cfg.sheets.apiLogArchive
  ];
  for (var i = 0; i < sheetNames.length; i++) {
    var name = sheetNames[i];
    var sheet = getSheet_(name, false);
    var requiredHeaders = cfg.headers[name] || [];
    var missing = requiredHeaders.length > 0 ? findMissingHeaders_(name, requiredHeaders) : [];
    results.sheets[name] = {
      exists: !!sheet,
      missing_headers: missing
    };
    if (!sheet || missing.length > 0) {
      results.ok = false;
    }
  }
  var tests = {
    'Rp85,000': 85000,
    '85.000': 85000,
    '85000': 85000,
    '1.250.000,50': 1250000.5
  };
  for (var input in tests) {
    if (tests.hasOwnProperty(input)) {
      var parsed = safeToNumber_(input);
      results.number_tests[input] = parsed;
      if (Math.abs(parsed - tests[input]) > 0.0001) {
        results.ok = false;
        results.notes.push('safeToNumber_ failed for ' + input);
      }
    }
  }
  if (!results.test_mode) {
    results.notes.push('TEST_MODE is false; no mutating smoke test was run.');
  }
  Logger.log(stringifySafe_(results));
  return results;
}

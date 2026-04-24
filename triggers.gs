function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TVJ Inventory')
    .addItem('Process row STOCK_IN aktif', 'processActiveStockInRow')
    .addItem('Process row STOCK_OUT aktif', 'processActiveStockOutRow')
    .addSeparator()
    .addItem('Process semua pending STOCK_IN', 'runProcessPendingStockInRows')
    .addItem('Process semua pending STOCK_OUT', 'runProcessPendingStockOutRows')
    .addSeparator()
    .addItem('Recompute semua Status_Stok', 'runRecomputeAllStockStatus')
    .addItem('Validate MASTER_PRODUCTS', 'runValidateMasterProducts')
    .addItem('Generate Product_ID yang kosong', 'runGenerateMissingProductIds')
    .addItem('Backfill margin produk', 'runBackfillMargins')
    .addItem('Create sample data jika kosong', 'runCreateSampleDataIfEmpty')
    .addSeparator()
    .addItem('Refresh DASHBOARD', 'runRefreshDashboard')
    .addItem('Generate WEEKLY_REPORT', 'runGenerateWeeklyReport')
    .addItem('Generate MONTHLY_REPORT', 'runGenerateMonthlyReport')
    .addItem('Refresh semua reporting', 'runRefreshAllReporting')
    .addItem('Install trigger reporting', 'runInstallReportingTimeTriggers')
    .addSeparator()
    .addItem('Backup spreadsheet sekarang', 'runBackupSpreadsheet')
    .addItem('Install trigger backup harian', 'runInstallBackupTrigger')
    .addItem('Jalankan Archive Sekarang', 'runArchiveOldLogs')
    .addItem('Install Trigger Archive', 'runInstallArchiveTrigger')
    .addSeparator()
    .addItem('Bersihkan data test Codex', 'runCleanupCodexTestArtifacts')
    .addToUi();
}

function processActiveStockInRow() {
  try {
    var context = getActiveRowContext_();
    if (context.sheet.getName() !== SHEETS.STOCK_IN) {
      throw new Error('Pilih row pada sheet STOCK_IN terlebih dahulu.');
    }
    processStockInRowByNumber(context.rowNumber);
  } catch (error) {
    showUiAlert_('Gagal memproses STOCK_IN', error.message);
  }
}

function processActiveStockOutRow() {
  try {
    var context = getActiveRowContext_();
    if (context.sheet.getName() !== SHEETS.STOCK_OUT) {
      throw new Error('Pilih row pada sheet STOCK_OUT terlebih dahulu.');
    }
    processStockOutRowByNumber(context.rowNumber);
  } catch (error) {
    showUiAlert_('Gagal memproses STOCK_OUT', error.message);
  }
}

function runValidateMasterProducts() {
  try {
    validateMasterProducts();
  } catch (error) {
    showUiAlert_('Validasi MASTER_PRODUCTS gagal', error.message);
  }
}

function runProcessPendingStockInRows() {
  try {
    processPendingStockInRows();
  } catch (error) {
    showUiAlert_('Gagal memproses pending STOCK_IN', error.message);
  }
}

function runProcessPendingStockOutRows() {
  try {
    processPendingStockOutRows();
  } catch (error) {
    showUiAlert_('Gagal memproses pending STOCK_OUT', error.message);
  }
}

function runRecomputeAllStockStatus() {
  try {
    recomputeAllStockStatus();
  } catch (error) {
    showUiAlert_('Gagal recompute Status_Stok', error.message);
  }
}

function runGenerateMissingProductIds() {
  try {
    generateMissingProductIds();
  } catch (error) {
    showUiAlert_('Gagal generate Product_ID', error.message);
  }
}

function runBackfillMargins() {
  try {
    backfillMargins();
  } catch (error) {
    showUiAlert_('Gagal backfill margin', error.message);
  }
}

function runCreateSampleDataIfEmpty() {
  try {
    createSampleDataIfEmpty();
  } catch (error) {
    showUiAlert_('Gagal membuat sample data', error.message);
  }
}

function runRefreshDashboard() {
  try {
    refreshDashboard();
  } catch (error) {
    showUiAlert_('Gagal refresh DASHBOARD', error.message);
  }
}

function runGenerateWeeklyReport() {
  try {
    generateWeeklyReport();
  } catch (error) {
    showUiAlert_('Gagal generate WEEKLY_REPORT', error.message);
  }
}

function runGenerateMonthlyReport() {
  try {
    generateMonthlyReport();
  } catch (error) {
    showUiAlert_('Gagal generate MONTHLY_REPORT', error.message);
  }
}

function runRefreshAllReporting() {
  try {
    refreshAllReporting();
  } catch (error) {
    showUiAlert_('Gagal refresh semua reporting', error.message);
  }
}

function runInstallReportingTimeTriggers() {
  try {
    installReportingTimeTriggers();
  } catch (error) {
    showUiAlert_('Gagal install trigger reporting', error.message);
  }
}

function runBackupSpreadsheet() {
  try {
    var result = backupSpreadsheet();
    showUiAlert_(
      'Backup berhasil',
      'Backup tersimpan: ' + result.backup_file_name + '\nFolder ID: ' + result.backup_folder_id
    );
  } catch (error) {
    showUiAlert_('Backup gagal', error.message);
  }
}

function runInstallBackupTrigger() {
  try {
    var result = installBackupTrigger();
    showUiAlert_('Trigger backup', result.message);
  } catch (error) {
    showUiAlert_('Gagal install trigger backup', error.message);
  }
}

function runArchiveOldLogs() {
  try {
    var result = archiveOldLogs();
    showUiAlert_(
      'Archive selesai',
      'Total row dipindahkan: ' +
        result.total_archived +
        '\nCutoff: ' +
        result.cutoff_date +
        '\nFile archive: ' +
        result.archive_spreadsheet_id
    );
  } catch (error) {
    showUiAlert_('Archive gagal', error.message);
  }
}

function runInstallArchiveTrigger() {
  try {
    var result = installArchiveTrigger();
    showUiAlert_('Trigger archive', result.message);
  } catch (error) {
    showUiAlert_('Gagal install trigger archive', error.message);
  }
}

function runCleanupCodexTestArtifacts() {
  try {
    var result = cleanupCodexTestArtifacts();
    showUiAlert_(
      'Cleanup test selesai',
      'STOCK_OUT dihapus: ' +
        result.removed_stock_out +
        '\nSTOCK_IN dihapus: ' +
        result.removed_stock_in +
        '\nINVENTORY_LOG dihapus: ' +
        result.removed_inventory_log
    );
  } catch (error) {
    showUiAlert_('Cleanup test gagal', error.message);
  }
}

function handleInventoryEditTrigger(e) {
  if (!ENABLE_ON_EDIT_AUTOMATION || !e || !e.range) {
    return;
  }

  try {
    var sheet = e.range.getSheet();
    var rowNumber = e.range.getRow();
    if (rowNumber < 2) {
      return;
    }

    if (sheet.getName() === SHEETS.STOCK_IN) {
      var stockInRow = getRowObject_(sheet, rowNumber);
      if (isStockInRowReady_(stockInRow)) {
        var inId = stockInRow.In_ID || ensureTransactionId_(sheet, rowNumber, 'In_ID');
        if (!inventoryLogExists_('STOCK_IN', inId)) {
          processStockInRowByNumber(rowNumber);
        }
      }
      return;
    }

    if (sheet.getName() === SHEETS.STOCK_OUT) {
      var stockOutRow = getRowObject_(sheet, rowNumber);
      if (isStockOutRowReady_(stockOutRow)) {
        var outId = stockOutRow.Out_ID || ensureTransactionId_(sheet, rowNumber, 'Out_ID');
        if (!inventoryLogExists_('STOCK_OUT', outId)) {
          processStockOutRowByNumber(rowNumber);
        }
      }
    }
  } catch (error) {
    Logger.log('handleInventoryEditTrigger error: ' + error.message);
  }
}

function installOptionalOnEditTrigger() {
  var triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'handleInventoryEditTrigger') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('handleInventoryEditTrigger')
    .forSpreadsheet(getSpreadsheet_())
    .onEdit()
    .create();

  showUiAlert_(
    'Trigger install selesai',
    'Installable onEdit trigger untuk handleInventoryEditTrigger sudah dibuat.'
  );
}

function getActiveRowContext_() {
  var sheet = getSpreadsheet_().getActiveSheet();
  var rowNumber = sheet.getActiveRange().getRow();

  if (rowNumber < 2) {
    throw new Error('Pilih row data, bukan header.');
  }

  return {
    sheet: sheet,
    rowNumber: rowNumber
  };
}

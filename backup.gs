var BACKUP_FOLDER_DEFAULT_NAME = 'Toko Vespa Jogja - Backup Spreadsheet';
var BACKUP_TRIGGER_HANDLER = 'scheduledBackupSpreadsheet';

function backupSpreadsheet() {
  return withDocumentLock_(function() {
    var spreadsheet = getSpreadsheet_();
    var timestamp = Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyyyMMdd-HHmmss');
    var backupName = spreadsheet.getName() + ' - backup - ' + timestamp;

    try {
      var folder = getOrCreateBackupFolder_();
      SpreadsheetApp.flush();

      var sourceFile = DriveApp.getFileById(spreadsheet.getId());
      var backupFile = sourceFile.makeCopy(backupName, folder);
      var finishedAt = new Date();
      var formattedFinishedAt = formatTimestampJakarta_(finishedAt);

      setSettingValue_(
        SETTINGS_KEYS.LAST_BACKUP_TIME,
        formattedFinishedAt,
        'Waktu backup spreadsheet terakhir yang berhasil dibuat.'
      );

      safeWriteBackupLog_({
        status: 200,
        message: 'Backup spreadsheet berhasil.',
        details: {
          backup_file_id: backupFile.getId(),
          backup_file_name: backupName,
          backup_folder_id: folder.getId()
        }
      });

      return {
        success: true,
        backup_file_id: backupFile.getId(),
        backup_file_name: backupName,
        backup_folder_id: folder.getId(),
        last_backup_time: formattedFinishedAt
      };
    } catch (error) {
      safeWriteBackupLog_({
        status: 500,
        message: 'Backup spreadsheet gagal.',
        details: {
          error: error.message
        }
      });
      throw error;
    }
  });
}

function scheduledBackupSpreadsheet() {
  backupSpreadsheet();
}

function installBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var backupTriggers = triggers.filter(function(trigger) {
    return trigger.getHandlerFunction() === BACKUP_TRIGGER_HANDLER;
  });

  if (backupTriggers.length > 1) {
    backupTriggers.slice(1).forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  }

  if (backupTriggers.length >= 1) {
    return {
      installed: false,
      message: 'Trigger backup harian sudah ada. Tidak dibuat duplikat.',
      handler: BACKUP_TRIGGER_HANDLER
    };
  }

  ScriptApp.newTrigger(BACKUP_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .inTimezone(APP_TIMEZONE)
    .create();

  return {
    installed: true,
    message: 'Trigger backup harian berhasil dipasang.',
    handler: BACKUP_TRIGGER_HANDLER
  };
}

function getOrCreateBackupFolder_() {
  var configuredFolderId = String(
    getSettingValue_(SETTINGS_KEYS.BACKUP_FOLDER_ID, '')
  ).trim();

  if (configuredFolderId) {
    try {
      return DriveApp.getFolderById(configuredFolderId);
    } catch (error) {
      throw new Error(
        'Backup_Folder_Id tidak valid atau tidak bisa diakses: ' + configuredFolderId
      );
    }
  }

  var folder = DriveApp.createFolder(BACKUP_FOLDER_DEFAULT_NAME);
  setSettingValue_(
    SETTINGS_KEYS.BACKUP_FOLDER_ID,
    folder.getId(),
    'Folder Google Drive untuk backup otomatis spreadsheet Toko Vespa Jogja.'
  );

  return folder;
}

function safeWriteBackupLog_(payload) {
  try {
    writeApiLog_({
      Timestamp: new Date(),
      Method: '',
      Endpoint: 'backupSpreadsheet',
      Payload_Singkat: '',
      Status: payload.status || '',
      Response_Singkat: JSON.stringify({
        message: payload.message || '',
        details: payload.details || {}
      })
    });
  } catch (error) {
    Logger.log('safeWriteBackupLog_ error: ' + error.message);
  }
}

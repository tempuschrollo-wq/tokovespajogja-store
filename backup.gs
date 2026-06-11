/**
 * Copies the active spreadsheet to the configured backup folder.
 */
function backupSpreadsheetNow() {
  var cfg = tvjConfig_();
  var folderId = String(getSettingValue_(cfg.settingsKeys.backupFolderId, '') || '').trim();
  if (folderId === '') {
    throw new Error('Backup_Folder_Id is not configured in SETTINGS.');
  }
  var ss = getSpreadsheet_();
  var sourceFile = DriveApp.getFileById(ss.getId());
  var folder = DriveApp.getFolderById(folderId);
  var copyName = ss.getName() + ' Backup ' + formatDate_(new Date(), 'yyyy-MM-dd HH:mm:ss');
  var backupFile = sourceFile.makeCopy(copyName, folder);
  setSettingValue_(cfg.settingsKeys.lastBackupTime, new Date(), 'Last spreadsheet backup timestamp');
  return notifyUser_('Backup spreadsheet sekarang complete: ' + backupFile.getName());
}

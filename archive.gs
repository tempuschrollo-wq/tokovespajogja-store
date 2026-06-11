/**
 * Moves old API_LOG rows into API_LOG_ARCHIVE and keeps both headers intact.
 */
function archiveOldLogsNow() {
  var cfg = tvjConfig_();
  var days = safeToNumber_(getSettingValue_(cfg.settingsKeys.logArchiveDays, 30));
  if (days <= 0) {
    days = 30;
  }
  var source = ensureSheet_(cfg.sheets.apiLog, cfg.headers.API_LOG);
  var archive = ensureSheet_(cfg.sheets.apiLogArchive, cfg.headers.API_LOG_ARCHIVE);
  if (source.getLastRow() < 2) {
    return notifyUser_('Archive API_LOG: no rows to archive.');
  }
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  var map = getHeaderMap_(source);
  var timestampCol = requireColumn_(map, 'Timestamp', cfg.sheets.apiLog);
  var values = source.getRange(2, 1, source.getLastRow() - 1, source.getLastColumn()).getValues();
  var rowsToArchive = [];
  var rowsToDelete = [];
  for (var i = 0; i < values.length; i++) {
    var timestamp = asDateOrNull_(values[i][timestampCol - 1]);
    if (timestamp && timestamp.getTime() < cutoff.getTime()) {
      rowsToArchive.push(values[i]);
      rowsToDelete.push(i + 2);
    }
  }
  if (rowsToArchive.length === 0) {
    return notifyUser_('Archive API_LOG: no rows older than ' + days + ' day(s).');
  }
  archive.getRange(archive.getLastRow() + 1, 1, rowsToArchive.length, rowsToArchive[0].length).setValues(rowsToArchive);
  for (var r = rowsToDelete.length - 1; r >= 0; r--) {
    source.deleteRow(rowsToDelete[r]);
  }
  return notifyUser_('Archive API_LOG complete: ' + rowsToArchive.length + ' row(s) moved.');
}

/**
 * Adds the TVJ Inventory admin menu without changing existing menu labels.
 */
function onOpen() {
  var cfg = tvjConfig_();
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu(cfg.appName);
  for (var i = 0; i < cfg.menu.length; i++) {
    menu.addItem(cfg.menu[i][0], cfg.menu[i][1]);
  }
  menu.addToUi();
}

/**
 * Installs a daily reporting refresh trigger.
 */
function installReportingTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'scheduledRefreshReporting_') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('scheduledRefreshReporting_')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  return notifyUser_('Install trigger reporting: daily 06:00 trigger installed.');
}

/**
 * Trigger handler for scheduled report refreshes.
 */
function scheduledRefreshReporting_() {
  refreshAllReporting();
}

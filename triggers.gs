/**
 * Adds a client-safe TVJ Inventory menu with technical actions grouped below it.
 */
function onOpen() {
  var cfg = tvjConfig_();
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu(cfg.appName);
  addMenuItems_(menu, cfg.menu || []);

  if (cfg.maintenanceMenu && cfg.maintenanceMenu.length > 0) {
    var maintenanceMenu = ui.createMenu('Maintenance / Developer');
    addMenuItems_(maintenanceMenu, cfg.maintenanceMenu);
    menu.addSubMenu(maintenanceMenu);
  }

  menu.addToUi();
}

function addMenuItems_(menu, items) {
  for (var i = 0; i < items.length; i++) {
    menu.addItem(items[i][0], items[i][1]);
  }
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
  archivePreviousReports();
}

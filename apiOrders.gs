/**
 * Public order endpoint wrapper.
 */
function apiCreateOrder_(payload) {
  return createWebsiteOrder(payload);
}

/**
 * Admin order cancellation endpoint wrapper.
 */
function apiCancelOrder_(payload) {
  var orderId = payload.order_id || payload.Order_ID || payload.id || '';
  var actor = payload.actor || payload.Actor || payload.admin || 'ADMIN_API';
  return cancelWebsiteOrder(orderId, actor);
}

/**
 * Admin order delete/archive endpoint. This never changes stock.
 */
function apiDeleteOrder_(payload) {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var orderId = String(payload.order_id || payload.Order_ID || payload.id || '').trim();
    var actor = String(payload.actor || payload.Actor || payload.admin || 'ADMIN_API').trim();
    if (orderId === '') {
      throw new Error('order_id is required.');
    }

    var orderRef = findRowByHeaderValue_(cfg.sheets.orders, 'Order_ID', orderId);
    if (!orderRef) {
      return apiError_('ORDER_NOT_FOUND', {
        order_id: orderId
      }, { code: 'ORDER_NOT_FOUND' });
    }

    if (normalizeText_(orderRef.object.Status_Order) === 'DELETED') {
      return apiSuccess_('ORDER_ALREADY_DELETED', { order_id: orderId, idempotent: true });
    }

    if (!isCancelledStatus_(orderRef.object.Status_Order)) {
      return apiError_('ORDER_DELETE_REQUIRES_CANCELLED', {
        order_id: orderId,
        status_order: orderRef.object.Status_Order || ''
      }, { code: 'ORDER_DELETE_REQUIRES_CANCELLED' });
    }

    var archiveSheet = findExistingOrderArchiveSheet_();
    if (archiveSheet) {
      appendOrderToArchiveSheet_(archiveSheet, orderRef.object, actor);
      orderRef.sheet.deleteRow(orderRef.rowNumber);
      return apiSuccess_('ORDER_ARCHIVED', { order_id: orderId, archived: true });
    }

    var note = String(orderRef.object.Catatan || '').trim();
    var deleteNote = 'DELETED_BY ' + actor + ' ' + formatDate_(new Date(), 'yyyy-MM-dd HH:mm:ss');
    updateRowByHeaders_(orderRef.sheet, orderRef.rowNumber, {
      Status_Order: 'DELETED',
      Catatan: note === '' ? deleteNote : note + ' | ' + deleteNote
    });
    return apiSuccess_('ORDER_MARKED_DELETED', { order_id: orderId, deleted: true });
  });
}

/**
 * Finds an existing order archive sheet without creating a new sheet name.
 */
function findExistingOrderArchiveSheet_() {
  return getSheet_('ORDERS_WEBSITE_ARCHIVE', false) ||
    getSheet_('ORDERS_ARCHIVE', false) ||
    getSheet_('ORDER_ARCHIVE', false);
}

/**
 * Appends an order row into an existing archive sheet by matching headers.
 */
function appendOrderToArchiveSheet_(archiveSheet, orderObject, actor) {
  var lastColumn = archiveSheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error('Order archive sheet has no headers.');
  }
  var headers = archiveSheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i] || '').trim();
    if (header === 'Deleted_At') {
      row.push(new Date());
    } else if (header === 'Deleted_By') {
      row.push(actor);
    } else {
      row.push(orderObject.hasOwnProperty(header) ? orderObject[header] : '');
    }
  }
  archiveSheet.appendRow(row);
}

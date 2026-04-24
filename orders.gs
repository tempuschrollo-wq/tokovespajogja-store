function validateOrdersWebsiteSheet() {
  var sheet = getSheetOrThrow_(SHEETS.ORDERS_WEBSITE);
  assertExpectedHeaders_(sheet);

  var lastRow = sheet.getLastRow();
  var issues = [];
  var orderIdSeen = {};

  for (var rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    var order = getRowObject_(sheet, rowNumber);
    if (isRowCompletelyEmpty_(order, ['Order_ID', 'Customer_Nama', 'SKU_List', 'Qty_Total'])) {
      continue;
    }

    var orderId = String(order.Order_ID || '').trim();
    var statusOrder = String(order.Status_Order || '').trim().toUpperCase();
    var paymentStatus = String(order.Payment_Status || '').trim().toUpperCase();

    if (!orderId) {
      issues.push('Row ' + rowNumber + ': Order_ID wajib diisi.');
    } else if (orderIdSeen[normalizeString_(orderId)]) {
      issues.push('Row ' + rowNumber + ': Order_ID duplikat ' + orderId);
    } else {
      orderIdSeen[normalizeString_(orderId)] = true;
    }

    if (statusOrder && ENUMS.STATUS_ORDER.indexOf(statusOrder) === -1) {
      issues.push('Row ' + rowNumber + ': Status_Order tidak valid (' + statusOrder + ').');
    }

    if (paymentStatus && ENUMS.PAYMENT_STATUS.indexOf(paymentStatus) === -1) {
      issues.push('Row ' + rowNumber + ': Payment_Status tidak valid (' + paymentStatus + ').');
    }

    if (order.Qty_Total !== '' && toNumber_(order.Qty_Total) <= 0) {
      issues.push('Row ' + rowNumber + ': Qty_Total harus lebih besar dari 0.');
    }

    if (order.Subtotal !== '' && toNumber_(order.Subtotal) < 0) {
      issues.push('Row ' + rowNumber + ': Subtotal tidak boleh negatif.');
    }

    if (order.Ongkir !== '' && toNumber_(order.Ongkir) < 0) {
      issues.push('Row ' + rowNumber + ': Ongkir tidak boleh negatif.');
    }

    if (order.Grand_Total !== '' && toNumber_(order.Grand_Total) < 0) {
      issues.push('Row ' + rowNumber + ': Grand_Total tidak boleh negatif.');
    }
  }

  if (issues.length) {
    throw new Error('validateOrdersWebsiteSheet menemukan masalah:\n- ' + issues.join('\n- '));
  }

  showToast_('ORDERS_WEBSITE valid.');
  return {
    ok: true,
    checkedRows: Math.max(0, lastRow - 1)
  };
}

function generateMissingOrderIds() {
  return withDocumentLock_(function() {
    var sheet = getSheetOrThrow_(SHEETS.ORDERS_WEBSITE);
    assertExpectedHeaders_(sheet);

    var lastRow = sheet.getLastRow();
    var generatedCount = 0;

    for (var rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      var order = getRowObject_(sheet, rowNumber);
      if (isRowCompletelyEmpty_(order, ['Customer_Nama', 'SKU_List', 'Qty_Total'])) {
        continue;
      }

      if (!String(order.Order_ID || '').trim()) {
        var orderId = generateUniqueId_('Order_ID');
        sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Order_ID')).setValue(orderId);
        generatedCount += 1;
      }
    }

    showToast_('Order_ID berhasil dibuat: ' + generatedCount);
    return generatedCount;
  });
}

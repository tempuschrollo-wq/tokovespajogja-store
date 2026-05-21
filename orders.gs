/**
 * Creates a website order, appends STOCK_OUT audit rows, deducts stock once,
 * and writes an INVENTORY_LOG row for each item.
 */
function createWebsiteOrder(payload) {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var normalized = normalizeOrderPayload_(payload || {});
    validateWebsiteOrderPayload_(normalized);
    var requestedOrderId = normalized.order_id;
    if (requestedOrderId !== '') {
      var existingOrder = findRowByHeaderValue_(cfg.sheets.orders, 'Order_ID', requestedOrderId);
      var expectedLogCount = normalized.items.length;
      var existingLogCount = countInventoryLogsByReference_(requestedOrderId, 'STOCK_OUT');
      if (existingOrder && existingLogCount === expectedLogCount) {
        return apiSuccess_('ORDER_ALREADY_EXISTS', { order_id: requestedOrderId, idempotent: true });
      }
      if (existingOrder) {
        return apiError_('ORDER_PARTIAL_PROCESSING_REVIEW_REQUIRED', {
          order_id: requestedOrderId,
          expected_logs: expectedLogCount,
          actual_logs: existingLogCount
        }, { code: 'ORDER_PARTIAL_PROCESSING_REVIEW_REQUIRED' });
      }
      if (existingLogCount > 0) {
        return apiError_('ORDER_PARTIAL_PROCESSING_REVIEW_REQUIRED', {
          order_id: requestedOrderId,
          expected_logs: expectedLogCount,
          actual_logs: existingLogCount
        }, { code: 'ORDER_PARTIAL_PROCESSING_REVIEW_REQUIRED' });
      }
    }

    var orderId = requestedOrderId !== '' ? requestedOrderId : generateOrderId_();
    var generatedOrderLogCount = countInventoryLogsByReference_(orderId, 'STOCK_OUT');
    if (generatedOrderLogCount > 0) {
      return apiError_('ORDER_PARTIAL_PROCESSING_REVIEW_REQUIRED', {
        order_id: orderId,
        expected_logs: normalized.items.length,
        actual_logs: generatedOrderLogCount
      }, { code: 'ORDER_PARTIAL_PROCESSING_REVIEW_REQUIRED' });
    }

    var productLookup = getProductLookupBySku_();
    normalized.items = enrichOrderItemsFromProducts_(normalized.items, productLookup);
    var enrichedSubtotal = calculateOrderItemsSubtotal_(normalized.items);
    if (normalized.subtotal <= 0) {
      normalized.subtotal = enrichedSubtotal;
    }
    if (normalized.grand_total <= 0) {
      normalized.grand_total = normalized.subtotal + normalized.ongkir;
    }
    var stockBySku = {};
    var productRefBySku = {};
    var totalsBySku = {};
    for (var i = 0; i < normalized.items.length; i++) {
      var item = normalized.items[i];
      var productRef = productLookup[item.sku];
      if (!productRef) {
        throw new Error('SKU not found: ' + item.sku);
      }
      if (!isActiveProduct_(productRef.object)) {
        throw new Error('SKU is inactive: ' + item.sku);
      }
      if (!stockBySku.hasOwnProperty(item.sku)) {
        stockBySku[item.sku] = safeToNumber_(productRef.object.Stok_Aktif);
        productRefBySku[item.sku] = productRef;
        totalsBySku[item.sku] = 0;
      }
      totalsBySku[item.sku] += item.qty;
    }
    for (var sku in totalsBySku) {
      if (totalsBySku.hasOwnProperty(sku)) {
        if (stockBySku[sku] - totalsBySku[sku] < 0 && !isNegativeStockAllowed_()) {
          throw new Error('Insufficient stock for ' + sku + '. Current=' + stockBySku[sku] + ', requested=' + totalsBySku[sku]);
        }
      }
    }

    var now = new Date();
    var skuList = [];
    var qtyTotal = 0;
    for (var q = 0; q < normalized.items.length; q++) {
      skuList.push(normalized.items[q].sku);
      qtyTotal += normalized.items[q].qty;
    }

    appendObjectRow_(cfg.sheets.orders, {
      Order_ID: orderId,
      Order_Date: now,
      Customer_Nama: normalized.customer_nama,
      Customer_WhatsApp: normalized.customer_whatsapp,
      Customer_Alamat: normalized.customer_alamat,
      Item_JSON: stringifySafe_(normalized.items),
      SKU_List: skuList.join(', '),
      Qty_Total: qtyTotal,
      Subtotal: normalized.subtotal,
      Ongkir: normalized.ongkir,
      Grand_Total: normalized.grand_total,
      Status_Order: normalized.status_order || 'PENDING',
      Payment_Status: normalized.payment_status || 'UNPAID',
      Source: normalized.source || 'WEBSITE',
      Catatan: normalized.catatan,
      Created_At: now
    });

    for (var r = 0; r < normalized.items.length; r++) {
      var orderItem = normalized.items[r];
      var itemProductRef = productRefBySku[orderItem.sku];
      var itemProduct = itemProductRef.object;
      var oldStock = stockBySku[orderItem.sku];
      var newStock = oldStock - orderItem.qty;
      stockBySku[orderItem.sku] = newStock;
      var outId = generateOperationalId_('OUT');
      var itemName = orderItem.nama_produk || itemProduct.Nama_Produk || '';
      appendObjectRow_(cfg.sheets.stockOut, {
        Out_ID: outId,
        Tanggal: now,
        SKU: orderItem.sku,
        Nama_Produk: itemName,
        Jenis_Keluar: 'ORDER',
        Reference_ID: orderId,
        Qty_Keluar: orderItem.qty,
        Harga_Jual_Satuan: orderItem.harga_jual,
        Total_Penjualan: orderItem.qty * orderItem.harga_jual,
        Catatan: 'Order website ' + orderId,
        Input_By: normalized.source || 'WEBSITE'
      });
      updateProductStockFields_(itemProductRef.sheet, itemProductRef.rowNumber, newStock, {
        Status_Stok: calculateStockStatus_(newStock, itemProduct.Minimum_Stok),
        Status_Produk: normalizeText_(itemProduct.Status_Produk) === cfg.statuses.inactive ? cfg.statuses.inactive : cfg.statuses.active,
        Last_Updated: now,
        Updated_By: normalized.source || 'WEBSITE'
      });
      appendInventoryLog_({
        SKU: orderItem.sku,
        Nama_Produk: itemName,
        Tipe_Log: 'STOCK_OUT',
        Qty_Change: -orderItem.qty,
        Stok_Sebelum: oldStock,
        Stok_Sesudah: newStock,
        Reference_ID: orderId,
        Note: 'Order website ' + orderId + ' ' + outId,
        Actor: normalized.source || 'WEBSITE'
      });
    }

    return apiSuccess_('ORDER_CREATED', { order_id: orderId });
  });
}

/**
 * Cancels a website order and restores stock once.
 */
function cancelWebsiteOrder(orderId, actor) {
  return withDocumentLock_(function() {
    var cfg = tvjConfig_();
    var normalizedOrderId = String(orderId || '').trim();
    if (normalizedOrderId === '') {
      throw new Error('Order_ID is required.');
    }
    var orderRef = findRowByHeaderValue_(cfg.sheets.orders, 'Order_ID', normalizedOrderId);
    if (!orderRef) {
      throw new Error('Order not found: ' + normalizedOrderId);
    }

    var status = normalizeText_(orderRef.object.Status_Order);
    var items = normalizeItems_(parseJsonSafe_(orderRef.object.Item_JSON, []));
    if (items.length === 0) {
      throw new Error('Order has empty or invalid Item_JSON: ' + normalizedOrderId);
    }
    if (areAllCancelRestoreItemsLogged_(normalizedOrderId, items)) {
      if (status !== cfg.statuses.cancelled && status !== cfg.statuses.cancelledId) {
        updateRowByHeaders_(orderRef.sheet, orderRef.rowNumber, { Status_Order: cfg.statuses.cancelled });
      }
      return apiSuccess_('ORDER_ALREADY_CANCELLED_RESTORED', { order_id: normalizedOrderId, idempotent: true });
    }

    var productLookup = getProductLookupBySku_();
    var stockBySku = {};
    var now = new Date();
    var restoreActor = String(actor || 'ADMIN').trim();

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var restoreRef = buildOrderCancelRestoreReference_(normalizedOrderId, item, i);
      if (inventoryReferenceExists_(restoreRef, 'STOCK_IN')) {
        continue;
      }
      var productRef = productLookup[item.sku];
      if (!productRef) {
        throw new Error('SKU not found while restoring: ' + item.sku);
      }
      if (!stockBySku.hasOwnProperty(item.sku)) {
        stockBySku[item.sku] = safeToNumber_(productRef.object.Stok_Aktif);
      }
      var oldStock = stockBySku[item.sku];
      var newStock = oldStock + item.qty;
      stockBySku[item.sku] = newStock;
      var itemName = item.nama_produk || productRef.object.Nama_Produk || '';
      appendObjectRow_(cfg.sheets.stockIn, {
        In_ID: restoreRef,
        Tanggal: now,
        SKU: item.sku,
        Nama_Produk: itemName,
        Qty_Masuk: item.qty,
        Harga_Modal_Satuan: safeToNumber_(productRef.object.Harga_Modal),
        Total_Modal_Masuk: item.qty * safeToNumber_(productRef.object.Harga_Modal),
        Supplier: 'ORDER_CANCEL_RESTORE',
        Catatan: restoreRef,
        Input_By: restoreActor
      });
      updateProductStockFields_(productRef.sheet, productRef.rowNumber, newStock, {
        Status_Stok: calculateStockStatus_(newStock, productRef.object.Minimum_Stok),
        Status_Produk: normalizeText_(productRef.object.Status_Produk) === cfg.statuses.inactive ? cfg.statuses.inactive : cfg.statuses.active,
        Last_Updated: now,
        Updated_By: restoreActor
      });
      appendInventoryLog_({
        SKU: item.sku,
        Nama_Produk: itemName,
        Tipe_Log: 'STOCK_IN',
        Qty_Change: item.qty,
        Stok_Sebelum: oldStock,
        Stok_Sesudah: newStock,
        Reference_ID: restoreRef,
        Note: 'ORDER_CANCEL_RESTORE ITEM ' + (i + 1),
        Actor: restoreActor
      });
    }

    if (!areAllCancelRestoreItemsLogged_(normalizedOrderId, items)) {
      return apiError_('ORDER_CANCEL_PARTIAL_RESTORE_REVIEW_REQUIRED', {
        order_id: normalizedOrderId
      }, { code: 'ORDER_CANCEL_PARTIAL_RESTORE_REVIEW_REQUIRED' });
    }
    updateRowByHeaders_(orderRef.sheet, orderRef.rowNumber, { Status_Order: cfg.statuses.cancelled });
    return apiSuccess_('ORDER_CANCELLED', { order_id: normalizedOrderId, restored: true });
  });
}

/**
 * Builds an item-specific cancel restore reference.
 */
function buildOrderCancelRestoreReference_(orderId, item, itemIndex) {
  return 'ORDER_CANCEL_RESTORE:' + orderId + ':' + normalizeSku_(item.sku) + ':' + (itemIndex + 1);
}

/**
 * Returns true only when every cancel restore item reference is already logged.
 */
function areAllCancelRestoreItemsLogged_(orderId, items) {
  for (var i = 0; i < items.length; i++) {
    if (!inventoryReferenceExists_(buildOrderCancelRestoreReference_(orderId, items[i], i), 'STOCK_IN')) {
      return false;
    }
  }
  return true;
}

/**
 * Generates order IDs in the ORD-YYYYMMDDHHMMSS-RANDOM format.
 */
function generateOrderId_() {
  return 'ORD-' + formatDate_(new Date(), 'yyyyMMddHHmmss') + '-' + randomToken_(5);
}

/**
 * Normalizes website order payload keys used by the storefront and proxy.
 */
function normalizeOrderPayload_(payload) {
  var rawItems = payload.items || payload.Items || payload.item_json || payload.Item_JSON || [];
  var orderId = payload.order_id || payload.Order_ID || payload.reference_id || payload.Reference_ID || '';
  return {
    order_id: sanitizeId_(orderId),
    customer_nama: String(payload.customer_nama || payload.Customer_Nama || payload.nama || '').trim(),
    customer_whatsapp: String(payload.customer_whatsapp || payload.Customer_WhatsApp || payload.whatsapp || '').trim(),
    customer_alamat: String(payload.customer_alamat || payload.Customer_Alamat || payload.alamat || '').trim(),
    items: normalizeItems_(parseJsonSafe_(rawItems, rawItems)),
    subtotal: safeToNumber_(payload.subtotal || payload.Subtotal),
    ongkir: safeToNumber_(payload.ongkir || payload.Ongkir),
    grand_total: safeToNumber_(payload.grand_total || payload.Grand_Total),
    source: String(payload.source || payload.Source || 'WEBSITE').trim(),
    catatan: String(payload.catatan || payload.Catatan || '').trim(),
    payment_status: String(payload.payment_status || payload.Payment_Status || 'UNPAID').trim(),
    status_order: String(payload.status_order || payload.Status_Order || '').trim()
  };
}

/**
 * Converts item payloads into a predictable array with numeric qty and price.
 */
function normalizeItems_(rawItems) {
  var items = [];
  if (!rawItems) {
    return items;
  }
  if (typeof rawItems === 'string') {
    rawItems = parseJsonSafe_(rawItems, []);
  }
  if (!rawItems.length) {
    return items;
  }
  for (var i = 0; i < rawItems.length; i++) {
    var raw = rawItems[i] || {};
    var sku = normalizeSku_(raw.SKU || raw.sku);
    var qty = safeToNumber_(raw.qty || raw.Qty || raw.quantity || raw.Qty_Keluar);
    var hargaJual = safeToNumber_(raw.harga_jual || raw.Harga_Jual || raw.price || raw.Harga_Jual_Satuan);
    items.push({
      sku: sku,
      nama_produk: String(raw.nama_produk || raw.Nama_Produk || raw.name || '').trim(),
      qty: qty,
      harga_jual: hargaJual,
      line_total: safeToNumber_(raw.line_total || raw.Line_Total || raw.total || raw.Total_Penjualan)
    });
  }
  return items;
}

/**
 * Validates normalized order data before any mutation is made.
 */
function validateWebsiteOrderPayload_(order) {
  if (order.customer_nama === '') {
    throw new Error('customer_nama is required.');
  }
  if (order.customer_whatsapp === '') {
    throw new Error('customer_whatsapp is required.');
  }
  if (!order.items || order.items.length === 0) {
    throw new Error('items must contain at least one item.');
  }
  for (var i = 0; i < order.items.length; i++) {
    var item = order.items[i];
    if (item.sku === '') {
      throw new Error('items[' + i + '].SKU is required.');
    }
    if (item.qty <= 0) {
      throw new Error('items[' + i + '].qty must be greater than zero.');
    }
    if (item.harga_jual < 0) {
      throw new Error('items[' + i + '].harga_jual is invalid.');
    }
  }
}

/**
 * Enriches website order items from MASTER_PRODUCTS when compact payloads only send SKU and qty.
 */
function enrichOrderItemsFromProducts_(items, productLookup) {
  var enriched = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var productRef = productLookup[item.sku];
    var product = productRef ? productRef.object : {};
    var hargaJual = item.harga_jual > 0 ? item.harga_jual : safeToNumber_(product.Harga_Jual);
    var namaProduk = String(item.nama_produk || product.Nama_Produk || '').trim();
    enriched.push({
      sku: item.sku,
      nama_produk: namaProduk,
      qty: item.qty,
      harga_jual: hargaJual,
      line_total: item.qty * hargaJual
    });
  }
  return enriched;
}

/**
 * Calculates subtotal from enriched order item lines.
 */
function calculateOrderItemsSubtotal_(items) {
  var subtotal = 0;
  for (var i = 0; i < items.length; i++) {
    subtotal += safeToNumber_(items[i].line_total || (items[i].qty * items[i].harga_jual));
  }
  return subtotal;
}

/**
 * Keeps externally supplied IDs spreadsheet-safe and compact.
 */
function sanitizeId_(value) {
  var text = String(value || '').trim();
  if (text === '') {
    return '';
  }
  return text.replace(/[^A-Za-z0-9:_\-]/g, '').substring(0, 80);
}

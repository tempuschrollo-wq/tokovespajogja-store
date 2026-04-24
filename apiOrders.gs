function apiCreateOrder_(payload) {
  return withDocumentLock_(function() {
    var customerName = String(payload.customer_name || '').trim();
    var customerWhatsApp = String(payload.customer_whatsapp || '').trim();
    var customerAddress = String(payload.customer_address || '').trim();
    var ongkir =
      payload.ongkir === '' || payload.ongkir === null || payload.ongkir === undefined
        ? 0
        : parseNonNegativeInteger_(payload.ongkir, 'ongkir');
    var shippingNote = String(payload.shipping_note || '').trim();
    var items = normalizeIncomingOrderItems_(payload.items);

    if (!customerName) {
      throw apiError_('VALIDATION_ERROR', 'customer_name wajib diisi.', 400);
    }

    if (!customerWhatsApp) {
      throw apiError_('VALIDATION_ERROR', 'customer_whatsapp wajib diisi.', 400);
    }

    if (!customerAddress) {
      throw apiError_('VALIDATION_ERROR', 'customer_address wajib diisi.', 400);
    }

    if (!items.length) {
      throw apiError_('VALIDATION_ERROR', 'items wajib diisi minimal 1 produk.', 400);
    }

    var fingerprint = buildOrderFingerprint_({
      customer_name: customerName,
      customer_whatsapp: customerWhatsApp,
      customer_address: customerAddress,
      items: items
    });

    var cacheKey = reserveOrderFingerprint_(fingerprint);

    try {
      if (hasRecentOrderFingerprint_(fingerprint)) {
        throw apiError_(
          'DUPLICATE_ORDER',
          'Order serupa terdeteksi baru saja dikirim. Duplicate submit diblokir.',
          409
        );
      }

      var validatedItems = validateOrderItemsAgainstInventory_(items);
      var orderId = generateUniqueId_('Order_ID');
      var createdAt = new Date();
      var qtyTotal = 0;
      var subtotal = 0;

      validatedItems.forEach(function(item) {
        qtyTotal += item.qty;
        subtotal += item.subtotal;
      });

      var grandTotal = subtotal + ongkir;
      var orderNote = appendInternalNote_(shippingNote, '[API_FP:' + fingerprint + ']');
      appendRowObject_(SHEETS.ORDERS_WEBSITE, {
        Order_ID: orderId,
        Order_Date: createdAt,
        Customer_Nama: customerName,
        Customer_WhatsApp: customerWhatsApp,
        Customer_Alamat: customerAddress,
        Item_JSON: JSON.stringify(validatedItems),
        SKU_List: validatedItems
          .map(function(item) {
            return item.sku;
          })
          .join(','),
        Qty_Total: qtyTotal,
        Subtotal: subtotal,
        Ongkir: ongkir,
        Grand_Total: grandTotal,
        Status_Order: 'NEW',
        Payment_Status: 'UNPAID',
        Source: 'WEBSITE',
        Catatan: orderNote,
        Created_At: createdAt
      });

      validatedItems.forEach(function(item) {
        createProcessedStockOutTransaction_({
          sku: item.sku,
          qty_keluar: item.qty,
          harga_jual_satuan: item.harga_jual_satuan,
          jenis_keluar: 'ORDER',
          referensi_id: orderId,
          catatan: 'Order website ' + orderId,
          input_by: 'WEBSITE_API',
          tanggal: createdAt
        });
      });

      CacheService.getScriptCache().put(
        'ORDER_FP_' + fingerprint,
        orderId,
        API_ORDER_DUPLICATE_WINDOW_SECONDS
      );

      return buildSuccessEnvelope_(
        'Order berhasil dibuat.',
        {
          order_id: orderId,
          qty_total: qtyTotal,
          subtotal: subtotal,
          ongkir: ongkir,
          grand_total: grandTotal,
          shipping_note: shippingNote,
          items: validatedItems
        },
        null
      );
    } catch (error) {
      releaseOrderFingerprint_(cacheKey);
      throw error;
    }
  });
}

function apiReconcileOrder_(payload) {
  var customerName = String(payload.customer_name || '').trim();
  var customerWhatsApp = String(payload.customer_whatsapp || '').trim();
  var customerAddress = String(payload.customer_address || '').trim();
  var items = normalizeIncomingOrderItems_(payload.items);
  var lookbackMinutes =
    typeof API_ORDER_RECONCILE_LOOKBACK_MINUTES !== 'undefined'
      ? Number(API_ORDER_RECONCILE_LOOKBACK_MINUTES || 30)
      : 30;

  if (!customerName || !customerWhatsApp || !customerAddress || !items.length) {
    throw apiError_(
      'VALIDATION_ERROR',
      'customer_name, customer_whatsapp, customer_address, dan items wajib diisi untuk cek order timeout.',
      400
    );
  }

  var fingerprint = buildOrderFingerprint_({
    customer_name: customerName,
    customer_whatsapp: customerWhatsApp,
    customer_address: customerAddress,
    items: items
  });

  var matchedOrder = findRecentOrderByFingerprint_(fingerprint, lookbackMinutes);

  if (!matchedOrder) {
    return buildSuccessEnvelope_(
      'Order belum ditemukan dari pengecekan terakhir.',
      {
        found: false,
        fingerprint: fingerprint,
        checked_window_minutes: lookbackMinutes
      },
      null
    );
  }

  return buildSuccessEnvelope_(
    'Order sebelumnya berhasil ditemukan.',
    {
      found: true,
      fingerprint: fingerprint,
      checked_window_minutes: lookbackMinutes,
      order: mapPublicReconciledOrder_(matchedOrder)
    },
    null
  );
}

function apiAdminOrderCancel_(payload, e) {
  requireAdminToken_(payload, e);

  return withDocumentLock_(function() {
    var orderId = String(payload.order_id || '').trim();
    var actor = getCurrentActor_(payload.actor || 'API_ADMIN');
    var note = String(payload.note || '').trim();

    if (!orderId) {
      throw apiError_('VALIDATION_ERROR', 'order_id wajib diisi.', 400);
    }

    var orderRowNumber = findRowByValue_(SHEETS.ORDERS_WEBSITE, 'Order_ID', orderId);
    if (!orderRowNumber) {
      throw apiError_('NOT_FOUND', 'Order tidak ditemukan.', 404);
    }

    var sheet = getSheetOrThrow_(SHEETS.ORDERS_WEBSITE);
    var order = getRowObject_(sheet, orderRowNumber);
    var existingNote = String(order.Catatan || '');

    if (normalizeString_(order.Status_Order) === 'CANCEL') {
      throw apiError_('ORDER_ALREADY_CANCELLED', 'Order sudah berstatus CANCEL.', 409);
    }

    if (hasCancelMarker_(existingNote, orderId, 'RESTORED')) {
      sheet.getRange(orderRowNumber, getColumnIndex_(sheet, 'Status_Order')).setValue('CANCEL');
      sheet
        .getRange(orderRowNumber, getColumnIndex_(sheet, 'Catatan'))
        .setValue(
          appendInternalNote_(
            existingNote,
            'Order cancel difinalisasi ulang oleh ' + actor + ' tanpa restore stok ulang.'
          )
        );

      return buildSuccessEnvelope_(
        'Order sudah pernah direstore. Status CANCEL difinalisasi tanpa mengubah stok lagi.',
        {
          order_id: orderId,
          restored_items: 0,
          restore_mode: 'ALREADY_RESTORED_MARKER'
        },
        null
      );
    }

    if (hasCancelMarker_(existingNote, orderId, 'PROCESSING')) {
      throw apiError_(
        'CANCEL_REQUIRES_REVIEW',
        'Cancel order ini pernah masuk tahap processing tapi belum punya marker restored. Cek INVENTORY_LOG dan stok sebelum retry agar stok tidak double balik.',
        409,
        {
          order_id: orderId,
          marker: getCancelMarker_(orderId, 'PROCESSING')
        }
      );
    }

    var items = parseOrderItemsFromJson_(order.Item_JSON);
    if (!items.length) {
      throw apiError_(
        'INVALID_ORDER_ITEMS',
        'Item_JSON order kosong atau tidak valid sehingga order tidak bisa dicancel.',
        400
      );
    }

    var restorePlan = buildCancelRestorePlan_(items);
    var processingNote = appendInternalNote_(
      existingNote,
      getCancelMarker_(orderId, 'PROCESSING') +
        ' actor=' +
        actor +
        ' at=' +
        formatTimestampJakarta_(new Date())
    );

    sheet
      .getRange(orderRowNumber, getColumnIndex_(sheet, 'Catatan'))
      .setValue(processingNote);
    SpreadsheetApp.flush();

    restorePlan.forEach(function(item) {
      var product = getProductBySku_(item.sku);
      var stockBefore = toNumber_(product.Stok_Aktif);
      var stockAfter = stockBefore + item.qty;

      applyStockOutToMasterProduct_(product, stockAfter, actor);

      writeInventoryLog_({
        Timestamp: new Date(),
        SKU: product.SKU,
        Nama_Produk: product.Nama_Produk,
        Tipe_Log: 'STOCK_IN',
        Qty_Change: item.qty,
        Stok_Sebelum: stockBefore,
        Stok_Sesudah: stockAfter,
        Reference_ID: orderId + ':CANCEL_RESTORE:' + product.SKU,
        Note: appendInternalNote_(
          'ORDER_CANCEL_RESTORE',
          note ? 'Note: ' + note : ''
        ),
        Actor: actor
      });
    });

    sheet.getRange(orderRowNumber, getColumnIndex_(sheet, 'Status_Order')).setValue('CANCEL');
    sheet
      .getRange(orderRowNumber, getColumnIndex_(sheet, 'Catatan'))
      .setValue(
        appendInternalNote_(
          processingNote,
          getCancelMarker_(orderId, 'RESTORED') +
            ' Order dicancel oleh ' +
            actor +
            (note ? ' | ' + note : '')
        )
      );

    return buildSuccessEnvelope_(
      'Order berhasil dicancel dan stok dikembalikan.',
      {
        order_id: orderId,
        restored_items: restorePlan.length,
        restore_mode: 'MASTER_PRODUCTS + INVENTORY_LOG + CANCEL_MARKER'
      },
      null
    );
  });
}

function apiAdminOrderDelete_(payload, e) {
  requireAdminToken_(payload, e);

  return withDocumentLock_(function() {
    var orderId = String(payload.order_id || '').trim();
    var actor = getCurrentActor_(payload.actor || 'API_ADMIN');

    if (!orderId) {
      throw apiError_('VALIDATION_ERROR', 'order_id wajib diisi.', 400);
    }

    var rowNumber = findRowByValue_(SHEETS.ORDERS_WEBSITE, 'Order_ID', orderId);
    if (!rowNumber) {
      throw apiError_('NOT_FOUND', 'Order tidak ditemukan.', 404);
    }

    var sheet = getSheetOrThrow_(SHEETS.ORDERS_WEBSITE);
    var order = getRowObject_(sheet, rowNumber);

    if (normalizeString_(order.Status_Order) !== 'CANCEL') {
      throw apiError_(
        'ORDER_DELETE_BLOCKED',
        'Order hanya boleh dihapus jika statusnya sudah CANCEL. Cancel dulu supaya stok balik dengan aman.',
        409
      );
    }

    sheet.deleteRow(rowNumber);

    return buildSuccessEnvelope_(
      'Riwayat order CANCEL berhasil dihapus.',
      {
        deleted_order_id: orderId,
        deleted_by: actor,
        stock_action: 'NO_CHANGE_ALREADY_CANCELLED'
      },
      null
    );
  });
}

function normalizeIncomingOrderItems_(items) {
  if (!items || Object.prototype.toString.call(items) !== '[object Array]') {
    return [];
  }

  var aggregated = {};

  items.forEach(function(item) {
    var sku = String(item && item.sku ? item.sku : '').trim().toUpperCase();
    var qty = parsePositiveInteger_(item && item.qty, 'qty');

    if (!sku) {
      throw apiError_('VALIDATION_ERROR', 'Setiap item wajib memiliki sku.', 400);
    }

    if (!aggregated[sku]) {
      aggregated[sku] = {
        sku: sku,
        qty: 0
      };
    }

    aggregated[sku].qty += qty;
  });

  return Object.keys(aggregated)
    .sort()
    .map(function(sku) {
      return aggregated[sku];
    });
}

function buildCancelRestorePlan_(items) {
  var aggregated = {};

  items.forEach(function(item) {
    var sku = String(item && item.sku ? item.sku : '').trim().toUpperCase();
    var qty = parsePositiveInteger_(item && item.qty, 'qty');

    if (!sku) {
      throw apiError_('INVALID_ORDER_ITEMS', 'SKU pada Item_JSON order kosong.', 400);
    }

    if (!aggregated[sku]) {
      aggregated[sku] = {
        sku: sku,
        qty: 0
      };
    }

    aggregated[sku].qty += qty;
  });

  return Object.keys(aggregated)
    .sort()
    .map(function(sku) {
      try {
        getProductBySku_(sku);
      } catch (error) {
        throw apiError_(
          'INVALID_SKU',
          'SKU pada order tidak lagi ditemukan di MASTER_PRODUCTS: ' + sku,
          409
        );
      }

      return aggregated[sku];
    });
}

function getCancelMarker_(orderId, stage) {
  return '[CANCEL_' + String(stage || '').toUpperCase() + ':' + orderId + ']';
}

function hasCancelMarker_(note, orderId, stage) {
  return String(note || '').indexOf(getCancelMarker_(orderId, stage)) !== -1;
}

function validateOrderItemsAgainstInventory_(items) {
  return items.map(function(item) {
    var product = findActiveProductBySku_(item.sku);
    if (!product) {
      throw apiError_('INVALID_SKU', 'SKU aktif tidak ditemukan: ' + item.sku, 400);
    }

    var qty = parsePositiveInteger_(item.qty, 'qty');
    var stokAktif = toNumber_(product.Stok_Aktif);

    if (qty > stokAktif) {
      throw apiError_(
        'INSUFFICIENT_STOCK',
        'Stok tidak cukup untuk SKU ' + item.sku + '.',
        409,
        {
          sku: item.sku,
          stok_aktif: stokAktif,
          requested_qty: qty
        }
      );
    }

    var hargaJualSatuan = product.Harga_Jual === '' ? 0 : toNumber_(product.Harga_Jual);

    return {
      product_id: product.Product_ID,
      sku: product.SKU,
      nama_produk: product.Nama_Produk,
      qty: qty,
      harga_jual_satuan: hargaJualSatuan,
      subtotal: hargaJualSatuan * qty
    };
  });
}

function parseOrderItemsFromJson_(itemJson) {
  if (!itemJson) {
    return [];
  }

  try {
    var parsed = JSON.parse(itemJson);
    return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [];
  } catch (error) {
    return [];
  }
}

function findRecentOrderByFingerprint_(fingerprint, lookbackMinutes) {
  var rows = getSheetRows_(SHEETS.ORDERS_WEBSITE);
  var compareAfter = new Date().getTime() - Number(lookbackMinutes || 30) * 60 * 1000;

  return rows
    .filter(function(order) {
      var catatan = String(order.Catatan || '');
      if (catatan.indexOf('[API_FP:' + fingerprint + ']') === -1) {
        return false;
      }

      return getOrderRowTimestamp_(order) >= compareAfter;
    })
    .sort(function(left, right) {
      return getOrderRowTimestamp_(right) - getOrderRowTimestamp_(left);
    })[0] || null;
}

function mapPublicReconciledOrder_(row) {
  var order = mapOrderRowToApi_(row);

  return {
    order_id: order.order_id,
    qty_total: order.qty_total,
    subtotal: order.subtotal,
    ongkir: order.ongkir,
    grand_total: order.grand_total,
    status_order: order.status_order,
    payment_status: order.payment_status,
    source: order.source,
    created_at: order.created_at
  };
}

function apiAdminOrdersList_(payload, e) {
  requireAdminToken_(payload, e);

  var search = String(payload.search || '').trim().toLowerCase();
  var statusOrder = payload.status_order
    ? validateApiEnumValue_('status_order', payload.status_order, ENUMS.STATUS_ORDER, true)
    : '';
  var paymentStatus = payload.payment_status
    ? validateApiEnumValue_('payment_status', payload.payment_status, ENUMS.PAYMENT_STATUS, true)
    : '';
  var limit = parseLimitParam_(payload.limit);
  var page = parsePageParam_(payload.page);

  var orders = getSheetRows_(SHEETS.ORDERS_WEBSITE)
    .map(mapOrderRowToApi_)
    .filter(function(order) {
      if (statusOrder && normalizeString_(order.status_order) !== normalizeString_(statusOrder)) {
        return false;
      }

      if (
        paymentStatus &&
        normalizeString_(order.payment_status) !== normalizeString_(paymentStatus)
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      var haystack = [
        order.order_id,
        order.customer_nama,
        order.customer_whatsapp,
        order.customer_alamat,
        order.sku_list,
        order.item_summary
      ]
        .join(' ')
        .toLowerCase();

      return haystack.indexOf(search) !== -1;
    })
    .sort(function(left, right) {
      return right.sort_timestamp - left.sort_timestamp;
    });

  var total = orders.length;
  var offset = (page - 1) * limit;
  var pagedOrders = orders.slice(offset, offset + limit).map(function(order) {
    var copy = {};
    Object.keys(order).forEach(function(key) {
      if (key !== 'sort_timestamp') {
        copy[key] = order[key];
      }
    });
    return copy;
  });

  return buildSuccessEnvelope_(
    'Riwayat order admin berhasil diambil.',
    {
      orders: pagedOrders,
      summary: summarizeOrdersForAdmin_(orders),
      top_products: getTopProductsFromOrders_(orders, 8)
    },
    {
      total: total,
      page: page,
      limit: limit,
      total_pages: Math.max(1, Math.ceil(total / limit))
    }
  );
}

function apiAdminOrderUpdate_(payload, e) {
  requireAdminToken_(payload, e);

  return withDocumentLock_(function() {
    var orderId = String(payload.order_id || '').trim();
    var actor = getCurrentActor_(payload.actor || payload.updated_by || 'API_ADMIN');
    var note = String(payload.note || '').trim();

    if (!orderId) {
      throw apiError_('VALIDATION_ERROR', 'order_id wajib diisi.', 400);
    }

    var rowNumber = findRowByValue_(SHEETS.ORDERS_WEBSITE, 'Order_ID', orderId);
    if (!rowNumber) {
      throw apiError_('NOT_FOUND', 'Order tidak ditemukan.', 404);
    }

    var sheet = getSheetOrThrow_(SHEETS.ORDERS_WEBSITE);
    var order = getRowObject_(sheet, rowNumber);
    var currentStatusOrder = normalizeString_(order.Status_Order);
    var currentPaymentStatus = normalizeString_(order.Payment_Status);
    var nextStatusOrder = currentStatusOrder;
    var nextPaymentStatus = currentPaymentStatus;
    var updatedFields = [];

    if (payload.status_order !== undefined && payload.status_order !== '') {
      nextStatusOrder = validateApiEnumValue_(
        'status_order',
        payload.status_order,
        ENUMS.STATUS_ORDER
      );
    }

    if (payload.payment_status !== undefined && payload.payment_status !== '') {
      nextPaymentStatus = validateApiEnumValue_(
        'payment_status',
        payload.payment_status,
        ENUMS.PAYMENT_STATUS
      );
    }

    if (currentStatusOrder === 'CANCEL' && nextStatusOrder !== 'CANCEL') {
      throw apiError_(
        'ORDER_CANCELLED_LOCKED',
        'Order yang sudah CANCEL tidak bisa diaktifkan lagi dari endpoint update.',
        409
      );
    }

    if (nextStatusOrder === 'CANCEL' && currentStatusOrder !== 'CANCEL') {
      throw apiError_(
        'USE_CANCEL_ENDPOINT',
        'Untuk membatalkan order dan mengembalikan stok, pakai endpoint /admin/order/cancel.',
        409
      );
    }

    if (nextStatusOrder !== currentStatusOrder) {
      sheet.getRange(rowNumber, getColumnIndex_(sheet, 'Status_Order')).setValue(nextStatusOrder);
      updatedFields.push('Status_Order');
    }

    if (nextPaymentStatus !== currentPaymentStatus) {
      sheet
        .getRange(rowNumber, getColumnIndex_(sheet, 'Payment_Status'))
        .setValue(nextPaymentStatus);
      updatedFields.push('Payment_Status');
    }

    if (!updatedFields.length && !note) {
      throw apiError_('NO_CHANGES', 'Tidak ada perubahan status order/payment yang dikirim.', 400);
    }

    if (note || updatedFields.length) {
      var updateText =
        'Order diupdate oleh ' +
        actor +
        (updatedFields.length ? ' | field: ' + updatedFields.join(', ') : '') +
        (note ? ' | ' + note : '');
      sheet
        .getRange(rowNumber, getColumnIndex_(sheet, 'Catatan'))
        .setValue(appendInternalNote_(order.Catatan, updateText));
    }

    return buildSuccessEnvelope_(
      'Order berhasil diperbarui.',
      {
        order: mapOrderRowToApi_(getRowObject_(sheet, rowNumber)),
        updated_fields: updatedFields
      },
      null
    );
  });
}

function mapOrderRowToApi_(row) {
  var items = parseOrderItemsFromJson_(row.Item_JSON);
  var timestamp = getOrderRowTimestamp_(row);

  return {
    order_id: row.Order_ID || '',
    order_date: timestamp ? formatTimestampJakarta_(new Date(timestamp)) : '',
    customer_nama: row.Customer_Nama || '',
    customer_whatsapp: row.Customer_WhatsApp || '',
    customer_alamat: row.Customer_Alamat || '',
    items: items,
    item_summary: summarizeOrderItems_(items),
    sku_list: row.SKU_List || '',
    qty_total: toNumber_(row.Qty_Total),
    subtotal: toNumber_(row.Subtotal),
    ongkir: toNumber_(row.Ongkir),
    grand_total: toNumber_(row.Grand_Total),
    status_order: row.Status_Order || '',
    payment_status: row.Payment_Status || '',
    source: row.Source || '',
    catatan: row.Catatan || '',
    created_at: row.Created_At ? formatTimestampJakarta_(new Date(row.Created_At)) : '',
    sort_timestamp: timestamp
  };
}

function getOrderRowTimestamp_(row) {
  var createdAt = row.Created_At ? new Date(row.Created_At).getTime() : 0;
  if (createdAt) {
    return createdAt;
  }

  var orderDate = row.Order_Date ? new Date(row.Order_Date).getTime() : 0;
  if (orderDate) {
    return orderDate;
  }

  return 0;
}

function summarizeOrderItems_(items) {
  if (!items.length) {
    return '-';
  }

  var labels = items.map(function(item) {
    return String(item.nama_produk || item.sku || '').trim();
  });

  if (labels.length <= 2) {
    return labels.join(', ');
  }

  return labels.slice(0, 2).join(', ') + ' +' + (labels.length - 2) + ' item';
}

function summarizeOrdersForAdmin_(orders) {
  var summary = {
    total_orders: orders.length,
    total_units: 0,
    total_revenue: 0,
    total_ongkir: 0,
    paid_orders: 0,
    unpaid_orders: 0,
    new_orders: 0,
    process_orders: 0,
    done_orders: 0,
    cancel_orders: 0
  };

  orders.forEach(function(order) {
    var statusOrder = normalizeString_(order.status_order);
    var paymentStatus = normalizeString_(order.payment_status);
    var isCancelled = statusOrder === 'CANCEL';

    if (paymentStatus === 'PAID') {
      summary.paid_orders += 1;
    } else {
      summary.unpaid_orders += 1;
    }

    if (statusOrder === 'NEW') {
      summary.new_orders += 1;
    } else if (statusOrder === 'PROCESS') {
      summary.process_orders += 1;
    } else if (statusOrder === 'DONE') {
      summary.done_orders += 1;
    } else if (statusOrder === 'CANCEL') {
      summary.cancel_orders += 1;
    }

    if (!isCancelled) {
      summary.total_units += toNumber_(order.qty_total);
      summary.total_revenue += toNumber_(order.grand_total);
      summary.total_ongkir += toNumber_(order.ongkir);
    }
  });

  return summary;
}

function getTopProductsFromOrders_(orders, limit) {
  var aggregated = {};

  orders.forEach(function(order) {
    if (normalizeString_(order.status_order) === 'CANCEL') {
      return;
    }

    (order.items || []).forEach(function(item) {
      var sku = String(item.sku || '').trim().toUpperCase();
      if (!sku) {
        return;
      }

      if (!aggregated[sku]) {
        aggregated[sku] = {
          sku: sku,
          nama_produk: item.nama_produk || sku,
          qty_sold: 0,
          revenue: 0
        };
      }

      aggregated[sku].qty_sold += toNumber_(item.qty);
      aggregated[sku].revenue += toNumber_(item.subtotal);
    });
  });

  return Object.keys(aggregated)
    .map(function(sku) {
      return aggregated[sku];
    })
    .sort(function(left, right) {
      if (right.qty_sold !== left.qty_sold) {
        return right.qty_sold - left.qty_sold;
      }
      return right.revenue - left.revenue;
    })
    .slice(0, Math.max(1, Number(limit || 8)));
}

function doGet(e) {
  return executeApiRequest_('GET', e);
}

function doPost(e) {
  return executeApiRequest_('POST', e);
}

function executeApiRequest_(method, e) {
  var route = parseApiRoute_(e);
  var endpoint = '/' + (route || '');
  var requestPayload = method === 'GET' ? (e && e.parameter ? e.parameter : {}) : parseJsonBody_(e);

  try {
    var responsePayload = dispatchApiRoute_(method, route, requestPayload, e);

    safeWriteApiLog_({
      Timestamp: new Date(),
      Method: method,
      Endpoint: endpoint,
      Payload_Singkat: requestPayload,
      Status: 200,
      Response_Singkat: {
        success: responsePayload.success,
        message: responsePayload.message,
        meta: responsePayload.meta
      }
    });

    return jsonOutput_(responsePayload);
  } catch (error) {
    var normalizedError = normalizeApiError_(error);
    var errorPayload = buildErrorEnvelope_(error);

    safeWriteApiLog_({
      Timestamp: new Date(),
      Method: method,
      Endpoint: endpoint,
      Payload_Singkat: requestPayload,
      Status: normalizedError.status,
      Response_Singkat: errorPayload
    });

    return jsonOutput_(errorPayload);
  }
}

function dispatchApiRoute_(method, route, payload, e) {
  if (method === 'GET') {
    return dispatchApiGetRoute_(route, payload, e);
  }

  if (method === 'POST') {
    return dispatchApiPostRoute_(route, payload, e);
  }

  throw apiError_('METHOD_NOT_ALLOWED', 'Method tidak didukung.', 405);
}

function dispatchApiGetRoute_(route, params) {
  switch (route) {
    case '':
      return buildSuccessEnvelope_('API Toko Vespa Jogja aktif.', {
        service: 'Toko Vespa Jogja API',
        version: '1.0.0',
        routes: [
          'GET /products',
          'GET /product',
          'GET /dashboard-summary',
          'POST /order',
          'POST /order/reconcile',
          'POST /admin/orders/list',
          'POST /admin/order/update',
          'POST /admin/order/delete',
          'POST /admin/product/create',
          'POST /admin/product/update',
          'POST /admin/product/delete',
          'POST /admin/marketplace/create',
          'POST /admin/marketplace/list',
          'POST /admin/stock/in',
          'POST /admin/stock/out',
          'POST /admin/order/cancel',
          'POST /admin/system-monitor'
        ]
      }, null);
    case 'products':
      return apiGetProducts_(params);
    case 'product':
      return apiGetProduct_(params);
    case 'dashboard-summary':
      return apiGetDashboardSummary_();
    default:
      throw apiError_('NOT_FOUND', 'Endpoint GET tidak ditemukan: /' + route, 404);
  }
}

function dispatchApiPostRoute_(route, payload, e) {
  switch (route) {
    case 'order':
      return apiCreateOrder_(payload, e);
    case 'order/reconcile':
      return apiReconcileOrder_(payload, e);
    case 'admin/orders/list':
      return apiAdminOrdersList_(payload, e);
    case 'admin/order/update':
      return apiAdminOrderUpdate_(payload, e);
    case 'admin/order/delete':
      return apiAdminOrderDelete_(payload, e);
    case 'admin/product/create':
      return apiAdminProductCreate_(payload, e);
    case 'admin/product/update':
      return apiAdminProductUpdate_(payload, e);
    case 'admin/product/delete':
      return apiAdminProductDelete_(payload, e);
    case 'admin/marketplace/create':
      return apiAdminMarketplaceCreate_(payload, e);
    case 'admin/marketplace/list':
      return apiAdminMarketplaceList_(payload, e);
    case 'admin/stock/in':
      return apiAdminStockIn_(payload, e);
    case 'admin/stock/out':
      return apiAdminStockOut_(payload, e);
    case 'admin/order/cancel':
      return apiAdminOrderCancel_(payload, e);
    case 'admin/system-monitor':
      return apiAdminSystemMonitor_(payload, e);
    default:
      throw apiError_('NOT_FOUND', 'Endpoint POST tidak ditemukan: /' + route, 404);
  }
}

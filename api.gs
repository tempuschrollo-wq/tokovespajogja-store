/**
 * Handles public GET web app requests.
 */
function doGet(e) {
  return handleApiRequest_('GET', e);
}

/**
 * Handles public and admin POST web app requests.
 */
function doPost(e) {
  return handleApiRequest_('POST', e);
}

/**
 * Routes normalized API requests to module-level handlers.
 */
function routeApiRequest_(method, endpoint, payload) {
  if (method === 'GET') {
    if (endpoint === '/' || endpoint === '/products' || endpoint === '/product-list') {
      return apiGetProducts_(payload);
    }
    if (endpoint === '/product' || endpoint === '/products/detail') {
      return apiGetProduct_(payload);
    }
    if (endpoint === '/dashboard-summary' || endpoint === '/dashboard') {
      return apiDashboardSummary_();
    }
    if (endpoint === '/reports/history') {
      return apiReportsHistory_(payload);
    }
    if (endpoint === '/reports/current') {
      return apiReportsCurrent_();
    }
    if (endpoint === '/health' || endpoint === '/ping') {
      return apiHealth_();
    }
    if (endpoint === '/marketplace/products') {
      return apiMarketplaceProducts_(payload);
    }
    return apiError_('ENDPOINT_NOT_FOUND', null, { endpoint: endpoint });
  }

  if (method === 'POST') {
    if (endpoint === '/order' ||
        endpoint === '/orders' ||
        endpoint === '/create-order' ||
        endpoint === '/createorder' ||
        endpoint === '/submitorder' ||
        endpoint === '/order/create') {
      return apiCreateOrder_(payload);
    }
    if (endpoint === '/admin/order/cancel' ||
        endpoint === '/admin/orders/cancel' ||
        endpoint === '/cancelorder' ||
        endpoint === '/order/cancel') {
      return apiCancelOrder_(payload);
    }
    if (endpoint === '/admin/order/delete') {
      return apiDeleteOrder_(payload);
    }
    if (endpoint === '/admin/orders/list') {
      return apiAdminOrdersList_(payload);
    }
    if (endpoint === '/admin/stock/in') {
      return apiAdminStockIn_(payload);
    }
    if (endpoint === '/admin/stock/out') {
      return apiAdminStockOut_(payload);
    }
    if (endpoint === '/admin/products/update') {
      return apiAdminProductsUpdate_(payload);
    }
    if (endpoint === '/admin/marketplace/create' ||
        endpoint === '/admin/marketplace/order/create' ||
        endpoint === '/admin/order/marketplace/create' ||
        endpoint === '/admin/offline-selling/create') {
      return apiAdminMarketplaceCreate_(payload, endpoint);
    }
    if (endpoint === '/admin/marketplace/list' ||
        endpoint === '/admin/marketplace/order/list' ||
        endpoint === '/admin/order/marketplace/list') {
      return apiAdminMarketplaceList_(payload);
    }
    if (endpoint === '/admin/system-monitor') {
      return apiAdminSystemMonitor_();
    }
    if (endpoint === '/admin/system/backup') {
      return apiAdminSystemBackup_();
    }
    if (endpoint === '/admin/system/refresh-reporting') {
      return apiAdminRefreshReporting_();
    }
    if (endpoint === '/admin/system/archive') {
      archiveOldLogsNow();
      return apiSuccess_('ARCHIVE_COMPLETE', {});
    }
    if (endpoint === '/admin/system/smoke-test') {
      return apiSuccess_('SMOKE_TEST_COMPLETE', runInternalSmokeTest());
    }
    return apiError_('ENDPOINT_NOT_FOUND', null, { endpoint: endpoint });
  }

  return apiError_('METHOD_NOT_ALLOWED', null, { method: method });
}

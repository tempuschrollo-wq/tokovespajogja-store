/**
 * Builds a standard successful API response object.
 */
function apiSuccess_(message, data, meta) {
  return {
    success: true,
    message: message || 'OK',
    data: typeof data === 'undefined' ? null : data,
    meta: meta || {}
  };
}

/**
 * Builds a standard failed API response object.
 */
function apiError_(message, data, meta) {
  return {
    success: false,
    message: message || 'ERROR',
    data: typeof data === 'undefined' ? null : data,
    meta: meta || {}
  };
}

/**
 * Converts a response object to JSON ContentService output.
 */
function jsonResponse_(response) {
  return ContentService
    .createTextOutput(stringifySafe_(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Parses query parameters and JSON body into one plain request payload.
 */
function parseRequestPayload_(e) {
  var payload = {};
  if (e && e.parameter) {
    for (var key in e.parameter) {
      if (e.parameter.hasOwnProperty(key)) {
        payload[key] = e.parameter[key];
      }
    }
  }
  if (e && e.postData && e.postData.contents) {
    var body = parseJsonSafe_(e.postData.contents, null);
    if (body && typeof body === 'object') {
      for (var bodyKey in body) {
        if (body.hasOwnProperty(bodyKey)) {
          payload[bodyKey] = body[bodyKey];
        }
      }
    } else if (String(e.postData.contents || '').trim() !== '') {
      payload.raw_body = e.postData.contents;
    }
  }
  return payload;
}

/**
 * Normalizes Apps Script pathInfo, query endpoint, or action into one route.
 */
function normalizeEndpoint_(e, payload, method) {
  var endpoint = '';
  if (e && e.pathInfo) {
    endpoint = String(e.pathInfo);
  }
  if (endpoint === '' && payload) {
    endpoint = payload.endpoint || payload.path || payload.route || payload.action || '';
  }
  endpoint = String(endpoint || '').trim();
  if (endpoint === '') {
    endpoint = method === 'GET' ? '/products' : '/';
  }
  endpoint = endpoint.replace(/^https?:\/\/[^\/]+/i, '');
  endpoint = endpoint.replace(/^\/?exec\/?/i, '');
  endpoint = endpoint.replace(/^\/?dev\/?/i, '');
  endpoint = endpoint.replace(/^\/?api\/?/i, '');
  if (endpoint.charAt(0) !== '/') {
    endpoint = '/' + endpoint;
  }
  endpoint = endpoint.replace(/\/+/g, '/');
  if (endpoint.length > 1 && endpoint.charAt(endpoint.length - 1) === '/') {
    endpoint = endpoint.substring(0, endpoint.length - 1);
  }
  return endpoint.toLowerCase();
}

/**
 * Handles token checks for admin endpoints.
 */
function validateAdminAuth_(e, payload, endpoint) {
  if (!isAdminEndpoint_(endpoint)) {
    return { ok: true };
  }
  var cfg = tvjConfig_();
  var configuredToken = String(getSettingValue_(cfg.settingsKeys.adminToken, '') || '').trim();
  if (configuredToken === '') {
    return {
      ok: false,
      response: apiError_('ADMIN_TOKEN_NOT_CONFIGURED', null, { code: 'ADMIN_TOKEN_NOT_CONFIGURED' })
    };
  }
  var suppliedToken = '';
  if (payload) {
    suppliedToken = payload.admin_token || payload.ADMIN_TOKEN || payload.token || payload.Token || '';
  }
  suppliedToken = String(suppliedToken || '').trim();
  if (suppliedToken === '' || suppliedToken !== configuredToken) {
    return {
      ok: false,
      response: apiError_('ADMIN_UNAUTHORIZED', null, { code: 'ADMIN_UNAUTHORIZED' })
    };
  }
  return { ok: true };
}

/**
 * Returns true when a route must use admin authentication.
 */
function isAdminEndpoint_(endpoint) {
  var normalized = String(endpoint || '').toLowerCase();
  return normalized.indexOf('/admin/') === 0 ||
    normalized === '/cancelorder' ||
    normalized === '/order/cancel';
}

/**
 * Removes auth-only fields before passing payloads to business logic.
 */
function stripAuthFields_(payload) {
  var output = {};
  for (var key in payload) {
    if (payload.hasOwnProperty(key)) {
      var lower = String(key).toLowerCase();
      if (lower !== 'admin_token' && lower !== 'token' && lower !== 'authorization') {
        output[key] = payload[key];
      }
    }
  }
  return output;
}

/**
 * Main API request wrapper with routing, auth, JSON output, and API_LOG.
 */
function handleApiRequest_(method, e) {
  var payload = parseRequestPayload_(e);
  var endpoint = normalizeEndpoint_(e, payload, method);
  var response;
  try {
    var auth = validateAdminAuth_(e, payload, endpoint);
    if (!auth.ok) {
      response = auth.response;
    } else {
      response = routeApiRequest_(method, endpoint, stripAuthFields_(payload));
    }
  } catch (err) {
    response = apiError_(err.message, null, { code: 'EXCEPTION' });
  }
  appendApiLog_(method, endpoint, payload, response.success ? 'SUCCESS' : 'ERROR', response);
  return jsonResponse_(response);
}

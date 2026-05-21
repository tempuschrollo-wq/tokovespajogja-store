/**
 * Returns paginated storefront products.
 */
function apiGetProducts_(params) {
  var cfg = tvjConfig_();
  var rows = getRowsAsObjects_(cfg.sheets.master);
  var page = Math.max(1, parseInt(params.page || 1, 10) || 1);
  var limit = Math.max(1, Math.min(200, parseInt(params.limit || 50, 10) || 50));
  var search = normalizeText_(params.search || params.q || '');
  var kategori = normalizeText_(params.kategori || params.category || '');
  var includeInactive = isTruthySetting_(params.include_inactive || params.includeInactive || 'FALSE');
  var products = [];

  for (var i = 0; i < rows.length; i++) {
    if (!includeInactive && !isActiveProduct_(rows[i])) {
      continue;
    }
    var apiProduct = productRowToApi_(rows[i]);
    if (search !== '') {
      var haystack = normalizeText_(apiProduct.sku + ' ' + apiProduct.nama_produk + ' ' + apiProduct.kategori + ' ' + apiProduct.model_vespa);
      if (haystack.indexOf(search) < 0) {
        continue;
      }
    }
    if (kategori !== '' && normalizeText_(apiProduct.kategori) !== kategori) {
      continue;
    }
    products.push(apiProduct);
  }

  var total = products.length;
  var totalPages = Math.max(1, Math.ceil(total / limit));
  var start = (page - 1) * limit;
  var paged = products.slice(start, start + limit);
  return apiSuccess_('PRODUCTS_OK', {
    products: paged,
    total: total,
    page: page,
    limit: limit,
    total_pages: totalPages
  });
}

/**
 * Returns one storefront product by SKU or Product_ID.
 */
function apiGetProduct_(params) {
  var sku = normalizeSku_(params.sku || params.SKU || '');
  var productId = String(params.product_id || params.Product_ID || params.id || '').trim();
  var rows = getRowsAsObjects_(tvjConfig_().sheets.master);
  for (var i = 0; i < rows.length; i++) {
    if (sku !== '' && normalizeSku_(rows[i].SKU) === sku) {
      return apiSuccess_('PRODUCT_OK', productRowToApi_(rows[i]));
    }
    if (productId !== '' && String(rows[i].Product_ID || '').trim() === productId) {
      return apiSuccess_('PRODUCT_OK', productRowToApi_(rows[i]));
    }
  }
  return apiError_('PRODUCT_NOT_FOUND', null, { code: 'PRODUCT_NOT_FOUND' });
}

/**
 * Returns a compact dashboard summary for website or admin views.
 */
function apiDashboardSummary_() {
  return apiSuccess_('DASHBOARD_SUMMARY_OK', getDashboardMetrics_());
}

/**
 * Converts a MASTER_PRODUCTS row to the website product contract.
 */
function productRowToApi_(row) {
  var stockStatus = String(row.Status_Stok || '').trim();
  if (stockStatus === '') {
    stockStatus = calculateStockStatus_(row.Stok_Aktif, row.Minimum_Stok);
  }
  return {
    product_id: String(row.Product_ID || '').trim(),
    sku: normalizeSku_(row.SKU),
    nama_produk: String(row.Nama_Produk || '').trim(),
    kategori: String(row.Kategori || '').trim(),
    model_vespa: String(row.Model_Vespa || '').trim(),
    deskripsi_singkat: String(row.Deskripsi_Singkat || '').trim(),
    harga_modal: safeToNumber_(row.Harga_Modal),
    harga_jual: safeToNumber_(row.Harga_Jual),
    margin_rp: safeToNumber_(row.Margin_Rp),
    margin_persen: safeToNumber_(row.Margin_Persen),
    stok_aktif: safeToNumber_(row.Stok_Aktif),
    minimum_stok: safeToNumber_(row.Minimum_Stok),
    status_stok: stockStatus,
    status_produk: String(row.Status_Produk || '').trim(),
    image_url: String(row.Image_URL || '').trim(),
    berat: safeToNumber_(row.Berat),
    lokasi_rak: String(row.Lokasi_Rak || '').trim(),
    last_updated: row.Last_Updated || ''
  };
}

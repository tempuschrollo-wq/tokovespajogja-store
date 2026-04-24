function apiGetProducts_(params) {
  var search = String(params.search || '').trim().toLowerCase();
  var kategori = String(params.kategori || '').trim().toLowerCase();
  var sku = String(params.sku || '').trim().toLowerCase();
  var limit = parseLimitParam_(params.limit);
  var page = parsePageParam_(params.page);

  var products = getActiveMasterProducts_().filter(function(product) {
    if (kategori && String(product.Kategori || '').trim().toLowerCase() !== kategori) {
      return false;
    }

    if (sku && String(product.SKU || '').trim().toLowerCase() !== sku) {
      return false;
    }

    if (search) {
      var haystack = [
        product.Product_ID,
        product.SKU,
        product.Nama_Produk,
        product.Kategori,
        product.Model_Vespa,
        product.Deskripsi_Singkat
      ]
        .join(' ')
        .toLowerCase();

      if (haystack.indexOf(search) === -1) {
        return false;
      }
    }

    return true;
  });

  products.sort(function(left, right) {
    return String(left.Nama_Produk || '').localeCompare(String(right.Nama_Produk || ''));
  });

  var total = products.length;
  var offset = (page - 1) * limit;
  var pagedProducts = products.slice(offset, offset + limit).map(mapMasterProductToApi_);

  return buildSuccessEnvelope_('Daftar produk berhasil diambil.', pagedProducts, {
    total: total,
    page: page,
    limit: limit,
    total_pages: Math.max(1, Math.ceil(total / limit))
  });
}

function apiGetProduct_(params) {
  var identifier = getProductIdentifierForApi_(params);
  var product = null;

  if (identifier.sku) {
    product = findActiveProductBySku_(identifier.sku);
  } else if (identifier.productId) {
    product = findActiveProductById_(identifier.productId);
  } else {
    throw apiError_(
      'VALIDATION_ERROR',
      'Parameter sku atau id wajib dikirim untuk endpoint /product.',
      400
    );
  }

  if (!product) {
    throw apiError_('NOT_FOUND', 'Produk aktif tidak ditemukan.', 404);
  }

  return buildSuccessEnvelope_('Detail produk berhasil diambil.', mapMasterProductToApi_(product), null);
}

function apiGetDashboardSummary_() {
  var products = getActiveMasterProducts_();
  var summary = {
    total_produk_aktif: 0,
    total_stok_unit: 0,
    ready_stock: 0,
    low_stock: 0,
    out_of_stock: 0,
    total_nilai_inventory_modal: 0,
    total_nilai_inventory_jual: 0
  };

  products.forEach(function(product) {
    var stokAktif = toNumber_(product.Stok_Aktif);
    var hargaModal = toNumber_(product.Harga_Modal);
    var hargaJual = toNumber_(product.Harga_Jual);
    var statusStok = normalizeString_(product.Status_Stok);

    summary.total_produk_aktif += 1;
    summary.total_stok_unit += stokAktif;
    summary.total_nilai_inventory_modal += stokAktif * hargaModal;
    summary.total_nilai_inventory_jual += stokAktif * hargaJual;

    if (statusStok === 'READY') {
      summary.ready_stock += 1;
    } else if (statusStok === 'LOW') {
      summary.low_stock += 1;
    } else if (statusStok === 'OUT OF STOCK') {
      summary.out_of_stock += 1;
    }
  });

  return buildSuccessEnvelope_('Ringkasan dashboard berhasil diambil.', summary, null);
}

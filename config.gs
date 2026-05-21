/**
 * Central configuration for the Toko Vespa Jogja inventory backend.
 * Sheet names, required headers, API routes, and menu labels are kept here
 * so the rest of the code does not rely on magic strings.
 */
var TVJ_CONFIG = {
  appName: 'TVJ Inventory',
  productIdPrefix: 'PRD-JVS-',
  defaultTimezone: 'Asia/Jakarta',
  defaultCurrency: 'IDR',
  lockWaitMs: 30000,
  apiLogPayloadLimit: 500,
  apiLogResponseLimit: 500,
  recentActivityLimit: 10,
  sheets: {
    master: 'MASTER_PRODUCTS',
    stockIn: 'STOCK_IN',
    stockOut: 'STOCK_OUT',
    orders: 'ORDERS_WEBSITE',
    inventoryLog: 'INVENTORY_LOG',
    settings: 'SETTINGS',
    dashboard: 'DASHBOARD',
    weeklyReport: 'WEEKLY_REPORT',
    monthlyReport: 'MONTHLY_REPORT',
    apiLog: 'API_LOG',
    apiLogArchive: 'API_LOG_ARCHIVE',
    adminSpace: 'ADMIN_SPACE',
    helper: 'Helper'
  },
  adminSpace: {
    sheetName: 'ADMIN_SPACE',
    masterStartRow: 20,
    formRows: {
      stockCorrection: { startRow: 7, endRow: 9 },
      addProduct: { startRow: 13, endRow: 15 },
      stockIn: { startRow: 7, endRow: 9 },
      stockOut: { startRow: 13, endRow: 15 }
    },
    ranges: {
      summary: 'A2:E3',
      stockCorrection: 'A7:F9',
      addProduct: 'A13:F15',
      stockIn: 'H7:M9',
      stockOut: 'H13:M15',
      masterProducts: 'A20:J'
    },
    columns: {
      stockCorrection: {
        productOption: 1,
        skuAuto: 2,
        qty: 3,
        reason: 4,
        note: 5,
        submit: 6
      },
      addProduct: {
        name: 1,
        category: 2,
        hargaJual: 3,
        hargaModal: 4,
        stokAwal: 5,
        submit: 6
      },
      stockIn: {
        productOption: 8,
        skuAuto: 9,
        qty: 10,
        hargaModal: 11,
        note: 12,
        submit: 13
      },
      stockOut: {
        productOption: 8,
        skuAuto: 9,
        qty: 10,
        hargaJual: 11,
        note: 12,
        submit: 13
      },
      adminMaster: {
        productId: 1,
        sku: 2,
        namaProduk: 3,
        kategori: 4,
        stokIn: 5,
        stokOut: 6,
        balance: 7,
        hargaJual: 8,
        hargaModal: 9,
        statusProduk: 10
      }
    }
  },
  headers: {
    MASTER_PRODUCTS: [
      'Product_ID',
      'SKU',
      'Nama_Produk',
      'Kategori',
      'Model_Vespa',
      'Deskripsi_Singkat',
      'Harga_Modal',
      'Harga_Jual',
      'Margin_Rp',
      'Margin_Persen',
      'Stok_Aktif',
      'Minimum_Stok',
      'Status_Stok',
      'Status_Produk',
      'Image_URL',
      'Berat',
      'Lokasi_Rak',
      'Marketplace_SKU_Shopee',
      'Marketplace_SKU_Tokopedia',
      'Marketplace_SKU_TikTok',
      'Last_Updated',
      'Updated_By'
    ],
    STOCK_IN: [
      'In_ID',
      'Tanggal',
      'SKU',
      'Nama_Produk',
      'Qty_Masuk',
      'Harga_Modal_Satuan',
      'Total_Modal_Masuk',
      'Supplier',
      'Catatan',
      'Input_By'
    ],
    STOCK_OUT: [
      'Out_ID',
      'Tanggal',
      'SKU',
      'Nama_Produk',
      'Jenis_Keluar',
      'Reference_ID',
      'Qty_Keluar',
      'Harga_Jual_Satuan',
      'Total_Penjualan',
      'Catatan',
      'Input_By'
    ],
    ORDERS_WEBSITE: [
      'Order_ID',
      'Order_Date',
      'Customer_Nama',
      'Customer_WhatsApp',
      'Customer_Alamat',
      'Item_JSON',
      'SKU_List',
      'Qty_Total',
      'Subtotal',
      'Ongkir',
      'Grand_Total',
      'Status_Order',
      'Payment_Status',
      'Source',
      'Catatan',
      'Created_At'
    ],
    INVENTORY_LOG: [
      'Log_ID',
      'Timestamp',
      'SKU',
      'Nama_Produk',
      'Tipe_Log',
      'Qty_Change',
      'Stok_Sebelum',
      'Stok_Sesudah',
      'Reference_ID',
      'Note',
      'Actor'
    ],
    SETTINGS: [
      'Key',
      'Value',
      'Description'
    ],
    API_LOG: [
      'Timestamp',
      'Method',
      'Endpoint',
      'Payload_Singkat',
      'Status',
      'Response_Singkat'
    ],
    API_LOG_ARCHIVE: [
      'Timestamp',
      'Method',
      'Endpoint',
      'Payload_Singkat',
      'Status',
      'Response_Singkat'
    ]
  },
  menu: [
    ['Process row STOCK_IN aktif', 'processActiveStockInRow'],
    ['Process row STOCK_OUT aktif', 'processActiveStockOutRow'],
    ['Process semua pending STOCK_IN', 'processAllPendingStockIn'],
    ['Process semua pending STOCK_OUT', 'processAllPendingStockOut'],
    ['Recompute semua Status_Stok', 'recomputeAllStockStatus'],
    ['Validate MASTER_PRODUCTS', 'validateMasterProducts'],
    ['Generate Product_ID yang kosong', 'generateMissingProductIds'],
    ['Backfill margin produk', 'backfillProductMargins'],
    ['Refresh DASHBOARD', 'refreshDashboard'],
    ['Refresh semua reporting', 'refreshAllReporting'],
    ['Install trigger reporting', 'installReportingTrigger'],
    ['Backup spreadsheet sekarang', 'backupSpreadsheetNow'],
    ['Jalankan Archive Sekarang', 'archiveOldLogsNow'],
    ['Refresh ADMIN_SPACE', 'refreshAdminSpace'],
    ['Unlock input ADMIN_SPACE', 'unlockAdminSpaceEditableAreas'],
    ['Process submit ADMIN_SPACE', 'processAdminSpaceSubmits'],
    ['Sync ADMIN_SPACE edits to MASTER_PRODUCTS', 'syncAdminMasterEditsToMaster']
  ],
  settingsKeys: {
    adminToken: 'ADMIN_TOKEN',
    timezone: 'Zona_Waktu',
    currency: 'Mata_Uang',
    backupFolderId: 'Backup_Folder_Id',
    lastBackupTime: 'Last_Backup_Time',
    logArchiveDays: 'Log_Archive_Days',
    lowStockDefault: 'Low_Stock_Threshold_Default',
    allowNegativeStock: 'Allow_Negative_Stock',
    testMode: 'TEST_MODE'
  },
  statuses: {
    active: 'AKTIF',
    inactive: 'NONAKTIF',
    ready: 'READY',
    low: 'LOW',
    outOfStock: 'OUT_OF_STOCK',
    cancelled: 'CANCELLED',
    cancelledId: 'DIBATALKAN'
  }
};

/**
 * Returns a stable reference to the backend configuration.
 */
function tvjConfig_() {
  return TVJ_CONFIG;
}

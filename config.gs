var APP_TIMEZONE = 'Asia/Jakarta';
var APP_CURRENCY = 'IDR';
var ENABLE_ON_EDIT_AUTOMATION = false;
var LOCK_WAIT_MS = 30000;
var API_DEFAULT_LIMIT = 50;
var API_MAX_LIMIT = 1000;
var API_ORDER_DUPLICATE_WINDOW_SECONDS = 90;
var API_RECENT_DUPLICATE_LOOKBACK_MINUTES = 5;
var API_ORDER_RECONCILE_LOOKBACK_MINUTES = 30;

var SHEETS = {
  MASTER_PRODUCTS: 'MASTER_PRODUCTS',
  STOCK_IN: 'STOCK_IN',
  STOCK_OUT: 'STOCK_OUT',
  ORDERS_WEBSITE: 'ORDERS_WEBSITE',
  INVENTORY_LOG: 'INVENTORY_LOG',
  SETTINGS: 'SETTINGS',
  DASHBOARD: 'DASHBOARD',
  WEEKLY_REPORT: 'WEEKLY_REPORT',
  MONTHLY_REPORT: 'MONTHLY_REPORT',
  API_LOG: 'API_LOG'
};

var HEADERS = {};

HEADERS[SHEETS.MASTER_PRODUCTS] = [
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
];

HEADERS[SHEETS.STOCK_IN] = [
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
];

HEADERS[SHEETS.STOCK_OUT] = [
  'Out_ID',
  'Tanggal',
  'SKU',
  'Nama_Produk',
  'Jenis_Keluar',
  'Referensi_ID',
  'Qty_Keluar',
  'Harga_Jual_Satuan',
  'Total_Penjualan',
  'Catatan',
  'Input_By'
];

HEADERS[SHEETS.ORDERS_WEBSITE] = [
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
];

HEADERS[SHEETS.INVENTORY_LOG] = [
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
];

HEADERS[SHEETS.SETTINGS] = [
  'Key',
  'Value',
  'Description'
];

HEADERS[SHEETS.DASHBOARD] = [
  'Metric_Group',
  'Metric_Name',
  'Metric_Value',
  'Metric_Format',
  'Last_Refreshed',
  'Notes'
];

HEADERS[SHEETS.WEEKLY_REPORT] = [
  'Week_Key',
  'Period_Start',
  'Period_End',
  'Orders_Count',
  'Units_Sold',
  'Revenue',
  'Estimated_COGS',
  'Estimated_Gross_Profit',
  'Stock_In_Qty',
  'Stock_Out_Qty',
  'Cancel_Count',
  'Top_SKU',
  'Low_Stock_Count',
  'Generated_At'
];

HEADERS[SHEETS.MONTHLY_REPORT] = [
  'Month_Key',
  'Period_Start',
  'Period_End',
  'Orders_Count',
  'Units_Sold',
  'Revenue',
  'Estimated_COGS',
  'Estimated_Gross_Profit',
  'Stock_In_Qty',
  'Stock_Out_Qty',
  'Cancel_Count',
  'Top_SKU',
  'Low_Stock_Count',
  'Generated_At'
];

HEADERS[SHEETS.API_LOG] = [
  'Timestamp',
  'Method',
  'Endpoint',
  'Payload_Singkat',
  'Status',
  'Response_Singkat'
];

var ENUMS = {
  STATUS_PRODUK: ['AKTIF', 'NONAKTIF'],
  STATUS_STOK: ['READY', 'LOW', 'OUT OF STOCK'],
  STATUS_ORDER: ['NEW', 'PROCESS', 'DONE', 'CANCEL'],
  PAYMENT_STATUS: ['UNPAID', 'PAID'],
  JENIS_KELUAR: ['ORDER', 'RUSAK', 'HILANG', 'MANUAL'],
  INVENTORY_LOG_TYPE: ['STOCK_IN', 'STOCK_OUT'],
  API_METHOD: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
};

var SETTINGS_KEYS = {
  NAMA_TOKO: 'Nama_Toko',
  NO_WHATSAPP: 'No_WhatsApp',
  URL_WEBSITE: 'URL_Website',
  URL_SHOPEE: 'URL_Shopee',
  URL_TOKOPEDIA: 'URL_Tokopedia',
  URL_INSTAGRAM: 'URL_Instagram',
  URL_TIKTOK: 'URL_TikTok',
  MATA_UANG: 'Mata_Uang',
  ZONA_WAKTU: 'Zona_Waktu',
  LOW_STOCK_THRESHOLD_DEFAULT: 'Low_Stock_Threshold_Default',
  LOG_ARCHIVE_DAYS: 'Log_Archive_Days',
  ARCHIVE_SPREADSHEET_ID: 'Archive_Spreadsheet_Id',
  BACKUP_FOLDER_ID: 'Backup_Folder_Id',
  LAST_BACKUP_TIME: 'Last_Backup_Time'
};

var ID_PREFIX = {
  Product_ID: 'PRD',
  In_ID: 'IN',
  Out_ID: 'OUT',
  Order_ID: 'ORD',
  Log_ID: 'LOG'
};

var DEFAULT_VALUES = {
  LOW_STOCK_THRESHOLD_DEFAULT: 0,
  UPDATED_BY_FALLBACK: 'SYSTEM',
  STATUS_PRODUK: 'AKTIF'
};

var SCRIPT_PROPERTY_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  ADMIN_API_TOKEN: 'ADMIN_API_TOKEN'
};

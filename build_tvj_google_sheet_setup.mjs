import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, "outputs", "tvj-google-sheet-setup");
const workbookPath = path.join(outputDir, "Toko Vespa Jogja - Google Sheet Setup.xlsx");

const sourceCatalogPath = path.join(__dirname, "catalog-data.json");

const APP_TIMEZONE = "Asia/Jakarta";
const IMPORT_ACTOR = "INITIAL_IMPORT";
const lowStockDefault = 1;

const SHEETS = {
  MASTER_PRODUCTS: "MASTER_PRODUCTS",
  STOCK_IN: "STOCK_IN",
  STOCK_OUT: "STOCK_OUT",
  ORDERS_WEBSITE: "ORDERS_WEBSITE",
  INVENTORY_LOG: "INVENTORY_LOG",
  SETTINGS: "SETTINGS",
  DASHBOARD: "DASHBOARD",
  WEEKLY_REPORT: "WEEKLY_REPORT",
  MONTHLY_REPORT: "MONTHLY_REPORT",
  API_LOG: "API_LOG"
};

const HEADERS = {
  MASTER_PRODUCTS: [
    "Product_ID",
    "SKU",
    "Nama_Produk",
    "Kategori",
    "Model_Vespa",
    "Deskripsi_Singkat",
    "Harga_Modal",
    "Harga_Jual",
    "Margin_Rp",
    "Margin_Persen",
    "Stok_Aktif",
    "Minimum_Stok",
    "Status_Stok",
    "Status_Produk",
    "Image_URL",
    "Berat",
    "Lokasi_Rak",
    "Marketplace_SKU_Shopee",
    "Marketplace_SKU_Tokopedia",
    "Marketplace_SKU_TikTok",
    "Last_Updated",
    "Updated_By"
  ],
  STOCK_IN: [
    "In_ID",
    "Tanggal",
    "SKU",
    "Nama_Produk",
    "Qty_Masuk",
    "Harga_Modal_Satuan",
    "Total_Modal_Masuk",
    "Supplier",
    "Catatan",
    "Input_By"
  ],
  STOCK_OUT: [
    "Out_ID",
    "Tanggal",
    "SKU",
    "Nama_Produk",
    "Jenis_Keluar",
    "Referensi_ID",
    "Qty_Keluar",
    "Harga_Jual_Satuan",
    "Total_Penjualan",
    "Catatan",
    "Input_By"
  ],
  ORDERS_WEBSITE: [
    "Order_ID",
    "Order_Date",
    "Customer_Nama",
    "Customer_WhatsApp",
    "Customer_Alamat",
    "Item_JSON",
    "SKU_List",
    "Qty_Total",
    "Subtotal",
    "Ongkir",
    "Grand_Total",
    "Status_Order",
    "Payment_Status",
    "Source",
    "Catatan",
    "Created_At"
  ],
  INVENTORY_LOG: [
    "Log_ID",
    "Timestamp",
    "SKU",
    "Nama_Produk",
    "Tipe_Log",
    "Qty_Change",
    "Stok_Sebelum",
    "Stok_Sesudah",
    "Reference_ID",
    "Note",
    "Actor"
  ],
  SETTINGS: ["Key", "Value", "Description"],
  DASHBOARD: ["Metric_Group", "Metric_Name", "Metric_Value", "Metric_Format", "Last_Refreshed", "Notes"],
  WEEKLY_REPORT: [
    "Week_Key",
    "Period_Start",
    "Period_End",
    "Orders_Count",
    "Units_Sold",
    "Revenue",
    "Estimated_COGS",
    "Estimated_Gross_Profit",
    "Stock_In_Qty",
    "Stock_Out_Qty",
    "Cancel_Count",
    "Top_SKU",
    "Low_Stock_Count",
    "Generated_At"
  ],
  MONTHLY_REPORT: [
    "Month_Key",
    "Period_Start",
    "Period_End",
    "Orders_Count",
    "Units_Sold",
    "Revenue",
    "Estimated_COGS",
    "Estimated_Gross_Profit",
    "Stock_In_Qty",
    "Stock_Out_Qty",
    "Cancel_Count",
    "Top_SKU",
    "Low_Stock_Count",
    "Generated_At"
  ],
  API_LOG: ["Timestamp", "Method", "Endpoint", "Payload_Singkat", "Status", "Response_Singkat"]
};

const categoryLabels = {
  mesin: "Mesin",
  "kaki-kaki": "Kaki-Kaki",
  kelistrikan: "Kelistrikan",
  body: "Body",
  servis: "Servis",
  aksesoris: "Aksesoris"
};

const socialLinks = {
  maps:
    "https://www.google.com/maps?q=Party+Garage+(TOKO+VESPA+JOGJA),+Jl.+Selokan+Mataram,+Kadirojo+I,+Purwomartani,+Kec.+Kalasan,+Kabupaten+Sleman,+Daerah+Istimewa+Yogyakarta+55571&ftid=0x2e7af905412b9b4f:0x8db69b72f27559aa&entry=gps&lucs=,94207805,47071704,94206167,47069508,94218641,94203019,47084304&g_ep=CAISDTYuMTMwLjEuODIwNzAYACDXggMqPyw5NDIwNzgwNSw0NzA3MTcwNCw5NDIwNjE2Nyw0NzA2OTUwOCw5NDIxODY0MSw5NDIwMzAxOSw0NzA4NDMwNEICSUQ%3D&g_st=ic",
  shopee:
    "https://shopee.co.id/partygarage?mmp_pid=an_11358540745&uls_trackid=55faj09l026l&utm_campaign=-&utm_content=product&utm_medium=affiliates&utm_source=an_11358540745&utm_term=esd2nin1keuu",
  tokopedia:
    "https://www.tokopedia.com/partygarage?aff_unique_id=VjgAA7a-YnTM8-Fw3Ka8JN5oQ2eCH3SBLEpL_sptR1rkd-oWAjGg1tPP606HGPXIZLg%3D&channel=others&_branch_match_id=1393927041289602488&utm_source=others&utm_campaign=affiliateshare-shop-VjgAA7a-YnTM8-Fw3Ka8JN5oQ2eCH3SBLEpL_sptR1rkd-oWAjGg1tPP606HGPXIZLg%253D-0-0-110924&utm_medium=affiliate-share&_branch_referrer=H4sIAAAAAAAAA8soKSkottLXL8nPzi9ITclM1MvJzMvWL0sOyHXzSvX39U2yrytKTUstKsrMS49PKsovL04tsnXOKMrPTQUATcKVfzwAAAA%3D",
  whatsapp:
    "https://api.whatsapp.com/send/?phone=%2B6288802500388&text&type=phone_number&app_absent=0",
  instagram: "https://www.instagram.com/partygarage.id?utm_medium=copy_link",
  facebook: "https://www.facebook.com/profile.php?id=100072034242791&mibextid=ZbWKwL",
  tiktok: "https://www.tiktok.com/@tokovespajogja?_t=8pvgj2hx0ia&_r=1"
};

const settingsRows = [
  ["Nama_Toko", "Toko Vespa Jogja", "Nama toko utama yang dipakai di website dan dashboard"],
  ["No_WhatsApp", "6288802500388", "Nomor WhatsApp utama untuk order"],
  ["URL_Website", "", "Isi dengan URL website produksi saat sudah live"],
  ["URL_Shopee", socialLinks.shopee, "Link toko Shopee"],
  ["URL_Tokopedia", socialLinks.tokopedia, "Link toko Tokopedia"],
  ["URL_Instagram", socialLinks.instagram, "Link Instagram toko"],
  ["URL_TikTok", socialLinks.tiktok, "Link TikTok toko"],
  ["URL_Facebook", socialLinks.facebook, "Link Facebook toko"],
  ["URL_Google_Maps", socialLinks.maps, "Link Google Maps toko fisik"],
  ["URL_WhatsApp", socialLinks.whatsapp, "Link WhatsApp order"],
  ["Mata_Uang", "IDR", "Gunakan Rupiah sebagai nominal sistem"],
  ["Zona_Waktu", APP_TIMEZONE, "Timezone utama untuk Apps Script dan report"],
  ["Low_Stock_Threshold_Default", String(lowStockDefault), "Ambang default minimum stok jika Minimum_Stok produk kosong"],
  ["Last_Backup_Time", "", "Isi otomatis saat backup dijalankan"],
  ["Catalog_Source_URL", "", "Opsional, isi sumber feed katalog jika nanti ada sinkronisasi otomatis"],
  ["Setup_Note", "Harga_Modal bootstrap diisi sama dengan Harga_Jual jika harga tersedia", "Segera update modal asli sebelum memakai report profit untuk keputusan bisnis"]
];

const catalogPayload = JSON.parse(await fs.readFile(sourceCatalogPath, "utf8"));
const importDate = new Date(`${catalogPayload.updatedAt}T08:00:00`);

const workbook = Workbook.create();

for (const sheetName of Object.values(SHEETS)) {
  workbook.worksheets.add(sheetName);
}

const baseHeaderFormat = {
  fill: "#1F4D3A",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true
};

const mutedHeaderFormat = {
  fill: "#DCE8E1",
  font: { bold: true, color: "#163326" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true
};

function setSheetHeaders(sheetName) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const headers = HEADERS[sheetName];
  const endColumn = columnLetter(headers.length);

  sheet.getRange(`A1:${endColumn}1`).values = [headers];
  sheet.getRange(`A1:${endColumn}1`).format = baseHeaderFormat;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = true;

  return sheet;
}

function columnLetter(index) {
  let result = "";
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function computeStatusStok(stock, minimumStock) {
  const numericStock = Number(stock) || 0;
  const threshold = Number(minimumStock) || 0;

  if (numericStock <= 0) {
    return "OUT OF STOCK";
  }

  if (numericStock <= threshold) {
    return "LOW";
  }

  return "READY";
}

function normalizeTitleCase(value = "") {
  return String(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildMasterProductRows(products) {
  return products.map((product) => {
    const sku = String(product.sku || "").trim().toUpperCase();
    const price = typeof product.price === "number" ? product.price : null;
    const minimumStock = lowStockDefault;
    const stock = Math.max(0, Number(product.stock) || 0);
    const hargaModal = price !== null ? price : "";
    const hargaJual = price !== null ? price : "";
    const marginRp = price !== null ? 0 : "";
    const marginPersen = price !== null ? 0 : "";

    return [
      `PRD-${sku}`,
      sku,
      product.name || "",
      categoryLabels[product.category] || normalizeTitleCase(product.category || "Aksesoris"),
      Array.isArray(product.models) ? product.models.join(", ") : "",
      "",
      hargaModal,
      hargaJual,
      marginRp,
      marginPersen,
      stock,
      minimumStock,
      computeStatusStok(stock, minimumStock),
      "AKTIF",
      "",
      "",
      "",
      "",
      "",
      "",
      importDate,
      IMPORT_ACTOR
    ];
  });
}

function applyCommonSizing(sheet, widths) {
  Object.entries(widths).forEach(([rangeAddress, width]) => {
    sheet.getRange(rangeAddress).format.columnWidthPx = width;
  });
}

function seedDashboardHelper(sheet, masterRowCount) {
  sheet.getRange("H1:I1").merge();
  sheet.getRange("H1").values = [["DASHBOARD HELPER"]];
  sheet.getRange("H1:I1").format = mutedHeaderFormat;

  sheet.getRange("H2:I10").values = [
    ["Metric", "Value"],
    ["Total Produk Aktif", null],
    ["Total SKU", null],
    ["Total Stok Unit", null],
    ["Nilai Inventory Modal", null],
    ["Nilai Inventory Jual", null],
    ["READY", null],
    ["LOW", null],
    ["OUT OF STOCK", null]
  ];
  sheet.getRange("H2:I10").getRow(1).format = mutedHeaderFormat;

  const lastRow = masterRowCount + 1;
  sheet.getRange("I3:I9").formulas = [
    [`=COUNTIF(MASTER_PRODUCTS!$N$2:$N$${lastRow},"AKTIF")`],
    [`=COUNTA(MASTER_PRODUCTS!$B$2:$B$${lastRow})`],
    [`=SUM(FILTER(MASTER_PRODUCTS!$K$2:$K$${lastRow},MASTER_PRODUCTS!$B$2:$B$${lastRow}<>""))`],
    [`=SUMPRODUCT(MASTER_PRODUCTS!$K$2:$K$${lastRow},MASTER_PRODUCTS!$G$2:$G$${lastRow})`],
    [`=SUMPRODUCT(MASTER_PRODUCTS!$K$2:$K$${lastRow},MASTER_PRODUCTS!$H$2:$H$${lastRow})`],
    [`=COUNTIF(MASTER_PRODUCTS!$M$2:$M$${lastRow},"READY")`],
    [`=COUNTIF(MASTER_PRODUCTS!$M$2:$M$${lastRow},"LOW")`]
  ];
  sheet.getRange("I10").formulas = [[`=COUNTIF(MASTER_PRODUCTS!$M$2:$M$${lastRow},"OUT OF STOCK")`]];
  sheet.getRange("I3:I10").format.numberFormat = "#,##0";
  sheet.getRange("I6:I7").format.numberFormat = '"Rp" #,##0';

  try {
    const chart = sheet.charts.add("doughnut", sheet.getRange("H8:I10"));
    chart.title = "Stock Status Snapshot";
    chart.hasLegend = true;
    chart.setPosition("K2", "Q18");
  } catch (error) {
    console.warn("Chart dashboard tidak berhasil dibuat:", error.message);
  }
}

function seedReportPlaceholder(sheet, titleText) {
  sheet.getRange("P1:Q1").merge();
  sheet.getRange("P1").values = [[titleText]];
  sheet.getRange("P1:Q1").format = mutedHeaderFormat;
  sheet.getRange("P2:Q5").values = [
    ["Status", "Belum digenerate"],
    ["Action", "Jalankan Apps Script reporting"],
    ["Menu", "TVJ Inventory"],
    ["Note", "Area ini akan diisi script report otomatis"]
  ];
  sheet.getRange("P2:Q5").getRow(1).format = mutedHeaderFormat;
}

const masterSheet = setSheetHeaders(SHEETS.MASTER_PRODUCTS);
const masterRows = buildMasterProductRows(catalogPayload.products || []);

if (masterRows.length) {
  masterSheet.getRange(`A2:V${masterRows.length + 1}`).values = masterRows;
  masterSheet.getRange(`G2:J${masterRows.length + 1}`).format.numberFormat = '"Rp" #,##0';
  masterSheet.getRange(`K2:L${masterRows.length + 1}`).format.numberFormat = "#,##0";
  masterSheet.getRange(`J2:J${masterRows.length + 1}`).format.numberFormat = "0.00%";
  masterSheet.getRange(`U2:U${masterRows.length + 1}`).format.numberFormat = "yyyy-mm-dd hh:mm";
}

applyCommonSizing(masterSheet, {
  "A:A": 130,
  "B:B": 110,
  "C:C": 360,
  "D:D": 110,
  "E:E": 170,
  "F:F": 180,
  "G:J": 110,
  "K:M": 95,
  "N:N": 95,
  "O:O": 140,
  "P:V": 110
});

const stockInSheet = setSheetHeaders(SHEETS.STOCK_IN);
applyCommonSizing(stockInSheet, {
  "A:A": 140,
  "B:B": 120,
  "C:C": 110,
  "D:D": 320,
  "E:G": 110,
  "H:H": 180,
  "I:I": 220,
  "J:J": 120
});

const stockOutSheet = setSheetHeaders(SHEETS.STOCK_OUT);
applyCommonSizing(stockOutSheet, {
  "A:A": 140,
  "B:B": 120,
  "C:C": 110,
  "D:D": 320,
  "E:F": 120,
  "G:I": 110,
  "J:J": 220,
  "K:K": 120
});

const ordersSheet = setSheetHeaders(SHEETS.ORDERS_WEBSITE);
applyCommonSizing(ordersSheet, {
  "A:A": 145,
  "B:B": 125,
  "C:C": 180,
  "D:D": 150,
  "E:E": 260,
  "F:F": 320,
  "G:G": 180,
  "H:K": 110,
  "L:N": 110,
  "O:O": 220,
  "P:P": 140
});

const inventoryLogSheet = setSheetHeaders(SHEETS.INVENTORY_LOG);
applyCommonSizing(inventoryLogSheet, {
  "A:A": 145,
  "B:B": 130,
  "C:C": 110,
  "D:D": 320,
  "E:E": 110,
  "F:H": 100,
  "I:I": 140,
  "J:J": 260,
  "K:K": 120
});

const settingsSheet = setSheetHeaders(SHEETS.SETTINGS);
settingsSheet.getRange(`A2:C${settingsRows.length + 1}`).values = settingsRows;
settingsSheet.getRange("B:B").format.numberFormat = "@";
applyCommonSizing(settingsSheet, {
  "A:A": 220,
  "B:B": 420,
  "C:C": 360
});

const dashboardSheet = setSheetHeaders(SHEETS.DASHBOARD);
applyCommonSizing(dashboardSheet, {
  "A:A": 160,
  "B:B": 240,
  "C:C": 120,
  "D:D": 110,
  "E:E": 150,
  "F:F": 320,
  "H:I": 150
});
seedDashboardHelper(dashboardSheet, masterRows.length);

const weeklySheet = setSheetHeaders(SHEETS.WEEKLY_REPORT);
applyCommonSizing(weeklySheet, {
  "A:A": 110,
  "B:C": 120,
  "D:N": 110,
  "P:Q": 180
});
seedReportPlaceholder(weeklySheet, "WEEKLY REPORT SETUP");

const monthlySheet = setSheetHeaders(SHEETS.MONTHLY_REPORT);
applyCommonSizing(monthlySheet, {
  "A:A": 110,
  "B:C": 120,
  "D:N": 110,
  "P:Q": 180
});
seedReportPlaceholder(monthlySheet, "MONTHLY REPORT SETUP");

const apiLogSheet = setSheetHeaders(SHEETS.API_LOG);
applyCommonSizing(apiLogSheet, {
  "A:A": 130,
  "B:B": 90,
  "C:C": 220,
  "D:D": 320,
  "E:E": 90,
  "F:F": 320
});

await fs.mkdir(outputDir, { recursive: true });
const exportedFile = await SpreadsheetFile.exportXlsx(workbook);
await exportedFile.save(workbookPath);

const previewDir = path.join(outputDir, "previews");
await fs.mkdir(previewDir, { recursive: true });

for (const sheetName of Object.values(SHEETS)) {
  try {
    const renderBlob = await workbook.render({
      sheetName,
      autoCrop: "all",
      scale: 1,
      format: "png"
    });
    const renderBytes = new Uint8Array(await renderBlob.arrayBuffer());
    await fs.writeFile(path.join(previewDir, `${sheetName}.png`), renderBytes);
  } catch (error) {
    console.warn(`Render preview gagal untuk ${sheetName}: ${error.message}`);
  }
}

const inspectDashboard = await workbook.inspect({
  kind: "table",
  range: "DASHBOARD!A1:I12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 9
});

const inspectSettings = await workbook.inspect({
  kind: "table",
  range: "SETTINGS!A1:C12",
  include: "values",
  tableMaxRows: 12,
  tableMaxCols: 3
});

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "tvj google sheet setup formula scan"
});

console.log(inspectDashboard.ndjson);
console.log(inspectSettings.ndjson);
console.log(formulaErrors.ndjson);

const fs = require("node:fs")
const path = require("node:path")
const { chromium, devices } = require("playwright")

const ROOT = path.resolve(__dirname, "..")
const BASE_URL = process.env.TVJ_BASE_URL || "http://localhost:4173"
const OUTPUT_DIR = path.join(ROOT, "outputs", "previews")
const TEMP_VIDEO_DIR = path.join(OUTPUT_DIR, "_tmp")
const TOKEN_FILE = path.join(ROOT, "outputs", "_system_monitor_req.json")
const ADMIN_API_TOKEN =
  String(process.env.TVJ_ADMIN_API_TOKEN || "").trim() || readToken_(TOKEN_FILE)

const ADMIN_AUTH_KEY = "toko-vespa-jogja-admin-auth-v1"
const ADMIN_SESSION_KEY = "toko-vespa-jogja-admin-session-v1"
const ADMIN_TOKEN_KEY = "toko-vespa-jogja-admin-api-token-v1"

const DESKTOP_VIEWPORT = { width: 1440, height: 960 }
const MOBILE_DEVICE = devices["iPhone 13"]
const MOBILE_VIDEO_SIZE = { width: 390, height: 844 }

function readToken_(filePath) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"))
    return String(payload.admin_token || "").trim()
  } catch (error) {
    return ""
  }
}

function ensureDir_(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function slowScroll(page, totalDistance, step = 220, delay = 220) {
  let travelled = 0
  while (travelled < totalDistance) {
    await page.mouse.wheel(0, step)
    travelled += step
    await sleep(delay)
  }
}

async function smoothScrollTo(page, selector) {
  const handle = page.locator(selector).first()
  await handle.scrollIntoViewIfNeeded()
  await sleep(500)
}

function buildAdminSessionScript(token) {
  return ({ tokenValue }) => {
    const username = "previewadmin"
    localStorage.setItem(
      "toko-vespa-jogja-admin-auth-v1",
      JSON.stringify({
        username,
        passwordHash: "preview-only",
        updatedAt: new Date().toISOString().slice(0, 10)
      })
    )
    sessionStorage.setItem(
      "toko-vespa-jogja-admin-session-v1",
      JSON.stringify({
        username,
        loginAt: Date.now()
      })
    )
    if (tokenValue) {
      localStorage.setItem("toko-vespa-jogja-admin-api-token-v1", tokenValue)
      sessionStorage.setItem("toko-vespa-jogja-admin-api-token-v1", tokenValue)
    }
  }
}

async function fetchCatalogProducts_() {
  const response = await fetch(`${BASE_URL}/api/catalog?fresh=1`)
  const payload = await response.json()
  if (!payload.success) {
    throw new Error(payload.message || "Gagal membaca katalog live.")
  }
  return Array.isArray(payload.data?.products) ? payload.data.products : []
}

async function createContext(browser, { mobile = false, videoSize, withAdmin = false }) {
  const context = await browser.newContext(
    mobile
      ? {
          ...MOBILE_DEVICE,
          recordVideo: {
            dir: TEMP_VIDEO_DIR,
            size: videoSize || MOBILE_VIDEO_SIZE
          }
        }
      : {
          viewport: DESKTOP_VIEWPORT,
          recordVideo: {
            dir: TEMP_VIDEO_DIR,
            size: videoSize || { width: 1280, height: 854 }
          }
        }
  )

  if (withAdmin) {
    await context.addInitScript(buildAdminSessionScript(ADMIN_API_TOKEN), {
      tokenValue: ADMIN_API_TOKEN
    })
  }

  return context
}

async function finalizeVideo(page, context, outputName) {
  const video = page.video()
  await context.close()
  const sourcePath = await video.path()
  const targetPath = path.join(OUTPUT_DIR, outputName)
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath)
  }
  fs.renameSync(sourcePath, targetPath)
  return targetPath
}

async function recordWebsite(browser, { mobile = false, outputName }) {
  const products = await fetchCatalogProducts_()
  const searchProduct = products.find((item) => Number(item.stok_aktif || 0) > 0) || products[0]
  const searchTerm =
    String(searchProduct?.nama_produk || "vespa")
      .trim()
      .split(/\s+/)[0]
      .toLowerCase() || "vespa"

  const context = await createContext(browser, { mobile })

  await context.route("**/api/order", async (route) => {
    await sleep(900)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Mock preview order success",
        data: {
          order_id: `ORD-PREVIEW-${Date.now()}`,
          qty_total: 1,
          subtotal: Number(searchProduct?.harga_jual || 25000),
          grand_total: Number(searchProduct?.harga_jual || 25000),
          reconciled: false
        }
      })
    })
  })

  await context.route("https://api.whatsapp.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><title>WhatsApp Preview</title><style>body{font-family:Manrope,Arial,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f7f2e7;color:#1f2a1f}main{max-width:520px;padding:32px;border-radius:24px;background:white;box-shadow:0 20px 50px rgba(34,45,31,.08)}h1{margin:0 0 12px;font-size:28px}p{margin:0;color:#546054;line-height:1.6}</style></head><body><main><h1>Preview WhatsApp Redirect</h1><p>Tombol lanjut WhatsApp berhasil memicu redirect ke WhatsApp. Halaman ini hanya preview aman untuk dokumentasi.</p></main></body></html>`
    })
  })

  const page = await context.newPage()
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  await sleep(1200)

  await smoothScrollTo(page, "#catalog-search")
  await page.fill("#catalog-search", searchTerm)
  await sleep(300)
  await page.click("#apply-search")
  await sleep(1200)

  if (!mobile) {
    await slowScroll(page, 900, 180, 240)
    await sleep(400)
    await smoothScrollTo(page, "#kontak")
    await slowScroll(page, 900, 180, 220)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }))
    await sleep(1200)
    await smoothScrollTo(page, "#katalog")
  } else {
    const quickButtons = page.locator(".quick-search")
    if ((await quickButtons.count()) > 0) {
      await quickButtons.nth(0).click()
      await sleep(900)
    }
  }

  const productButton = page.locator(".product-card-button:not([disabled])").first()
  await productButton.scrollIntoViewIfNeeded()
  await sleep(400)
  await productButton.click()
  await sleep(1400)

  await page.click("#cart-link")
  await sleep(700)
  await page.fill("#checkout-name", "Preview Customer")
  await page.fill("#checkout-whatsapp", "6281234567890")
  await page.fill("#checkout-address", "Alamat preview order untuk dokumentasi")
  await sleep(500)
  await page.click("#checkout-button")
  await sleep(900)
  await page.waitForSelector("#order-success-modal:not([hidden])", { timeout: 12000 })
  await sleep(1200)
  await page.click("#order-success-whatsapp-button")
  await page.waitForLoadState("domcontentloaded")
  await sleep(1800)

  return finalizeVideo(page, context, outputName)
}

async function recordAdmin(browser, { mobile = false, outputName }) {
  const context = await createContext(browser, { mobile, withAdmin: true })
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/admin.html`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("#admin-dashboard:not([hidden])", { timeout: 20000 })
  await sleep(1400)

  await page.click("#admin-notification-button")
  await sleep(1400)
  await page.click("#admin-notification-button")
  await sleep(500)

  await smoothScrollTo(page, "#marketplace-form")
  await page.fill("#marketplace-product-search", "aki")
  await sleep(900)
  await page.selectOption("#marketplace-channel", "SHOPEE")
  await sleep(600)

  await smoothScrollTo(page, "#orders-search")
  await sleep(1200)
  await slowScroll(page, mobile ? 900 : 1200, mobile ? 160 : 220, 220)

  await smoothScrollTo(page, "#manager-search")
  await page.fill("#manager-search", "aki")
  await sleep(900)
  const editButtons = mobile
    ? page.locator('#manager-mobile-list [data-action="edit"]')
    : page.locator('#manager-table-body [data-action="edit"]')
  if ((await editButtons.count()) > 0) {
    await editButtons.first().click()
    await sleep(1300)
    await smoothScrollTo(page, "#editor-card")
    await sleep(1200)
    await page.click("#cancel-edit-button")
    await sleep(700)
  }

  await slowScroll(page, mobile ? 700 : 1000, mobile ? 160 : 220, 220)
  await sleep(1200)

  return finalizeVideo(page, context, outputName)
}

async function recordReports(browser, { mobile = false, outputName }) {
  const context = await createContext(browser, { mobile, withAdmin: true })
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/reports.html`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("#reports-dashboard:not([hidden])", { timeout: 20000 })
  await sleep(1400)

  await page.click("#refresh-reports-button")
  await sleep(1200)
  await slowScroll(page, mobile ? 2200 : 2600, mobile ? 180 : 240, 260)
  await sleep(1000)

  return finalizeVideo(page, context, outputName)
}

async function recordSystemMonitor(browser, { mobile = false, outputName }) {
  const context = await createContext(browser, { mobile, withAdmin: true })
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/system-monitor.html`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("#monitor-dashboard:not([hidden])", { timeout: 20000 })
  await sleep(1400)

  await page.click("#refresh-monitor-button")
  await sleep(1500)
  await slowScroll(page, mobile ? 1800 : 2200, mobile ? 180 : 240, 240)
  await sleep(1000)

  return finalizeVideo(page, context, outputName)
}

async function writeSummaryFile(results) {
  const summaryPath = path.join(OUTPUT_DIR, "preview-summary-2026-04-23.md")
  const lines = [
    "# Preview Summary",
    "",
    `Base URL: ${BASE_URL}`,
    "",
    "## File hasil",
    ""
  ]

  for (const item of results) {
    lines.push(`- ${item.label}: ${item.path}`)
  }

  lines.push("")
  lines.push("## Flow yang direkam")
  lines.push("")
  lines.push("- Website publik desktop: homepage, search, katalog, add to cart, checkout, loading, popup sukses, redirect WhatsApp preview.")
  lines.push("- Website publik mobile: pencarian cepat, add to cart, checkout singkat, popup sukses, redirect WhatsApp preview.")
  lines.push("- Admin desktop: dashboard, bell notif, marketplace section, order list, daftar produk, edit form tanpa simpan.")
  lines.push("- Admin mobile: preview usability utama dengan scroll ringkas section penting.")
  lines.push("- Laporan desktop/mobile: KPI, refresh, weekly/monthly blocks, ranking, low stock.")
  lines.push("- Cek sistem desktop/mobile: status cards, refresh, alert, ringkasan error, issue table.")
  lines.push("")
  lines.push("## Catatan keamanan")
  lines.push("")
  lines.push("- Submit order di website publik dimock sukses untuk preview, jadi tidak membuat order live.")
  lines.push("- Redirect WhatsApp diarahkan ke halaman preview aman, bukan membuka WA real.")
  lines.push("- Admin/laporan/system monitor hanya menampilkan data live dan interaksi non-mutating.")
  lines.push("")
  lines.push("## Cara generate ulang")
  lines.push("")
  lines.push("```powershell")
  lines.push("$env:TVJ_ADMIN_API_TOKEN=(Get-Content outputs\\_system_monitor_req.json | ConvertFrom-Json).admin_token")
  lines.push("node tests\\generate-preview-videos.cjs")
  lines.push("```")
  fs.writeFileSync(summaryPath, lines.join("\r\n"), "utf8")
  return summaryPath
}

async function main() {
  ensureDir_(OUTPUT_DIR)
  ensureDir_(TEMP_VIDEO_DIR)

  if (!ADMIN_API_TOKEN) {
    throw new Error("Token admin tidak ditemukan. Isi outputs/_system_monitor_req.json atau env TVJ_ADMIN_API_TOKEN.")
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  })

  const results = []

  try {
    results.push({
      label: "WEBSITE desktop",
      path: await recordWebsite(browser, {
        mobile: false,
        outputName: "website-desktop-preview-2026-04-23.webm"
      })
    })
    results.push({
      label: "WEBSITE mobile",
      path: await recordWebsite(browser, {
        mobile: true,
        outputName: "website-mobile-preview-2026-04-23.webm"
      })
    })
    results.push({
      label: "ADMIN desktop",
      path: await recordAdmin(browser, {
        mobile: false,
        outputName: "admin-desktop-preview-2026-04-23.webm"
      })
    })
    results.push({
      label: "ADMIN mobile",
      path: await recordAdmin(browser, {
        mobile: true,
        outputName: "admin-mobile-preview-2026-04-23.webm"
      })
    })
    results.push({
      label: "LAPORAN desktop",
      path: await recordReports(browser, {
        mobile: false,
        outputName: "reports-desktop-preview-2026-04-23.webm"
      })
    })
    results.push({
      label: "LAPORAN mobile",
      path: await recordReports(browser, {
        mobile: true,
        outputName: "reports-mobile-preview-2026-04-23.webm"
      })
    })
    results.push({
      label: "CEK SISTEM desktop",
      path: await recordSystemMonitor(browser, {
        mobile: false,
        outputName: "system-monitor-desktop-preview-2026-04-23.webm"
      })
    })
    results.push({
      label: "CEK SISTEM mobile",
      path: await recordSystemMonitor(browser, {
        mobile: true,
        outputName: "system-monitor-mobile-preview-2026-04-23.webm"
      })
    })
  } finally {
    await browser.close()
  }

  const summaryPath = await writeSummaryFile(results)
  console.log(
    JSON.stringify(
      {
        outputDir: OUTPUT_DIR,
        summaryPath,
        files: results
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

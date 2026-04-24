export const STORE_CONFIG = {
  name: "Toko Vespa Jogja",
  whatsappPhone: "6288802500388"
}

export const STORAGE_KEY = "toko-vespa-jogja-catalog-v2"
export const ADMIN_AUTH_KEY = "toko-vespa-jogja-admin-auth-v1"
export const ADMIN_SESSION_KEY = "toko-vespa-jogja-admin-session-v1"

export const categoryLabels = {
  mesin: "Mesin",
  "kaki-kaki": "Kaki-Kaki",
  kelistrikan: "Kelistrikan",
  body: "Body",
  servis: "Servis",
  aksesoris: "Aksesoris"
}

const productVisuals = {
  mesin: {
    start: "#c96b31",
    end: "#76411f",
    stroke: "#fff7ed",
    glow: "#f7d5aa",
    badge: "MESIN",
    art: `
      <circle cx="320" cy="304" r="118" />
      <circle cx="320" cy="304" r="50" />
      <path d="M320 138v54M320 416v54M154 304h54M432 304h54M205 189l38 38M397 381l38 38M205 419l38-38M397 227l38-38" />
    `
  },
  "kaki-kaki": {
    start: "#31565b",
    end: "#1d3237",
    stroke: "#f9f3e7",
    glow: "#9dd0cd",
    badge: "KAKI-KAKI",
    art: `
      <circle cx="320" cy="330" r="126" />
      <circle cx="320" cy="330" r="38" />
      <path d="M320 204v252M194 330h252M230 240l180 180M230 420l180-180M152 198h170l72 88" />
    `
  },
  kelistrikan: {
    start: "#6042a8",
    end: "#2d2153",
    stroke: "#fff7ee",
    glow: "#b89ef9",
    badge: "KELISTRIKAN",
    art: `
      <path d="M350 138 236 306h72l-20 168 116-192h-74l20-144Z" />
      <path d="M168 204h76M396 442h76M174 442h102M432 204h40" />
    `
  },
  body: {
    start: "#d1b58e",
    end: "#836344",
    stroke: "#fff9f1",
    glow: "#f5e2c6",
    badge: "BODY",
    art: `
      <rect x="178" y="198" width="284" height="188" rx="86" />
      <path d="M210 390h220M202 248h236M290 170h98M246 430h150" />
    `
  },
  servis: {
    start: "#67814b",
    end: "#314223",
    stroke: "#fdf7eb",
    glow: "#bfd89e",
    badge: "SERVIS",
    art: `
      <path d="M250 192c-22 30-19 74 8 100l68 68c26 26 70 30 100 8l-74-74 40-72c-30-24-74-22-102 4l-40 38Z" />
      <circle cx="246" cy="404" r="58" />
      <path d="M218 376l56 56" />
    `
  },
  aksesoris: {
    start: "#ad4f2a",
    end: "#5d2914",
    stroke: "#fff8f0",
    glow: "#f5c39d",
    badge: "AKSESORIS",
    art: `
      <rect x="184" y="224" width="272" height="166" rx="38" />
      <path d="M214 198h212M230 420h180M244 252v110M396 252v110M278 286h84M278 332h84" />
    `
  }
}

let basePayloadPromise

export const getTodayDate = () => new Date().toISOString().slice(0, 10)

export const normalizeText = (text = "") =>
  String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

export const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const formatNumberId = (value) => Math.round(value).toLocaleString("id-ID")

const hasLegacySheetCurrency = (value = "") =>
  /^rp[\s\u00a0]*[\d.]+,\d{2}$/i.test(String(value).trim())

export const parseRupiahNumber = (value = "") => {
  const digits = String(value).replace(/[^\d]/g, "")
  return digits ? Number(digits) : 0
}

export const isRupiahLikeValue = (value = "") =>
  /^[\sRp\d.,]+$/i.test(String(value).trim()) && /\d/.test(String(value))

export const formatRupiah = (value) => {
  const amount = Math.max(0, Number(value) || 0)
  return `Rp${formatNumberId(amount)}`
}

export const formatRupiahInput = (value = "") => {
  const amount = parseRupiahNumber(value)
  return amount > 0 ? formatRupiah(amount) : ""
}

export const formatItemCount = (value) => value.toLocaleString("id-ID")

export const formatCartCount = (value) =>
  `${value.toLocaleString("id-ID")} item`

export const formatDateId = (rawDate) => {
  if (!rawDate) {
    return "terbaru"
  }

  const value = new Date(`${rawDate}T00:00:00`)

  if (Number.isNaN(value.getTime())) {
    return rawDate
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(value)
}

export const getCategoryLabel = (categoryId) =>
  categoryLabels[categoryId] || "Aksesoris"

const buildSearchIndex = (product) =>
  normalizeText(
    [
      product.name,
      product.sku,
      product.category,
      getCategoryLabel(product.category),
      Array.isArray(product.models) ? product.models.join(" ") : "",
      product.searchIndex || ""
    ].join(" ")
  )

export const hydrateProduct = (product, index = 0) => {
  const stockField =
    product.stock !== undefined
      ? Number(product.stock)
      : Number(product.stockIn || 0) - Number(product.stockOut || 0)
  const stock = Math.max(0, Number.isFinite(stockField) ? stockField : 0)
  const rawPrice = Math.max(0, Number(product.price) || 0)
  const costPrice = Math.max(
    0,
    Number(product.costPrice ?? product.harga_modal ?? product.modalPrice ?? 0) || 0
  )
  const minimumStock = Math.max(
    0,
    Number(product.minimumStock ?? product.minimum_stok ?? product.minimum ?? 1) || 0
  )
  const normalizedLegacyPrice =
    rawPrice > 0 && hasLegacySheetCurrency(product.priceDisplay)
      ? Math.round(rawPrice * 1000)
      : Math.round(rawPrice)
  const price = Math.max(0, normalizedLegacyPrice)
  const category = categoryLabels[product.category] ? product.category : "aksesoris"
  const models = Array.isArray(product.models)
    ? product.models.map((item) => String(item).trim()).filter(Boolean)
    : []
  const availability =
    product.status === "out" || stock === 0 ? "out" : "ready"
  const stockStatus =
    product.stockStatus ||
    product.status_stok ||
    (stock <= 0 ? "OUT OF STOCK" : stock <= minimumStock ? "LOW" : "READY")
  const baseId = product.id || product.sku || `item-${index + 1}`
  const rawPriceDisplay = String(product.priceDisplay || "").trim()
  const normalizedPriceDisplay =
    rawPriceDisplay && !normalizeText(rawPriceDisplay).includes("hubungi")
      ? isRupiahLikeValue(rawPriceDisplay)
        ? formatRupiah(price)
        : rawPriceDisplay
      : price > 0
        ? formatRupiah(price)
        : "Hubungi admin"

  return {
    id: String(baseId),
    sourceNo: String(product.sourceNo || index + 1),
    sku: String(product.sku || baseId),
    name: String(product.name || `Produk ${index + 1}`),
    category,
    categoryLabel: getCategoryLabel(category),
    models,
    stockIn: Number(product.stockIn ?? stock) || stock,
    stockOut: Number(product.stockOut ?? 0) || 0,
    stock,
    minimumStock,
    stockStatus: String(stockStatus || "").toUpperCase(),
    availability,
    availabilityLabel: availability === "ready" ? "Ready" : "Stock Habis",
    price,
    costPrice,
    priceDisplay: normalizedPriceDisplay,
    weightKg: Math.max(
      0,
      Number(product.weight ?? product.weightKg ?? product.berat ?? 0) || 0
    ),
    imageUrl: String(product.imageUrl || "").trim(),
    searchIndex: buildSearchIndex({
      ...product,
      category,
      models
    })
  }
}

export const serializeProduct = (product, index = 0) => ({
  id: product.id,
  sourceNo: product.sourceNo || String(index + 1),
  sku: product.sku,
  name: product.name,
  category: product.category,
  models: product.models,
  stockIn: product.stock,
  stockOut: 0,
  stock: product.stock,
  minimumStock: product.minimumStock || 1,
  stockStatus: product.stockStatus || (product.stock > 0 ? "READY" : "OUT OF STOCK"),
  status: product.stock > 0 ? "ready" : "out",
  price: product.price,
  costPrice: product.costPrice || 0,
  priceDisplay: product.priceDisplay,
  weight: product.weightKg || 0,
  imageUrl: product.imageUrl || "",
  searchIndex: buildSearchIndex(product)
})

export const makeProductLookup = (products) =>
  new Map(products.map((product) => [product.id, product]))

export const formatProductPrice = (product) => {
  if (product.priceDisplay && product.priceDisplay.trim()) {
    return product.priceDisplay.trim()
  }

  if (product.price > 0) {
    return formatRupiah(product.price)
  }

  return "Hubungi admin"
}

export const formatCartLinePrice = (product, quantity) => {
  if (product.price > 0) {
    return formatRupiah(product.price * quantity)
  }

  return formatProductPrice(product)
}

const escapeSvgText = (value) => escapeHtml(value)

const buildProductImage = (product) => {
  const visual = productVisuals[product.category] || productVisuals.body
  const modelText = escapeSvgText((product.models[0] || "VESPA").slice(0, 14))
  const nameText = escapeSvgText(product.name.slice(0, 40))
  const skuText = escapeSvgText(product.sku)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img" aria-label="${escapeSvgText(product.name)}">
      <defs>
        <linearGradient id="surface" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${visual.start}" />
          <stop offset="100%" stop-color="${visual.end}" />
        </linearGradient>
      </defs>
      <rect width="640" height="640" rx="42" fill="url(#surface)" />
      <circle cx="516" cy="140" r="128" fill="${visual.glow}" fill-opacity="0.24" />
      <circle cx="108" cy="548" r="166" fill="#ffffff" fill-opacity="0.1" />
      <rect x="30" y="30" width="580" height="580" rx="34" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.18" />
      <g transform="translate(38 38)">
        <rect x="0" y="0" width="210" height="52" rx="26" fill="#ffffff" fill-opacity="0.16" />
        <text x="105" y="33" text-anchor="middle" font-size="20" font-family="Arial, sans-serif" font-weight="700" fill="#fff8ef">${visual.badge}</text>
      </g>
      <g fill="none" stroke="${visual.stroke}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
        ${visual.art}
      </g>
      <text x="48" y="516" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#fff7ed">${nameText}</text>
      <text x="48" y="556" font-size="24" font-family="Arial, sans-serif" font-weight="700" fill="#fff7ed" letter-spacing="3">${modelText}</text>
      <text x="48" y="590" font-size="18" font-family="Arial, sans-serif" font-weight="600" fill="#fff7ed" fill-opacity="0.84">${skuText}</text>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const getProductImageSrc = (product) =>
  product.imageUrl && product.imageUrl.trim()
    ? product.imageUrl.trim()
    : buildProductImage(product)

export const getInventorySummary = (products = []) =>
  products.reduce(
    (summary, product) => {
      summary.totalProducts += 1
      summary.totalStock += product.stock

      if (product.availability === "ready") {
        summary.readyProducts += 1
      } else {
        summary.outProducts += 1
      }

      return summary
    },
    { totalProducts: 0, readyProducts: 0, outProducts: 0, totalStock: 0 }
  )

export const getSearchScore = (product, rawQuery) => {
  const query = normalizeText(rawQuery)

  if (!query) {
    return (product.availability === "ready" ? 1000 : 0) + Math.min(product.stock, 99)
  }

  const normalizedName = normalizeText(product.name)
  const normalizedSku = normalizeText(product.sku)
  const normalizedModels = normalizeText(product.models.join(" "))
  const normalizedCategory = normalizeText(product.categoryLabel)
  let score = 0

  if (normalizedSku === query) {
    score += 140
  }

  if (normalizedSku.includes(query)) {
    score += 110
  }

  if (normalizedName.startsWith(query)) {
    score += 90
  } else if (normalizedName.includes(query)) {
    score += 75
  }

  if (normalizedModels.includes(query)) {
    score += 48
  }

  if (normalizedCategory.includes(query)) {
    score += 28
  }

  if (product.searchIndex.includes(query)) {
    score += 20
  }

  if (product.availability === "ready") {
    score += 10
  }

  score += Math.min(product.stock, 20)

  return score
}

export const getFeaturedProducts = (products = [], limit = 2) => {
  const readyProducts = [...products]
    .filter((product) => product.availability === "ready")
    .sort((left, right) => {
      if (right.stock !== left.stock) {
        return right.stock - left.stock
      }

      return left.name.localeCompare(right.name, "id")
    })

  const featured = []
  const usedCategories = new Set()

  readyProducts.forEach((product) => {
    if (featured.length >= limit) {
      return
    }

    if (!usedCategories.has(product.category)) {
      featured.push(product)
      usedCategories.add(product.category)
    }
  })

  readyProducts.forEach((product) => {
    if (featured.length >= limit) {
      return
    }

    if (!featured.some((item) => item.id === product.id)) {
      featured.push(product)
    }
  })

  return featured.slice(0, limit)
}

export const buildCatalogPayload = ({
  products = [],
  updatedAt = getTodayDate(),
  source = "sheet"
}) => ({
  source,
  updatedAt,
  count: products.length,
  products: products.map((product, index) => serializeProduct(product, index))
})

export const readStoredCatalog = () => {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY)
    return rawValue ? JSON.parse(rawValue) : null
  } catch (error) {
    console.error(error)
    return null
  }
}

export const saveStoredCatalog = ({
  products = [],
  updatedAt = getTodayDate(),
  source = "local"
}) => {
  const payload = buildCatalogPayload({ products, updatedAt, source })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  return payload
}

export const clearStoredCatalog = () => {
  localStorage.removeItem(STORAGE_KEY)
}

export const fetchBaseCatalog = async () => {
  if (!basePayloadPromise) {
    basePayloadPromise = fetch(`catalog-data.json?v=${Date.now()}`, {
      cache: "no-store"
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Gagal memuat katalog: ${response.status}`)
      }

      return response.json()
    })
  }

  return basePayloadPromise
}

export const loadCatalog = async () => {
  const basePayload = await fetchBaseCatalog()
  const baseProducts = Array.isArray(basePayload.products)
    ? basePayload.products.map(hydrateProduct)
    : []
  const storedPayload = readStoredCatalog()

  if (storedPayload && Array.isArray(storedPayload.products)) {
    return {
      products: storedPayload.products.map(hydrateProduct),
      updatedAt: storedPayload.updatedAt || basePayload.updatedAt || getTodayDate(),
      dataSource: "local",
      baseProducts,
      baseUpdatedAt: basePayload.updatedAt || getTodayDate()
    }
  }

  return {
    products: baseProducts,
    updatedAt: basePayload.updatedAt || getTodayDate(),
    dataSource: "sheet",
    baseProducts,
    baseUpdatedAt: basePayload.updatedAt || getTodayDate()
  }
}

export const buildCheckoutLink = (entries = []) => {
  const totalItems = entries.reduce((total, entry) => total + entry.quantity, 0)
  const totalPrice = entries.reduce(
    (total, entry) => total + entry.product.price * entry.quantity,
    0
  )
  const lines = entries.map(({ product, quantity }) => {
    const unitPrice = formatProductPrice(product)
    const subTotal = formatCartLinePrice(product, quantity)
    return `- ${product.name} x${quantity} (${product.sku}) | ${unitPrice} | ${subTotal}`
  })
  const notes = []

  if (entries.some(({ product }) => product.price <= 0)) {
    notes.push("Catatan: beberapa item perlu konfirmasi harga admin.")
  }

  const message = [
    `Halo ${STORE_CONFIG.name}, saya mau order produk berikut:`,
    "",
    ...lines,
    "",
    `Total item: ${totalItems}`,
    `Estimasi total: ${formatRupiah(totalPrice)}`,
    ...notes
  ].join("\n")

  return `https://api.whatsapp.com/send/?phone=${STORE_CONFIG.whatsappPhone}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`
}

export const syncCartWithInventory = (cartMap, productLookup) => {
  Array.from(cartMap.entries()).forEach(([productId, quantity]) => {
    const product = productLookup.get(productId)

    if (!product || product.stock <= 0) {
      cartMap.delete(productId)
      return
    }

    if (quantity > product.stock) {
      cartMap.set(productId, product.stock)
    }
  })
}

export const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
      } else {
        reject(new Error("File tidak bisa dibaca sebagai data URL."))
      }
    }

    reader.onerror = () => {
      reject(new Error("File gagal dibaca."))
    }

    reader.readAsDataURL(file)
  })

export const hashText = async (value) => {
  const encoder = new TextEncoder()
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)))
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export const readAdminCredentials = () => {
  try {
    const rawValue = localStorage.getItem(ADMIN_AUTH_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) : null

    if (!parsed?.username || !parsed?.passwordHash) {
      return null
    }

    return parsed
  } catch (error) {
    console.error(error)
    return null
  }
}

export const saveAdminCredentials = ({ username, passwordHash }) => {
  const payload = {
    username,
    passwordHash,
    updatedAt: getTodayDate()
  }

  localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(payload))
  return payload
}

export const readAdminSession = () => {
  try {
    const rawValue = sessionStorage.getItem(ADMIN_SESSION_KEY)
    return rawValue ? JSON.parse(rawValue) : null
  } catch (error) {
    console.error(error)
    return null
  }
}

export const setAdminSession = (username) => {
  sessionStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({
      username,
      loginAt: Date.now()
    })
  )
}

export const clearAdminSession = () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY)
}

export const hasValidAdminSession = () => {
  const credentials = readAdminCredentials()
  const session = readAdminSession()
  return Boolean(credentials && session && session.username === credentials.username)
}

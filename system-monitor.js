import {
  escapeHtml,
  formatItemCount,
  hasValidAdminSession
} from "./catalog-store.js"
import {
  fetchSystemMonitor,
  hasAdminApiToken
} from "./live-api-client.js"

const monitorLock = document.querySelector("#monitor-lock")
const monitorDashboard = document.querySelector("#monitor-dashboard")
const refreshMonitorButton = document.querySelector("#refresh-monitor-button")
const monitorSyncLabel = document.querySelector("#monitor-sync-label")
const monitorTokenNote = document.querySelector("#monitor-token-note")
const monitorStatus = document.querySelector("#monitor-status")

const statusProxy = document.querySelector("#status-proxy")
const statusAppsScript = document.querySelector("#status-apps-script")
const statusBackup = document.querySelector("#status-backup")
const statusReporting = document.querySelector("#status-reporting")
const alertSummary = document.querySelector("#alert-summary")
const monitorAlertList = document.querySelector("#monitor-alert-list")
const logSummaryNote = document.querySelector("#log-summary-note")
const summaryRequests = document.querySelector("#summary-requests")
const summaryErrors = document.querySelector("#summary-errors")
const summaryTimeouts = document.querySelector("#summary-timeouts")
const summaryDuplicates = document.querySelector("#summary-duplicates")
const summaryCancelReview = document.querySelector("#summary-cancel-review")
const thresholdList = document.querySelector("#threshold-list")
const issueSummary = document.querySelector("#issue-summary")
const issueTableBody = document.querySelector("#issue-table-body")

const statusClassMap = {
  HEALTHY: "healthy",
  WARNING: "warning",
  ERROR: "error",
  UNKNOWN: "unknown"
}

const setStatus = (message) => {
  monitorStatus.textContent = message
}

const normalizeStatus = (status = "") => String(status || "UNKNOWN").trim().toUpperCase()

const getStatusClass = (status) => statusClassMap[normalizeStatus(status)] || "unknown"

const getSeverityClass = (severity) => getStatusClass(severity)

const humanizeMonitorError = (error) => {
  if (!error) {
    return "Data monitor belum bisa dimuat. Coba ulang beberapa detik lagi."
  }

  if (error.code === "NOT_FOUND") {
    return "Apps Script live belum memuat endpoint Cek Sistem. Update file apiSystem.gs dan api.gs di Apps Script, lalu deploy ulang Web App."
  }

  if (error.code === "UPSTREAM_TIMEOUT") {
    return "Apps Script sedang lambat. Coba refresh beberapa detik lagi."
  }

  if (error.code === "ADMIN_REQUEST_FAILED") {
    return error.message || "Request admin gagal diproses."
  }

  return error.message || "Data monitor belum bisa dimuat. Coba ulang beberapa detik lagi."
}

const formatDateTimeId = (rawValue) => {
  if (!rawValue) {
    return "Belum terbaca"
  }

  const normalized = String(rawValue).replace(" ", "T")
  const date = new Date(normalized)

  if (Number.isNaN(date.getTime())) {
    return String(rawValue)
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)
}

const renderStatusCard = (target, title, card = {}) => {
  const status = normalizeStatus(card.status)
  const statusClass = getStatusClass(status)
  const metaItems = []

  if (card.latency_ms !== undefined) {
    metaItems.push(`${formatItemCount(Number(card.latency_ms || 0))} ms`)
  }

  if (card.age_hours !== undefined) {
    metaItems.push(`${Number(card.age_hours || 0).toLocaleString("id-ID")} jam lalu`)
  }

  if (card.last_backup_time) {
    metaItems.push(`Backup ${formatDateTimeId(card.last_backup_time)}`)
  }

  if (card.last_refreshed) {
    metaItems.push(`Refresh ${formatDateTimeId(card.last_refreshed)}`)
  }

  target.className = `monitor-status-card ${statusClass}`
  target.innerHTML = `
    <span class="health-pill ${statusClass}">${escapeHtml(card.label || status || "Belum terbaca")}</span>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(card.detail || "Belum ada data yang bisa dibaca.")}</p>
    ${metaItems.length ? `<small class="monitor-meta">${escapeHtml(metaItems.join(" | "))}</small>` : ""}
  `
}

const renderAlerts = (alerts = []) => {
  alertSummary.textContent = alerts.length
    ? `${formatItemCount(alerts.length)} alert perlu dicek`
    : "Sistem terlihat aman"

  if (!alerts.length) {
    monitorAlertList.innerHTML = `
      <div class="monitor-empty">
        Belum ada alert penting. Sistem terlihat aman.
      </div>
    `
    return
  }

  monitorAlertList.innerHTML = alerts
    .map((alert) => {
      const severityClass = getSeverityClass(alert.severity)
      return `
        <article class="monitor-alert">
          <span class="severity-pill ${severityClass}">${escapeHtml(alert.severity || "INFO")}</span>
          <span>
            <strong>${escapeHtml(alert.title || "Alert sistem")}</strong>
            <p>${escapeHtml(alert.message || "Perlu dicek manual.")}</p>
          </span>
          <span class="monitor-alert-source">${escapeHtml(alert.source || "-")}</span>
        </article>
      `
    })
    .join("")
}

const renderSummary = (summary = {}) => {
  summaryRequests.textContent = formatItemCount(Number(summary.total_requests_today || 0))
  summaryErrors.textContent = formatItemCount(Number(summary.total_errors_today || 0))
  summaryTimeouts.textContent = formatItemCount(Number(summary.total_timeouts_today || 0))
  summaryDuplicates.textContent = formatItemCount(Number(summary.duplicate_blocked_today || 0))
  summaryCancelReview.textContent = formatItemCount(Number(summary.cancel_review_count || 0))
  logSummaryNote.textContent = "Dihitung dari API_LOG terbaru hari ini."
}

const renderThresholds = (thresholds = {}) => {
  const items = [
    {
      label: "Backup warning",
      value: `${thresholds.backup_warning_hours || 24} jam`
    },
    {
      label: "Backup merah",
      value: `${thresholds.backup_error_hours || 48} jam`
    },
    {
      label: "Order NEW terlalu lama",
      value: `${thresholds.new_order_warning_hours || 6} jam`
    },
    {
      label: "Log dibaca",
      value: `${thresholds.recent_log_limit || 300} baris terakhir`
    }
  ]

  thresholdList.innerHTML = items
    .map(
      (item) => `
        <article class="threshold-item">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </article>
      `
    )
    .join("")
}

const renderIssues = (issues = []) => {
  issueSummary.textContent = issues.length
    ? `${formatItemCount(issues.length)} masalah terakhir`
    : "Belum ada masalah tercatat"

  if (!issues.length) {
    issueTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <span class="table-muted">Belum ada masalah penting di log terbaru.</span>
        </td>
      </tr>
    `
    return
  }

  issueTableBody.innerHTML = issues
    .map((issue) => {
      const severityClass = getSeverityClass(issue.severity)
      return `
        <tr>
          <td>${escapeHtml(formatDateTimeId(issue.timestamp))}</td>
          <td>${escapeHtml(issue.source || "-")}</td>
          <td><strong>${escapeHtml(issue.type || "-")}</strong></td>
          <td><span class="severity-pill ${severityClass}">${escapeHtml(issue.severity || "INFO")}</span></td>
          <td>${escapeHtml(issue.note || "-")}</td>
        </tr>
      `
    })
    .join("")
}

const renderFallbackCards = () => {
  renderStatusCard(statusProxy, "API Proxy Status", {
    status: "UNKNOWN",
    label: "Belum terbaca",
    detail: "Status proxy belum bisa dibaca."
  })
  renderStatusCard(statusAppsScript, "Apps Script Status", {
    status: "UNKNOWN",
    label: "Belum terbaca",
    detail: "Apps Script belum menjawab request monitor."
  })
  renderStatusCard(statusBackup, "Backup Terakhir", {
    status: "UNKNOWN",
    label: "Belum terbaca",
    detail: "Last_Backup_Time belum terbaca."
  })
  renderStatusCard(statusReporting, "Reporting Refresh Terakhir", {
    status: "UNKNOWN",
    label: "Belum terbaca",
    detail: "Last_Refreshed DASHBOARD belum terbaca."
  })
}

const renderMonitor = (payload) => {
  const statusCards = payload.status_cards || {}
  renderStatusCard(statusProxy, "API Proxy Status", statusCards.proxy)
  renderStatusCard(statusAppsScript, "Apps Script Status", statusCards.apps_script)
  renderStatusCard(statusBackup, "Backup Terakhir", statusCards.backup)
  renderStatusCard(statusReporting, "Reporting Refresh Terakhir", statusCards.reporting)
  renderAlerts(payload.alerts || [])
  renderSummary(payload.summary || {})
  renderThresholds(payload.thresholds || {})
  renderIssues(payload.recent_issues || [])

  monitorSyncLabel.textContent = payload.generated_at
    ? `Update ${formatDateTimeId(payload.generated_at)}`
    : "Data siap"
  monitorTokenNote.textContent =
    "Panel ini membaca status operasional, bukan omzet atau laporan bisnis."
}

const renderErrorState = (error) => {
  const friendlyMessage = humanizeMonitorError(error)
  renderFallbackCards()
  renderAlerts([
    {
      severity: "ERROR",
      title: "Monitor belum bisa mengambil data",
      message: friendlyMessage,
      source: "SYSTEM_MONITOR"
    }
  ])
  renderSummary({})
  renderThresholds({})
  renderIssues([])
  monitorSyncLabel.textContent = "Perlu dicek"
  monitorTokenNote.textContent = friendlyMessage
  setStatus(friendlyMessage)
}

const loadMonitor = async () => {
  refreshMonitorButton.disabled = true
  monitorSyncLabel.textContent = "Memuat status..."
  setStatus("Memuat kesehatan sistem.")

  try {
    if (!hasAdminApiToken()) {
      throw new Error("Token admin belum tersimpan. Buka halaman admin utama, simpan token, lalu refresh Cek Sistem.")
    }

    const payload = await fetchSystemMonitor()
    renderMonitor(payload)
    setStatus("Kesehatan sistem berhasil dimuat.")
  } catch (error) {
    console.error(error)
    renderErrorState(error)
  } finally {
    refreshMonitorButton.disabled = false
  }
}

const init = () => {
  if (!hasValidAdminSession()) {
    monitorLock.hidden = false
    monitorDashboard.hidden = true
    return
  }

  monitorLock.hidden = true
  monitorDashboard.hidden = false
  renderFallbackCards()
  renderAlerts([])
  renderSummary({})
  renderThresholds({})
  renderIssues([])

  refreshMonitorButton.addEventListener("click", () => {
    void loadMonitor()
  })

  void loadMonitor()
}

init()

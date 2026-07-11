let editingOfferId = null;
let allOffers = [];
let currentUser = null;
let currentAgency = null;
let offerViewMode = "list";
let allActivities = [];
let activeClientKey = "";
let activeWorkspaceOfferId = "";
let workspaceReturnClientKey = "";
let activeWorkspaceTab = "overview";
let commandPaletteOpen = false;
let commandPaletteQuery = "";
let commandPaletteActiveIndex = 0;
let operationalCommandFilter = "all";
let createSurfaceOpen = false;
let opsPanelState = {};
let currentCapabilities = [];
let regressionCaseCache = [];
let latestUniversalTravelIntake = null;
let latestUniversalTravelObjectUrls = [];
const NAV_STATE_KEY = "gt63_navigation_state_v1";
const WORKSPACE_LAZY_FLAGS = {
  activity: "lazy",
  assets: "lazy",
  qa: "lazy",
  pricing: "local",
  overview: "instant"
};

let flights = [];
let hotels = [];

function flightIdentityKey(flight = {}) {
  const normalized = normalizeFlightFields(flight);
  return [
    normalized.route,
    normalized.departure,
    normalized.arrival,
    Number(normalized.price || 0).toFixed(2)
  ]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase())
    .join("|");
}

function roundTripRouteKey(flight = {}) {
  const route = String(normalizeFlightFields(flight).route || "")
    .replace(/[→]/g, "->")
    .replace(/\s+/g, "")
    .toUpperCase();
  return route.includes("/") ? route : "";
}

function addFlight(flight = {}) {
  const cleanFlight = normalizeFlightFields(flight);
  const nextFlight = {
    airline: cleanFlight.airline || "",
    route: cleanFlight.route || "",
    departure: cleanFlight.departure || "",
    arrival: cleanFlight.arrival || "",
    baggage: cleanFlight.baggage || "",
    notes: cleanFlight.notes || "",
    price: Number(cleanFlight.price || 0),
    outboundSegments: Array.isArray(cleanFlight.outboundSegments) ? cleanFlight.outboundSegments : [],
    inboundSegments: Array.isArray(cleanFlight.inboundSegments) ? cleanFlight.inboundSegments : [],
    stopoverAirports: Array.isArray(cleanFlight.stopoverAirports) ? cleanFlight.stopoverAirports : [],
    transferTimes: Array.isArray(cleanFlight.transferTimes) ? cleanFlight.transferTimes : [],
    displayBg: cleanFlight.displayBg && typeof cleanFlight.displayBg === "object" ? cleanFlight.displayBg : null
  };
  const nextRoundTripRoute = roundTripRouteKey(nextFlight);
  const existingIndex = flights.findIndex((item) =>
    flightIdentityKey(item) === flightIdentityKey(nextFlight) ||
    (nextRoundTripRoute && roundTripRouteKey(item) === nextRoundTripRoute)
  );
  if (existingIndex >= 0) {
    flights[existingIndex] = nextFlight;
  } else {
    flights.push(nextFlight);
  }

  renderFlightCards();
  updateAutoPrice();
}

function addHotel(hotel = {}) {
  hotels.push({
    name: hotel.name || "",
    stars: hotel.stars || "",
    area: hotel.area || "",
    distance: hotel.distance || "",
    room: hotel.room || "",
    meal: hotel.meal || "",
    price: Number(hotel.price || 0),
    roomsLeft: hotel.roomsLeft || "",
    description: hotel.description || "",
    images: uniqueHotelImages(hotel.images || []),
    selected: hotels.length === 0
  });

  renderHotelCards();
  updateAutoPrice();
}

function readNavigationState() {
  try {
    return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || "{}") || {};
  } catch (error) {
    console.warn("Navigation state read failed:", error);
    return {};
  }
}

function writeNavigationState(partial = {}) {
  try {
    const current = readNavigationState();
    localStorage.setItem(NAV_STATE_KEY, JSON.stringify({
      ...current,
      ...partial,
      updatedAt: new Date().toISOString()
    }));
  } catch (error) {
    console.warn("Navigation state write failed:", error);
  }
}

function persistNavigationState() {
  writeNavigationState({
    offerViewMode,
    activeClientKey,
    activeWorkspaceOfferId,
    workspaceReturnClientKey,
    activeWorkspaceTab,
    operationalCommandFilter,
    opsPanelState,
    filters: {
      search: $("offerSearch")?.value || "",
      owner: $("offerOwnerFilter")?.value || "agency",
      status: $("offerStatusFilter")?.value || "all"
    }
  });
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);

  let data = null;
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }

    const message =
      data?.details?.error?.message ||
      data?.details?.message ||
      data?.error ||
      data?.message ||
      `HTTP ${res.status}`;

    const error = new Error(message);
    if (data && typeof data === "object") {
      error.stage = data.stage || "";
      error.reason = data.reason || "";
      error.details = data.details || "";
      error.requestId = data.requestId || "";
      error.response = data;
    }
    throw error;
  }

  return data;
}

async function loadCurrentUser() {
  try {
    const data = await fetchJson("/api/auth/me");
    const user = data.user || {};
    currentUser = user;
    currentCapabilities = Array.isArray(user.capabilities) ? user.capabilities : [];
    document.body.dataset.role = user.role || "viewer";
    document.body.dataset.agency = user.agencyId || "";
    renderCapabilityReflection();
  } catch (error) {
    console.error("User load error:", error);
  }
}

async function loadAgencyContext() {
  try {
    if (!hasCapability("agency.view")) {
      currentAgency = null;
      renderCapabilityReflection();
      return;
    }
    const data = await fetchJson("/api/agency");
    currentAgency = data.agency || null;
    renderCapabilityReflection();
  } catch (error) {
    console.warn("Agency context unavailable:", error);
    currentAgency = null;
    renderCapabilityReflection();
  }
}

function hasCapability(capability = "") {
  return currentCapabilities.includes(capability);
}

function capabilityAttrs(capability = "", label = "Action unavailable for your role") {
  return `data-capability="${escapeHtml(capability)}" data-capability-label="${escapeHtml(label)}"`;
}

function setCapabilityState(element, capability = "", label = "Not allowed") {
  if (!element) return;
  const allowed = hasCapability(capability);
  element.disabled = !allowed;
  element.classList.toggle("capability-disabled", !allowed);
  element.title = allowed ? "" : label;
  element.setAttribute("aria-disabled", allowed ? "false" : "true");
}

function reflectCapabilities(root = document) {
  root.querySelectorAll("[data-capability]").forEach((element) => {
    setCapabilityState(
      element,
      element.dataset.capability,
      element.dataset.capabilityLabel || "Action unavailable for your role"
    );
  });
}

function roleLabel() {
  return String(currentUser?.role || "viewer").toUpperCase();
}

function agencyLabel() {
  return currentAgency?.name || currentUser?.agencyName || currentUser?.agencyId || "Scoped agency";
}

function renderTenantIdentity() {
  return `
    <div class="tenant-strip">
      <span>Agency</span>
      <strong>${escapeHtml(agencyLabel())}</strong>
      <span>${escapeHtml(roleLabel())}</span>
      <span>${currentCapabilities.length} caps</span>
    </div>
  `;
}

function renderCapabilitySummary() {
  const groups = [
    { label: "Offers", caps: ["offers.view", "offers.create", "offers.update"] },
    { label: "Clients", caps: ["clients.view"] },
    { label: "Activity", caps: ["activities.view"] },
    { label: "Imports", caps: ["imports.run"] },
    { label: "Users", caps: ["users.manage"] }
  ];

  return `
    <div class="capability-strip">
      ${groups.map((group) => {
        const allowed = group.caps.some((capability) => hasCapability(capability));
        return `<span class="${allowed ? "allowed" : "blocked"}">${escapeHtml(group.label)}</span>`;
      }).join("")}
    </div>
  `;
}

function renderCapabilityNotice() {
  if (hasCapability("offers.create")) {
    return "";
  }
  return `<div class="note capability-note">Read-only access: your role can review scoped operational data, but cannot create or update offers.</div>`;
}

function renderCapabilityReflection(root = document) {
  if ($("currentUser")) {
    $("currentUser").textContent = `${currentUser?.name || currentUser?.email || "User"} · ${roleLabel()}`;
  }
  if ($("tenantIdentity")) $("tenantIdentity").innerHTML = renderTenantIdentity();
  if ($("capabilitySummary")) $("capabilitySummary").innerHTML = renderCapabilitySummary();
  if ($("capabilityNotice")) $("capabilityNotice").innerHTML = renderCapabilityNotice();
  reflectCapabilities(root);
}

async function logout() {
  try {
    await fetchJson("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/login";
  }
}

function $(id) {
  return document.getElementById(id);
}

function num(id) {
  return Number($(id)?.value || 0);
}

function formatPrice(value, currency = "EUR") {
  return `${Number(value || 0).toFixed(2)} ${currency}`;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getOfferWarnings(offer = {}) {
  return Array.isArray(offer.validationWarnings) ? offer.validationWarnings.filter(Boolean) : [];
}

function warningSeverity(warning = "") {
  const text = String(warning || "").trim().toLowerCase();
  if (text.startsWith("[critical]") || text.includes("0 eur") || text.includes("0.00 eur")) return "critical";
  if (text.startsWith("[info]")) return "info";
  return "warning";
}

function displayWarning(warning = "") {
  return String(warning || "").replace(/^\[(INFO|WARNING|CRITICAL)\]\s*/i, "");
}

function classifyWarning(warning = "") {
  const text = String(warning || "").toLowerCase();
  const severity = warningSeverity(warning);
  if (severity === "critical") return "critical";
  if (severity === "info") return "info";
  if (text.includes("date")) return "dates";
  if (text.includes("guest") || text.includes("adult") || text.includes("passenger")) return "guests";
  if (text.includes("availability") || text.includes("available") || text.includes("налич")) return "availability";
  if (text.includes("image")) return "images";
  if (text.includes("destination")) return "destination";
  return "review";
}

function qaScore(offer = {}) {
  const warnings = getOfferWarnings(offer).filter((warning) => warningSeverity(warning) !== "info");
  const finalPrice = Number(offer.finalPrice || offer.price || 0);
  let score = 100;

  score -= Math.min(55, warnings.length * 18);
  if (Number(offer.flightPrice || 0) <= 0) score -= 10;
  if (Number(offer.hotelPrice || 0) <= 0) score -= 10;
  if (finalPrice <= 0) score -= 20;
  if (!offer.destination) score -= 10;
  if (!offer.travelDates) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function qaTone(score, warnings = []) {
  const actionableWarnings = warnings.filter((warning) => warningSeverity(warning) !== "info");
  if (actionableWarnings.some((warning) => warningSeverity(warning) === "critical") || actionableWarnings.length >= 3 || score < 60) return "risk";
  if (actionableWarnings.length || score < 85) return "review";
  return "ready";
}

function qaBadge(offer = {}) {
  const warnings = getOfferWarnings(offer);
  const score = qaScore(offer);
  const tone = qaTone(score, warnings);
  const label = tone === "ready" ? "SAFE" : tone === "review" ? "REVIEW" : "RISK";
  return `<span class="qa-badge qa-${tone}" title="QA ${score} · ${warnings.length ? `${warnings.length} warning(s)` : "No warnings"}">${label}</span>`;
}

function warningChips(offer = {}) {
  const warnings = getOfferWarnings(offer);
  if (!warnings.length) return `<div class="warning-chips"><span class="warning-chip ok">No QA warnings</span></div>`;

  return `
    <div class="warning-chips">
      ${warnings.slice(0, 4).map((warning) => {
        const kind = classifyWarning(warning);
        return `<span class="warning-chip ${kind}" title="${escapeHtml(displayWarning(warning))}">${escapeHtml(kind)}</span>`;
      }).join("")}
      ${warnings.length > 4 ? `<span class="warning-chip more">+${warnings.length - 4}</span>` : ""}
    </div>
  `;
}

function riskSummary(offer = {}) {
  const warnings = getOfferWarnings(offer);
  const score = qaScore(offer);
  const tone = qaTone(score, warnings);
  const label = tone === "ready"
    ? "Safe automation"
    : tone === "review"
      ? "Needs review"
      : "High risk";

  return `
    <div class="risk-summary risk-${tone}">
      <span>${label}</span>
      <strong>QA ${score}</strong>
    </div>
  `;
}

function renderQaSnapshot() {
  const box = $("qaSnapshot");
  if (!box) return;

  const offers = Array.isArray(allOffers) ? allOffers : [];
  const warningOffers = offers.filter((offer) => getOfferWarnings(offer).length);
  const readyOffers = offers.filter((offer) => qaTone(qaScore(offer), getOfferWarnings(offer)) === "ready");
  const riskOffers = offers.filter((offer) => qaTone(qaScore(offer), getOfferWarnings(offer)) === "risk");
  const avgScore = offers.length
    ? Math.round(offers.reduce((sum, offer) => sum + qaScore(offer), 0) / offers.length)
    : 100;

  box.innerHTML = `
    <div class="qa-grid">
      <div class="qa-metric"><span>Avg QA</span><strong>${avgScore}%</strong></div>
      <div class="qa-metric"><span>Ready</span><strong>${readyOffers.length}</strong></div>
      <div class="qa-metric"><span>Warnings</span><strong>${warningOffers.length}</strong></div>
      <div class="qa-metric"><span>Risk</span><strong>${riskOffers.length}</strong></div>
    </div>
  `;
}

function renderAirportResolverMetrics(data = {}) {
  const box = $("airportResolverMetrics");
  if (!box) return;

  const metrics = data.metrics || {};
  const mode = data.mode || "SHADOW";
  const lookups = Number(metrics.totalAirportLookups || 0);
  const matches = Number(metrics.airportResolverMatches || 0);
  const mismatches = Number(metrics.airportResolverMismatches || 0);
  const fallbacks = Number(metrics.airportResolverFallbacks || 0);
  const tone = mismatches > 0 ? "review" : "ready";
  const label = mismatches > 0 ? "Shadow mismatch warning" : "Shadow OK";
  const recentMismatches = Array.isArray(data.recentMismatches) ? data.recentMismatches : [];
  const seedMissingRuntimeCodes = Array.isArray(data.seedMissingRuntimeCodes) ? data.seedMissingRuntimeCodes : [];
  const mismatchRows = recentMismatches.length
    ? recentMismatches.map((item) => `
      <div class="qa-metric">
        <span>lookup: ${escapeHtml(item.lookupText || "Unknown lookup")}</span>
        <strong>hardcoded: ${escapeHtml(item.hardcoded || "missing")}</strong>
        <small>json: ${escapeHtml(item.json || "missing")} · ${escapeHtml(item.time || "")}</small>
      </div>
    `).join("")
    : `<div class="muted">No airport shadow mismatches captured.</div>`;
  const seedGapRows = seedMissingRuntimeCodes.length
    ? seedMissingRuntimeCodes.map((code) => `
      <div class="qa-metric">
        <span>Seed airport missing from runtime config</span>
        <strong>${escapeHtml(code)}</strong>
        <small>Runtime config was not overwritten.</small>
      </div>
    `).join("")
    : `<div class="muted">Runtime config contains all seed airport codes.</div>`;

  box.innerHTML = `
    <div class="risk-summary risk-${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(mode)}</strong>
    </div>
    <div class="qa-grid">
      <div class="qa-metric"><span>Lookups</span><strong>${lookups}</strong></div>
      <div class="qa-metric"><span>Matches</span><strong>${matches}</strong></div>
      <div class="qa-metric"><span>Mismatches</span><strong>${mismatches}</strong></div>
      <div class="qa-metric"><span>Fallbacks</span><strong>${fallbacks}</strong></div>
    </div>
    <h4>Last mismatches</h4>
    <div class="qa-grid">${mismatchRows}</div>
    <h4>Seed/runtime config note</h4>
    <div class="qa-grid">${seedGapRows}</div>
  `;
}

async function loadAirportResolverMetrics() {
  try {
    const data = await fetchJson("/api/admin/airport-resolver-metrics");
    renderAirportResolverMetrics(data);
  } catch (error) {
    console.error("Airport resolver metrics error:", error);
    renderAirportResolverMetrics({
      mode: "SHADOW",
      metrics: {
        totalAirportLookups: 0,
        airportResolverMatches: 0,
        airportResolverMismatches: 0,
        airportResolverFallbacks: 0
      },
      recentMismatches: [],
      seedMissingRuntimeCodes: []
    });
  }
}

function renderRegressionLibraryMetrics(data = {}) {
  const box = $("regressionLibraryMetrics");
  if (!box) return;

  const flightCases = Number(data.flightCases || 0);
  const hotelCases = Number(data.hotelCases || 0);
  const lastArchived = data.lastArchivedCase || null;
  const lastError = data.lastArchiveError || null;
  const tone = lastError ? "review" : "ready";
  const label = lastError ? "Archive warning" : "Archive OK";

  box.innerHTML = `
    <div class="risk-summary risk-${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(lastError ? "CHECK" : "PASSIVE")}</strong>
    </div>
    <div class="qa-grid">
      <div class="qa-metric"><span>Flight cases</span><strong>${flightCases}</strong></div>
      <div class="qa-metric"><span>Hotel cases</span><strong>${hotelCases}</strong></div>
      <div class="qa-metric"><span>Last archived</span><strong>${escapeHtml(lastArchived?.decision || "-")}</strong><small>${escapeHtml(lastArchived?.path || "")}</small></div>
      <div class="qa-metric"><span>Last error</span><strong>${escapeHtml(lastError?.message || "-")}</strong><small>${escapeHtml(lastError?.time || "")}</small></div>
    </div>
    <div class="toolbar compact-toolbar">
      <button type="button" class="ghost" id="openLatestRegressionCase">Open latest case</button>
    </div>
    <h4>Latest regression cases</h4>
    <div id="regressionCaseList"><div class="muted">Loading cases...</div></div>
    <div id="regressionCaseInspector"></div>
  `;
}

function prettyJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return String(value || "");
  }
}

function renderRegressionCaseList(cases = []) {
  const box = $("regressionCaseList");
  if (!box) return;
  regressionCaseCache = Array.isArray(cases) ? cases : [];

  if (!regressionCaseCache.length) {
    box.innerHTML = `<div class="muted">No regression cases archived yet.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="qa-grid">
      ${regressionCaseCache.map((item) => `
        <div class="qa-metric">
          <span>${escapeHtml(item.route || "-")}</span>
          <strong>${escapeHtml(item.decision || "-")} · ${escapeHtml(item.type || "-")}</strong>
          <small>${escapeHtml(item.airline || "-")} · ${escapeHtml((item.reviewReasons || [])[0] || "No review reason")} · ${escapeHtml(item.timestamp || "")}</small>
          <button type="button" class="ghost regression-open-case" data-case-id="${escapeHtml(item.id || "")}">Open</button>
        </div>
      `).join("")}
    </div>
  `;

  $("openLatestRegressionCase")?.addEventListener("click", () => {
    const latest = regressionCaseCache[0];
    if (latest?.id) openRegressionCase(latest.id);
  });
  box.querySelectorAll(".regression-open-case").forEach((button) => {
    button.addEventListener("click", () => openRegressionCase(button.dataset.caseId || ""));
  });
}

function renderRegressionCaseInspector(data = null, error = "") {
  const box = $("regressionCaseInspector");
  if (!box) return;

  if (error) {
    box.innerHTML = `<div class="note risk-note">${escapeHtml(error)}</div>`;
    return;
  }

  if (!data) {
    box.innerHTML = "";
    return;
  }

  const files = Array.isArray(data.files) ? data.files : [];
  box.innerHTML = `
    <h4>Case inspector</h4>
    <div class="qa-grid">
      <div class="qa-metric"><span>Case</span><strong>${escapeHtml(data.id || "-")}</strong><small>${escapeHtml(data.path || "")}</small></div>
      <div class="qa-metric"><span>Decision</span><strong>${escapeHtml(data.decision || "-")}</strong><small>${escapeHtml(data.timestamp || "")}</small></div>
      <div class="qa-metric"><span>Route</span><strong>${escapeHtml(data.route || "-")}</strong><small>${escapeHtml(data.airline || "-")}</small></div>
      <div class="qa-metric"><span>Files</span><strong>${files.length}</strong><small>${escapeHtml(files.join(", "))}</small></div>
    </div>
    <h4>Metadata</h4>
    <pre class="debug-pre">${escapeHtml(prettyJson(data.metadata))}</pre>
    <h4>Parsed Output</h4>
    <pre class="debug-pre">${escapeHtml(prettyJson(data.parsedOutput))}</pre>
    <h4>Trace</h4>
    <pre class="debug-pre">${escapeHtml(prettyJson(data.trace))}</pre>
    <h4>Raw OCR</h4>
    <pre class="debug-pre">${escapeHtml(data.rawOcr || "")}</pre>
    <h4>Enhanced OCR</h4>
    <pre class="debug-pre">${escapeHtml(data.enhancedOcr || "")}</pre>
  `;
}

async function loadRegressionCases() {
  try {
    const data = await fetchJson("/api/admin/regression-cases?limit=20");
    renderRegressionCaseList(data.cases || []);
  } catch (error) {
    console.error("Regression cases error:", error);
    renderRegressionCaseList([]);
    renderRegressionCaseInspector(null, "Regression cases unavailable.");
  }
}

async function openRegressionCase(caseId = "") {
  if (!caseId) return;
  renderRegressionCaseInspector({ id: caseId, decision: "Loading..." });
  try {
    const data = await fetchJson(`/api/admin/regression-cases/${encodeURIComponent(caseId)}`);
    renderRegressionCaseInspector(data);
  } catch (error) {
    console.error("Regression case detail error:", error);
    renderRegressionCaseInspector(null, error.message || "Regression case unavailable.");
  }
}

async function loadRegressionLibraryMetrics() {
  try {
    const data = await fetchJson("/api/admin/regression-library-metrics");
    renderRegressionLibraryMetrics(data);
    await loadRegressionCases();
  } catch (error) {
    console.error("Regression library metrics error:", error);
    renderRegressionLibraryMetrics({
      flightCases: 0,
      hotelCases: 0,
      lastArchivedCase: null,
      lastArchiveError: { message: "Metrics unavailable", time: "" }
    });
    renderRegressionCaseList([]);
  }
}

function renderBetaHealthMetrics(data = {}) {
  const box = $("betaHealthMetrics");
  if (!box) return;

  const totalImports = Number(data.totalImports || 0);
  const passImports = Number(data.passImports || 0);
  const reviewImports = Number(data.reviewImports || 0);
  const rejectImports = Number(data.rejectImports || 0);
  const reviewRate = Number(data.reviewRate || 0);
  const tone = reviewRate > 30 ? "risk" : reviewRate >= 15 ? "review" : "ready";
  const label = tone === "ready" ? "Beta healthy" : tone === "review" ? "Review load rising" : "High review load";
  const topReasons = Array.isArray(data.topReviewReasons) ? data.topReviewReasons : [];
  const reasonGroups = Array.isArray(data.reviewReasonGroups) ? data.reviewReasonGroups : [];
  const topRoutes = Array.isArray(data.topAffectedRoutes) ? data.topAffectedRoutes : [];
  const recentCases = Array.isArray(data.recentReviewCases) ? data.recentReviewCases : [];
  const regression = data.regressionSummary || {};

  const reasonRows = topReasons.length
    ? topReasons.map((item, index) => `
      <div class="qa-metric">
        <span>${index + 1}. ${escapeHtml(item.reason || "Review")}</span>
        <strong>${Number(item.count || 0)}</strong>
      </div>
    `).join("")
    : `<div class="muted">No review reasons captured yet.</div>`;

  const groupRows = reasonGroups.length
    ? reasonGroups.map((item) => `
      <div class="qa-metric">
        <span>${escapeHtml(item.category || "OTHER")}</span>
        <strong>${Number(item.count || 0)}</strong>
        <small>${Number(item.reviewShare || 0).toFixed(1)}% of review cases</small>
      </div>
    `).join("")
    : `<div class="muted">No review groups captured yet.</div>`;

  const routeRows = topRoutes.length
    ? topRoutes.map((item) => {
      const reasonGroups = Array.isArray(item.reasonGroups) ? item.reasonGroups : [];
      const topReasons = Array.isArray(item.topReasons) ? item.topReasons : [];
      const reasonGroupText = reasonGroups.length
        ? reasonGroups.map((group) => `${escapeHtml(group.category || "OTHER")} ${Number(group.count || 0)}`).join(" · ")
        : "No grouped reasons";
      const topReasonText = topReasons.length
        ? topReasons.map((reason) => `${escapeHtml(reason.reason || "Review")} (${Number(reason.count || 0)})`).join(" · ")
        : "";
      return `
      <div class="qa-metric">
        <span>${escapeHtml(item.route || "-")}</span>
        <strong>${Number(item.count || 0)} cases</strong>
        <small>${Number(item.reviewRate || 0).toFixed(1)}% review</small>
        <small>${reasonGroupText}</small>
        ${topReasonText ? `<small>${topReasonText}</small>` : ""}
      </div>
    `;
    }).join("")
    : `<div class="muted">No affected routes captured yet.</div>`;

  const recentRows = recentCases.length
    ? recentCases.map((item) => `
      <div class="qa-metric">
        <span>${escapeHtml(item.route || "-")}</span>
        <strong>${escapeHtml(item.airline || item.type || "-")}</strong>
        <small>${escapeHtml(item.reviewReason || "Review")} · ${escapeHtml(item.timestamp || "")}</small>
      </div>
    `).join("")
    : `<div class="muted">No recent review cases.</div>`;

  box.innerHTML = `
    <div class="risk-summary risk-${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${reviewRate.toFixed(1)}%</strong>
    </div>
    <div class="qa-grid">
      <div class="qa-metric"><span>Total imports</span><strong>${totalImports}</strong></div>
      <div class="qa-metric"><span>PASS</span><strong>${passImports}</strong></div>
      <div class="qa-metric"><span>REVIEW</span><strong>${reviewImports}</strong></div>
      <div class="qa-metric"><span>REJECT</span><strong>${rejectImports}</strong></div>
    </div>
    <h4>Top review reasons</h4>
    <div class="qa-grid">${reasonRows}</div>
    <h4>Review reason groups</h4>
    <div class="qa-grid">${groupRows}</div>
    <h4>Top affected routes</h4>
    <div class="qa-grid">${routeRows}</div>
    <h4>Recent review cases</h4>
    <div class="qa-grid">${recentRows}</div>
    <h4>Regression snapshot</h4>
    <div class="qa-grid">
      <div class="qa-metric"><span>Flight cases</span><strong>${Number(regression.flightCases || 0)}</strong></div>
      <div class="qa-metric"><span>Hotel cases</span><strong>${Number(regression.hotelCases || 0)}</strong></div>
      <div class="qa-metric"><span>Last archived</span><strong>${escapeHtml(regression.lastArchivedCase?.decision || "-")}</strong><small>${escapeHtml(regression.lastArchivedCase?.path || "")}</small></div>
    </div>
  `;
}

async function loadBetaHealthMetrics() {
  try {
    const data = await fetchJson("/api/admin/beta-health");
    renderBetaHealthMetrics(data);
  } catch (error) {
    console.error("Beta health metrics error:", error);
    renderBetaHealthMetrics({
      totalImports: 0,
      passImports: 0,
      reviewImports: 0,
      rejectImports: 0,
      reviewRate: 0,
      topReviewReasons: [],
      reviewReasonGroups: [],
      topAffectedRoutes: [],
      recentReviewCases: [],
      regressionSummary: {}
    });
  }
}

function pipelineStage(offer = {}) {
  const status = String(offer.status || "draft").toLowerCase();
  const hasWarnings = getOfferWarnings(offer).length > 0;

  if (["booked", "lost", "cancelled", "expired"].includes(status)) return "closed";
  if (status === "viewed") return "viewed";
  if (status === "sent") return "sent";
  if (hasWarnings) return "review";
  return "draft";
}

function kanbanStage(offer = {}) {
  const status = String(offer.status || "draft").toLowerCase();
  if (status === "booked") return "booked";
  if (["lost", "cancelled", "expired"].includes(status)) return "lost";
  if (status === "viewed") return "viewed";
  if (status === "sent") return "sent";
  if (getOfferWarnings(offer).length) return "review";
  return "draft";
}

function renderKanbanCard(offer = {}) {
  const id = escapeHtml(offer.id || "");
  const currency = offer.currency || "EUR";
  const warnings = getOfferWarnings(offer);
  const finalPrice = Number(offer.finalPrice || offer.price || 0);
  const warningText = warnings.length ? `${warnings.length} review item${warnings.length === 1 ? "" : "s"}` : "Clean";

  return `
    <article class="kanban-card qa-card-${qaTone(qaScore(offer), warnings)}">
      <div class="kanban-card-top">
        <strong>${escapeHtml(offer.destination || "Untitled")}</strong>
        ${qaBadge(offer)}
      </div>
      <div class="kanban-client">${escapeHtml(offer.clientName || "-")}</div>
      <div class="kanban-meta">
        <span>${escapeHtml(offer.travelDates || "-")}</span>
        <strong>${formatPrice(finalPrice, currency)}</strong>
      </div>
      <div class="kanban-warning-count">${escapeHtml(warningText)}</div>
      <div class="kanban-actions">
        <button class="primary-action" type="button" onclick="openOfferWorkspace('${id}')">Work</button>
      </div>
    </article>
  `;
}

function renderKanbanOffers(offers = []) {
  const columns = [
    { id: "draft", label: "Draft" },
    { id: "review", label: "Review" },
    { id: "sent", label: "Sent" },
    { id: "viewed", label: "Viewed" },
    { id: "booked", label: "Booked" },
    { id: "lost", label: "Lost" }
  ];
  const grouped = columns.reduce((acc, column) => ({ ...acc, [column.id]: [] }), {});
  offers.forEach((offer) => grouped[kanbanStage(offer)].push(offer));

  return `
    <div class="kanban-board">
      ${columns.map((column) => {
        const visible = grouped[column.id].slice(0, 12);
        const hidden = grouped[column.id].length - visible.length;
        return `
          <section class="kanban-column stage-${column.id}">
            <div class="kanban-head">
              <span>${column.label}</span>
              <strong>${grouped[column.id].length}</strong>
            </div>
            <div class="kanban-stack">
              ${visible.map(renderKanbanCard).join("") || `<div class="kanban-empty">No offers</div>`}
              ${hidden > 0 ? `<div class="kanban-more">+${hidden} more</div>` : ""}
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderPipelinePreview() {
  const box = $("pipelinePreview");
  if (!box) return;

  const stages = [
    { id: "draft", label: "Draft" },
    { id: "review", label: "Review" },
    { id: "sent", label: "Sent" },
    { id: "viewed", label: "Viewed" },
    { id: "closed", label: "Booked/Lost" }
  ];

  const counts = stages.reduce((acc, stage) => ({ ...acc, [stage.id]: 0 }), {});
  allOffers.forEach((offer) => {
    counts[pipelineStage(offer)] += 1;
  });

  const max = Math.max(1, ...Object.values(counts));

  box.innerHTML = `
    <div class="pipeline-mini">
      ${stages.map((stage) => {
        const count = counts[stage.id] || 0;
        const width = Math.max(8, Math.round((count / max) * 100));
        return `
          <div class="pipeline-row stage-${stage.id}">
            <div class="pipeline-label"><span>${stage.label}</span><strong>${count}</strong></div>
            <div class="pipeline-track"><i style="width:${width}%"></i></div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function activityLabel(type = "") {
  const labels = {
    offer_created: "Created",
    offer_updated: "Updated",
    offer_viewed: "Viewed",
    status_changed: "Status",
    pdf_downloaded: "PDF",
    whatsapp_clicked: "WhatsApp",
    client_extraction_migrated: "Client Migration",
    activity_system_migrated: "Activity Migration",
    audit_cleanup_migrated: "Audit Cleanup",
    auth_agency_migrated: "Auth Migration",
    foundation_migrated: "Foundation"
  };
  return labels[type] || String(type || "Activity").replace(/_/g, " ");
}

function activityTone(type = "") {
  if (String(type).includes("viewed")) return "viewed";
  if (String(type).includes("status")) return "status";
  if (String(type).includes("pdf")) return "pdf";
  if (String(type).includes("whatsapp")) return "whatsapp";
  if (String(type).includes("created")) return "created";
  if (String(type).includes("migrated")) return "system";
  return "default";
}

function formatActivityTime(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderActivityTimeline(activities = []) {
  const box = $("activityTimeline");
  if (!box) return;

  if (!activities.length) {
    box.innerHTML = `<div class="muted">No activity yet.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="activity-timeline">
      ${activities.slice(0, 8).map((activity) => {
        const type = escapeHtml(activity.type || "");
        const offerId = escapeHtml(activity.offerId || "");
        const link = offerId ? `/api/offers/view/${offerId}` : "";
        return `
          <div class="activity-row">
            <span class="activity-dot activity-${activityTone(activity.type)}"></span>
            <div class="activity-main">
              <div class="activity-top">
                <strong>${escapeHtml(activityLabel(activity.type))}</strong>
                <span>${escapeHtml(formatActivityTime(activity.timestamp || activity.createdAt))}</span>
              </div>
              <div class="activity-meta">
                <span>${type}</span>
                ${offerId ? `<a href="${link}" target="_blank">${offerId.slice(0, 14)}</a>` : ""}
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function loadActivities() {
  const box = $("activityTimeline");
  if (!box) return;

  try {
    const data = await fetchJson("/api/activities?limit=12");
    allActivities = Array.isArray(data.activities) ? data.activities : [];
    renderActivityTimeline(allActivities);
    if (activeClientKey) renderClientDrawer(activeClientKey);
    if (activeWorkspaceOfferId) renderOfferWorkspace(activeWorkspaceOfferId);
  } catch (error) {
    console.error("Activities error:", error);
    box.innerHTML = `<div class="muted">Error loading activity: ${escapeHtml(error.message)}</div>`;
  }
}

function splitLines(text) {
  const urls = String(text || "").match(/https?:\/\/[^\s]+?(?=https?:\/\/|$|\s)/g);

  if (urls?.length) {
    return urls.map((x) => x.trim()).filter(Boolean);
  }

  return String(text || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isLikelyHotelImageUrl(value = "") {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  if (/\.(?:jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i.test(text)) return true;
  return /\/images?\//i.test(text) && !/\/hotel\/[^/]+\/[^/?#]+\.html/i.test(text);
}

function hotelImageKey(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  try {
    const url = new URL(text);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return text.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
  }
}

function hotelImageHostType(value = "") {
  try {
    const host = new URL(String(value || "").trim()).hostname.toLowerCase();
    if (host.includes("serpapi.com")) return "proxy";
    if (host.includes("bstatic.com") || host.includes("booking.com")) return "hotel-source";
    return "external";
  } catch {
    return "external";
  }
}

function hotelImageSceneKey(value = "") {
  const key = hotelImageKey(value);
  if (!key) return "";

  const filename = key.split("/").pop() || key;
  const numericId = filename.match(/\d{6,}/)?.[0];
  if (numericId) return numericId;

  return key
    .replace(/(?:max|square|max\d+x\d+|xdata|images?|hotel|searches|thumbnail|thumb|large|small|medium)/g, "")
    .replace(/[^a-z0-9а-я]+/gi, "")
    .slice(0, 28);
}

function uniqueHotelImages(images = [], limit = 6, usedKeys = null) {
  const candidates = (Array.isArray(images) ? images : [])
    .map((source) => typeof source === "string" ? source.trim() : "")
    .filter((image) => image && isLikelyHotelImageUrl(image));
  const hasDirectHotelSource = candidates.some((image) => hotelImageHostType(image) === "hotel-source");
  const picked = [];
  const localKeys = new Set();
  const localSceneKeys = new Set();

  for (const image of candidates) {
    if (hasDirectHotelSource && hotelImageHostType(image) === "proxy") continue;

    const key = hotelImageKey(image);
    const sceneKey = hotelImageSceneKey(image);
    if (
      !key ||
      localKeys.has(key) ||
      (sceneKey && localSceneKeys.has(sceneKey)) ||
      (usedKeys && (usedKeys.has(key) || (sceneKey && usedKeys.has(`scene:${sceneKey}`))))
    ) continue;

    localKeys.add(key);
    if (sceneKey) localSceneKeys.add(sceneKey);
    if (usedKeys) {
      usedKeys.add(key);
      if (sceneKey) usedKeys.add(`scene:${sceneKey}`);
    }
    picked.push(image);
    if (picked.length >= limit) break;
  }

  return picked;
}

function dedupeHotelOptionImages(sourceHotels = [], limit = 6) {
  const usedKeys = new Set();
  return (Array.isArray(sourceHotels) ? sourceHotels : []).map((hotel) => ({
    ...hotel,
    images: uniqueHotelImages(hotel.images || [], limit, usedKeys)
  }));
}

function calculatePricing() {
  const flight = num("flightPrice");
  const hotel = num("hotelPrice");
  const transfer = num("transferPrice");
  const markup = num("markupPercent");
  const currency = $("currency")?.value || "EUR";

  const base = flight + hotel + transfer;
  const autoFinal = base + base * (markup / 100);
  const override = $("finalPrice")?.value ? Number($("finalPrice").value) : 0;
  const final = override > 0 ? override : autoFinal;
  const profit = final - base;

  if ($("basePrice")) {
    $("basePrice").value = base.toFixed(2);
  }

  if ($("pricingPreview")) {
    $("pricingPreview").innerHTML = `
      <div><strong>Base:</strong> ${formatPrice(base, currency)}</div>
      <div><strong>Final:</strong> ${formatPrice(final, currency)}</div>
      <div><strong>Profit:</strong> ${formatPrice(profit, currency)}</div>
    `;
  }

  return { base, final, profit };
}

function selectedHotel() {
  return hotels.find((hotel) => hotel.selected) || hotels[0] || {};
}

function syncLegacyFieldsFromBuilder() {
  const firstFlight = flights[0] || {};
  const hotel = selectedHotel();
  const flightTotal = flights.reduce((sum, flight) => sum + Number(flight.price || 0), 0);

  setValue("flightAirline", firstFlight.airline || "");
  setValue("flightRoute", firstFlight.route || "");
  setValue("flightDeparture", firstFlight.departure || "");
  setValue("flightArrival", firstFlight.arrival || "");
  setValue("flightBaggage", firstFlight.baggage || "");
  setValue("flightNotes", firstFlight.notes || "");
  setValue("flightPrice", flightTotal.toFixed(2));

  setValue("hotelName", hotel.name || "");
  setValue("hotelStars", hotel.stars || "");
  setValue("hotelArea", hotel.area || "");
  setValue("hotelDistance", hotel.distance || "");
  setValue("hotelRoom", hotel.room || "");
  setValue("hotelMeal", hotel.meal || "");
  setValue("hotelRoomsLeft", hotel.roomsLeft || "");
  setValue("hotelDescription", hotel.description || "");
  setValue("hotelImages", Array.isArray(hotel.images) ? hotel.images.join("\n") : "");
  if (hotels.length) setValue("hotelPrice", Number(hotel.price || 0).toFixed(2));
}

function updateAutoPrice() {
  syncLegacyFieldsFromBuilder();
  calculatePricing();
}

async function loadStats() {
  try {
    const stats = await fetchJson("/api/offers/stats/summary");

    $("statTotal").textContent = stats.totalOffers || 0;
    $("statActive").textContent = stats.activeOffers || 0;
    $("statRevenue").textContent = formatPrice(stats.revenuePotential || 0);
    $("statMargin").textContent = formatPrice(stats.marginPotential || 0);
    $("statBooked").textContent = formatPrice(stats.bookedRevenue || 0);
    $("statLost").textContent = formatPrice(stats.lostRevenue || 0);
  } catch (error) {
    console.error("Stats error:", error);
  }
}

function getOfferFlightPrice(offer) {
  if (Number(offer.flightPrice || 0) > 0) return Number(offer.flightPrice || 0);

  const flights = Array.isArray(offer.flights)
    ? offer.flights
    : Array.isArray(offer.flightOptions)
    ? offer.flightOptions
    : [];

  return flights.reduce((sum, f) => sum + Number(f.price || 0), 0);
}

function getOfferHotelPrice(offer) {
  if (Number(offer.hotelPrice || 0) > 0) return Number(offer.hotelPrice || 0);

  const hotels = Array.isArray(offer.hotels)
    ? offer.hotels
    : Array.isArray(offer.hotelOptions)
    ? offer.hotelOptions
    : [];

  return hotels.reduce((sum, h) => sum + Number(h.price || 0), 0);
}

function getOfferById(id) {
  return allOffers.find((offer) => offer.id === id);
}

function getPublicOfferUrl(id) {
  return `${window.location.origin}/offer/${id}`;
}

function getPdfOfferUrl(id) {
  return `${window.location.origin}/api/offers/${id}/pdf`;
}

function getWhatsAppText(id) {
  return `Здравейте!\nВашата оферта е готова:\n${getPublicOfferUrl(id)}`;
}

function statusBadge(status = "draft") {
  const safeStatus = String(status || "draft").toLowerCase();
  return `<span class="status-badge status-${escapeHtml(safeStatus)}">${escapeHtml(safeStatus)}</span>`;
}

function offerMatchesFilters(offer) {
  const query = normalizeText($("offerSearch")?.value || "");
  const status = $("offerStatusFilter")?.value || "all";
  const ownerScope = $("offerOwnerFilter")?.value || "agency";
  const offerStatus = offer.status || "draft";
  const warnings = getOfferWarnings(offer);
  const tone = qaTone(qaScore(offer), warnings);

  if (status !== "all" && offerStatus !== status) return false;
  if (ownerScope === "mine" && offer.createdBy !== currentUser?.id) return false;
  if (operationalCommandFilter === "risk" && tone !== "risk") return false;
  if (operationalCommandFilter === "review" && !warnings.length) return false;
  if (operationalCommandFilter === "booked" && offerStatus !== "booked") return false;
  if (!query) return true;

  const searchable = normalizeText(
    [
      offer.id,
      offer.destination,
      offer.clientName,
      offer.clientPhone,
      offer.ownerName,
      offer.travelDates,
      offerStatus
    ].join(" ")
  );

  return searchable.includes(query);
}

function buildClientSummaries() {
  const clients = new Map();

  allOffers.forEach((offer) => {
    const name = String(offer.clientName || "Unnamed client").trim() || "Unnamed client";
    const phone = String(offer.clientPhone || "").trim();
    const key = `${name.toLowerCase()}|${phone}`;
    const finalPrice = Number(offer.finalPrice || offer.price || 0);
    const warnings = getOfferWarnings(offer);
    const current = clients.get(key) || {
      key,
      name,
      phone,
      offers: 0,
      totalValue: 0,
      bookedValue: 0,
      reviewCount: 0,
      riskCount: 0,
      lastDestination: "",
      lastStatus: "draft",
      lastDate: "",
      offerIds: []
    };

    current.offers += 1;
    current.offerIds.push(offer.id);
    current.totalValue += finalPrice;
    if (offer.status === "booked") current.bookedValue += finalPrice;
    if (warnings.length) current.reviewCount += 1;
    if (qaTone(qaScore(offer), warnings) === "risk") current.riskCount += 1;
    current.lastDestination = offer.destination || current.lastDestination;
    current.lastStatus = offer.status || current.lastStatus;
    current.lastDate = offer.travelDates || current.lastDate;

    clients.set(key, current);
  });

  return Array.from(clients.values()).sort((a, b) => b.totalValue - a.totalValue);
}

function renderClients() {
  const box = $("clientsBox");
  if (!box) return;

  const clients = buildClientSummaries();

  if (!clients.length) {
    box.innerHTML = `<div class="muted">No clients yet.</div>`;
    return;
  }

  box.innerHTML = clients
    .slice(0, 8)
    .map((client) => {
      const search = encodeURIComponent(client.phone || client.name);
      const key = encodeURIComponent(client.key);
      return `
        <div class="client-row" role="button" tabindex="0" onclick="openClientDrawer('${key}')" onkeydown="if(event.key==='Enter'){openClientDrawer('${key}')}">
          <div>
            <strong>${escapeHtml(client.name)}</strong>
            <div class="muted">${escapeHtml(client.phone || "No phone")} · ${client.offers} offer${client.offers === 1 ? "" : "s"}</div>
            <div class="muted">${escapeHtml(client.lastDestination || "-")} · ${escapeHtml(client.lastDate || "-")}</div>
          </div>
          <div class="client-side">
            ${statusBadge(client.lastStatus)}
            <strong>${formatPrice(client.totalValue)}</strong>
            <button type="button" onclick="event.stopPropagation(); focusOfferSearch('${search}')">Find</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function getClientByKey(clientKey = "") {
  return buildClientSummaries().find((client) => client.key === clientKey) || null;
}

function buildCommandItems() {
  const offerItems = allOffers.flatMap((offer) => {
    const id = String(offer.id || "");
    const destination = offer.destination || "Untitled offer";
    const client = offer.clientName || "-";
    const dates = offer.travelDates || "-";
    const searchable = [id, destination, client, offer.clientPhone, dates, offer.status].join(" ");

    return [
      {
        type: "workspace",
        action: "workspace",
        title: `Work: ${destination}`,
        subtitle: `${client} · ${dates}`,
        searchable,
        run: () => openOfferWorkspace(id)
      },
      {
        type: "offer",
        action: "open",
        title: `Open client page: ${destination}`,
        subtitle: `${client} · ${id}`,
        searchable,
        run: () => window.open(`/api/offers/view/${encodeURIComponent(id)}`, "_blank")
      },
      {
        type: "pdf",
        action: "pdf",
        title: `Open PDF: ${destination}`,
        subtitle: `${client} · ${id}`,
        searchable,
        run: () => window.open(`/api/offers/${encodeURIComponent(id)}/pdf`, "_blank")
      }
    ];
  });

  const destinationItems = Array.from(
    new Map(
      allOffers
        .filter((offer) => offer.destination)
        .map((offer) => [normalizeText(offer.destination), offer.destination])
    ).values()
  ).map((destination) => ({
    type: "destination",
    action: "search",
    title: `Search destination: ${destination}`,
    subtitle: "Filter recent offers",
    searchable: destination,
    run: () => {
      focusOfferSearch(encodeURIComponent(destination));
    }
  }));

  const clientItems = buildClientSummaries().map((client) => ({
    type: "client",
    action: "client",
    title: `Client: ${client.name}`,
    subtitle: `${client.phone || "No phone"} · ${client.offers} offer${client.offers === 1 ? "" : "s"}`,
    searchable: [client.name, client.phone, client.lastDestination, client.lastDate].join(" "),
    run: () => openClientDrawer(encodeURIComponent(client.key))
  }));

  const operationalItems = [
    {
      type: "ops",
      action: "filter",
      title: "Show risky offers",
      subtitle: "Read-only filter: QA risk",
      searchable: "risk risky high risk offers qa",
      run: () => applyOperationalCommandFilter("risk")
    },
    {
      type: "ops",
      action: "filter",
      title: "Show review offers",
      subtitle: "Read-only filter: offers with warnings",
      searchable: "review warnings needs review offers qa",
      run: () => applyOperationalCommandFilter("review")
    },
    {
      type: "ops",
      action: "filter",
      title: "Show booked offers",
      subtitle: "Read-only filter: status booked",
      searchable: "booked closed won offers status",
      run: () => applyOperationalCommandFilter("booked")
    },
    {
      type: "workspace",
      action: "restore",
      title: "Restore last workspace",
      subtitle: "Reopen last remembered workspace",
      searchable: "restore last workspace reopen continue",
      run: restoreLastWorkspaceFromCommand
    }
  ];

  return [...operationalItems, ...clientItems, ...destinationItems, ...offerItems];
}

function findBestOfferForQuery(query = "") {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;

  return allOffers.find((offer) => normalizeText(offer.id || "").includes(normalizedQuery))
    || allOffers.find((offer) => normalizeText(offer.destination || "").includes(normalizedQuery))
    || allOffers.find((offer) => normalizeText(offer.clientName || "").includes(normalizedQuery))
    || null;
}

function findBestClientForQuery(query = "") {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;

  return buildClientSummaries().find((client) => normalizeText(`${client.name} ${client.phone}`).includes(normalizedQuery)) || null;
}

function parseOperationalQuery(rawQuery = "") {
  const query = normalizeText(rawQuery).trim();
  if (!query) return [];

  const commands = [];
  const isRisk = /^(risk|risky|show risky offers|show risk|high risk|qa risk)$/.test(query);
  const isReview = /^(review|reviews|show review|show review queue|review queue|warnings|needs review)$/.test(query);
  const isBooked = /^(booked|show booked|show booked offers|booked offers|won)$/.test(query);
  const isRestoreWorkspace = /^(restore|restore workspace|restore last workspace|reopen workspace|reopen last workspace|continue)$/.test(query);

  if (isRisk) {
    commands.push({
      type: "ops",
      action: "query",
      title: "Show risky offers",
      subtitle: "Deterministic query: QA risk",
      searchable: query,
      run: () => applyOperationalCommandFilter("risk")
    });
  }

  if (isReview) {
    commands.push({
      type: "ops",
      action: "query",
      title: "Show review queue",
      subtitle: "Deterministic query: offers with persisted warnings",
      searchable: query,
      run: () => applyOperationalCommandFilter("review")
    });
  }

  if (isBooked) {
    commands.push({
      type: "ops",
      action: "query",
      title: "Show booked offers",
      subtitle: "Deterministic query: status booked",
      searchable: query,
      run: () => applyOperationalCommandFilter("booked")
    });
  }

  if (isRestoreWorkspace) {
    commands.push({
      type: "workspace",
      action: "query",
      title: "Reopen last workspace",
      subtitle: "Deterministic query: restore UI navigation state",
      searchable: query,
      run: restoreLastWorkspaceFromCommand
    });
  }

  const clientMatch = query.match(/^(open client|client|find client|show client)\s+(.+)$/);
  if (clientMatch) {
    const client = findBestClientForQuery(clientMatch[2]);
    if (client) {
      commands.push({
        type: "client",
        action: "query",
        title: `Open client: ${client.name}`,
        subtitle: `${client.phone || "No phone"} · ${client.offers} offer${client.offers === 1 ? "" : "s"}`,
        searchable: query,
        run: () => openClientDrawer(encodeURIComponent(client.key))
      });
    }
  }

  const workspaceMatch = query.match(/^(workspace|open workspace|work|open offer)\s+(.+)$/);
  if (workspaceMatch) {
    const offer = findBestOfferForQuery(workspaceMatch[2]);
    if (offer) {
      commands.push({
        type: "workspace",
        action: "query",
        title: `Open workspace: ${offer.destination || "Untitled offer"}`,
        subtitle: `${offer.clientName || "-"} · ${offer.travelDates || "-"}`,
        searchable: query,
        run: () => openOfferWorkspace(offer.id)
      });
    }
  }

  const pdfMatch = query.match(/^(pdf|open pdf|show pdf)\s+(.+)$/);
  if (pdfMatch) {
    const offer = findBestOfferForQuery(pdfMatch[2]);
    if (offer) {
      commands.push({
        type: "pdf",
        action: "query",
        title: `Open PDF: ${offer.destination || "Untitled offer"}`,
        subtitle: `${offer.clientName || "-"} · ${offer.id || "-"}`,
        searchable: query,
        run: () => window.open(`/api/offers/${encodeURIComponent(offer.id)}/pdf`, "_blank")
      });
    }
  }

  const destinationMatch = query.match(/^(show|open|search)\s+(.+)\s+(offers|trips)$/);
  if (destinationMatch) {
    const destination = destinationMatch[2];
    commands.push({
      type: "destination",
      action: "query",
      title: `Search destination: ${destination}`,
      subtitle: "Deterministic query: filter offer list",
      searchable: query,
      run: () => focusOfferSearch(encodeURIComponent(destination))
    });
  }

  return commands;
}

function getCommandResults() {
  const query = normalizeText(commandPaletteQuery);
  const queryCommands = parseOperationalQuery(commandPaletteQuery);
  const items = buildCommandItems();
  if (!query) return items.slice(0, 12);

  const matches = items
    .filter((item) => normalizeText(`${item.title} ${item.subtitle} ${item.searchable}`).includes(query))
    .slice(0, 18 - queryCommands.length);

  return [...queryCommands, ...matches].slice(0, 18);
}

function renderCommandPalette() {
  const overlay = $("commandPaletteOverlay");
  const input = $("commandPaletteInput");
  const resultsBox = $("commandPaletteResults");
  const title = $("commandPaletteTitle");
  const footer = $("commandPaletteFooter");
  if (!overlay || !input || !resultsBox) return;

  overlay.classList.toggle("open", commandPaletteOpen);
  if (!commandPaletteOpen) return;

  input.value = commandPaletteQuery;
  const results = getCommandResults();
  commandPaletteActiveIndex = Math.min(commandPaletteActiveIndex, Math.max(0, results.length - 1));
  if (title) {
    title.textContent = commandPaletteQuery
      ? `Search results · ${agencyLabel()}`
      : `Recent / operational commands · ${agencyLabel()}`;
  }
  resultsBox.innerHTML = results.length
    ? results.map((item, index) => `
      <button class="command-${escapeHtml(item.type)} ${item.action === "query" ? "command-query" : ""} ${index === commandPaletteActiveIndex ? "active" : ""}" type="button" onclick="runCommandItem(${index})" onmouseenter="setCommandPaletteActiveIndex(${index})">
        <span>${escapeHtml(item.type)}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.subtitle)}</small>
      </button>
    `).join("")
    : `<div class="command-empty">No matching offers, clients, destinations, or operational commands.</div>`;
  if (footer) footer.textContent = `${roleLabel()} · scoped to ${agencyLabel()} · Enter Open · Esc Close`;
  scrollActiveCommandIntoView();
}

function openCommandPalette() {
  commandPaletteOpen = true;
  commandPaletteQuery = "";
  commandPaletteActiveIndex = 0;
  renderCommandPalette();
  setTimeout(() => $("commandPaletteInput")?.focus(), 0);
}

function closeCommandPalette() {
  commandPaletteOpen = false;
  commandPaletteQuery = "";
  renderCommandPalette();
}

function updateCommandPaletteQuery(value = "") {
  commandPaletteQuery = value;
  commandPaletteActiveIndex = 0;
  renderCommandPalette();
  $("commandPaletteInput")?.focus();
}

function setCommandPaletteActiveIndex(index = 0) {
  commandPaletteActiveIndex = index;
  renderCommandPalette();
}

function scrollActiveCommandIntoView() {
  const active = document.querySelector("#commandPaletteResults button.active");
  if (!active) return;
  active.scrollIntoView({ block: "nearest" });
}

function runCommandItem(index = 0) {
  const item = getCommandResults()[index];
  if (!item) return;
  closeCommandPalette();
  item.run();
}

function getClientOffers(client = {}) {
  const offerIds = new Set(client.offerIds || []);
  return allOffers
    .filter((offer) => offerIds.has(offer.id))
    .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));
}

function getClientActivities(client = {}) {
  const offerIds = new Set(client.offerIds || []);
  return allActivities.filter((activity) => offerIds.has(activity.offerId)).slice(0, 8);
}

function groupClientWarnings(offers = []) {
  const groups = {
    flight: [],
    hotel: [],
    image: [],
    destination: [],
    other: []
  };

  offers.forEach((offer) => {
    getOfferWarnings(offer).forEach((warning) => {
      const kind = classifyWarning(warning);
      const item = {
        destination: offer.destination || "Offer",
        warning
      };

      if (kind === "dates" || kind === "guests") groups.flight.push(item);
      else if (kind === "availability") groups.hotel.push(item);
      else if (kind === "images") groups.image.push(item);
      else if (kind === "destination") groups.destination.push(item);
      else groups.other.push(item);
    });
  });

  return groups;
}

function renderWarningGroup(title, items = []) {
  if (!items.length) return "";
  return `
    <div class="warning-group">
      <h4>${escapeHtml(title)}</h4>
      ${items.slice(0, 6).map((item) => `
        <div class="drawer-warning">
          <span>${escapeHtml(item.destination)}</span>
          <strong>${escapeHtml(displayWarning(item.warning))}</strong>
        </div>
      `).join("")}
      ${items.length > 6 ? `<div class="drawer-more">+${items.length - 6} more</div>` : ""}
    </div>
  `;
}

function showClientOffers(encodedKey = "") {
  const client = getClientByKey(decodeURIComponent(encodedKey));
  if (!client) return;
  const query = client.phone || client.name || "";
  focusOfferSearch(encodeURIComponent(query));
  closeClientDrawer();
}

function renderClientDrawer(clientKey = activeClientKey) {
  const drawer = $("clientDrawer");
  const overlay = $("drawerOverlay");
  if (!drawer || !overlay) return;

  const client = getClientByKey(clientKey);
  if (!client) {
    closeClientDrawer();
    return;
  }

  activeClientKey = client.key;
  if (document.readyState !== "loading") persistNavigationState();
  const offers = getClientOffers(client);
  const activities = getClientActivities(client);
  const booked = offers.filter((offer) => String(offer.status || "").toLowerCase() === "booked").length;
  const lost = offers.filter((offer) => ["lost", "cancelled", "expired"].includes(String(offer.status || "").toLowerCase())).length;
  const avgValue = offers.length ? client.totalValue / offers.length : 0;
  const warningGroups = groupClientWarnings(offers);
  const totalWarnings = Object.values(warningGroups).reduce((sum, group) => sum + group.length, 0);
  const encodedKey = encodeURIComponent(client.key);

  drawer.innerHTML = `
    <div class="drawer-head">
      <div>
        <span>Client CRM</span>
        <h2>${escapeHtml(client.name)}</h2>
        <p>${escapeHtml(client.phone || "No phone")}</p>
      </div>
      <button type="button" onclick="closeClientDrawer()" aria-label="Close client drawer">×</button>
    </div>

    <div class="drawer-risk">
      <div>
        <span>Client risk</span>
        <strong>${client.riskCount ? "High attention" : client.reviewCount ? "Needs review" : "Operationally clean"}</strong>
      </div>
      <button type="button" onclick="showClientOffers('${encodedKey}')">Show client offers</button>
    </div>

    <div class="drawer-grid">
      <div><span>Offers</span><strong>${client.offers}</strong></div>
      <div><span>Total value</span><strong>${formatPrice(client.totalValue)}</strong></div>
      <div><span>Booked</span><strong>${booked}</strong></div>
      <div><span>Review</span><strong>${client.reviewCount}</strong></div>
    </div>

    <div class="drawer-section">
      <h3>Client Snapshot</h3>
      <div class="snapshot-list">
        <div><span>Latest destination</span><strong>${escapeHtml(client.lastDestination || "-")}</strong></div>
        <div><span>Latest period</span><strong>${escapeHtml(client.lastDate || "-")}</strong></div>
        <div><span>Average offer</span><strong>${formatPrice(avgValue)}</strong></div>
        <div><span>Lost / cancelled</span><strong>${lost}</strong></div>
      </div>
    </div>

    <div class="drawer-section">
      <h3>Offer History</h3>
      <div class="drawer-offers">
        ${offers.slice(0, 8).map((offer) => `
          <div class="drawer-offer">
            <div>
              <strong>${escapeHtml(offer.destination || "Untitled")}</strong>
              <span>${escapeHtml(offer.travelDates || "-")}</span>
            </div>
            <div>
              ${qaBadge(offer)}
              <span>${formatPrice(offer.finalPrice || offer.price, offer.currency || "EUR")}</span>
              <div class="drawer-offer-actions">
                <button type="button" onclick="openOfferWorkspace('${escapeHtml(offer.id || "")}', '${encodedKey}')">Work</button>
                <a href="/api/offers/view/${escapeHtml(offer.id || "")}" target="_blank">Open</a>
              </div>
            </div>
          </div>
        `).join("") || `<div class="muted">No offers yet.</div>`}
      </div>
    </div>

    <div class="drawer-section">
      <h3>Warnings</h3>
      ${totalWarnings
        ? [
            renderWarningGroup("Flight Issues", warningGroups.flight),
            renderWarningGroup("Hotel Issues", warningGroups.hotel),
            renderWarningGroup("Image Issues", warningGroups.image),
            renderWarningGroup("Destination Issues", warningGroups.destination),
            renderWarningGroup("Other Review Items", warningGroups.other)
          ].join("")
        : `<div class="muted">No persisted warnings for this client.</div>`}
    </div>

    <div class="drawer-section">
      <h3>Activity</h3>
      <div class="drawer-activity">
        ${activities.map((activity) => `
          <div class="drawer-activity-row">
            <span class="activity-dot activity-${activityTone(activity.type)}"></span>
            <div>
              <strong>${escapeHtml(activityLabel(activity.type))}</strong>
              <span>${escapeHtml(formatActivityTime(activity.timestamp || activity.createdAt))}</span>
            </div>
          </div>
        `).join("") || `<div class="muted">No scoped activity yet.</div>`}
      </div>
    </div>

    <div class="drawer-source">
      Data source: offers / validationWarnings / activities. Read-only operational view.
    </div>
  `;

  drawer.classList.add("open");
  overlay.classList.add("open");
}

function openClientDrawer(encodedKey = "") {
  renderClientDrawer(decodeURIComponent(encodedKey));
}

function closeClientDrawer() {
  activeClientKey = "";
  $("clientDrawer")?.classList.remove("open");
  $("drawerOverlay")?.classList.remove("open");
  persistNavigationState();
}

function getOfferById(id = "") {
  return allOffers.find((offer) => String(offer.id || "") === String(id || "")) || null;
}

function getOfferActivities(offerId = "") {
  return allActivities.filter((activity) => String(activity.offerId || "") === String(offerId || "")).slice(0, 10);
}

function getLatestOfferActivity(offerId = "") {
  return allActivities.find((activity) => String(activity.offerId || "") === String(offerId || "")) || null;
}

function offerWorkspaceWarningGroups(offer = {}) {
  return groupClientWarnings([offer]);
}

function clientKeyFromOffer(offer = {}) {
  const name = String(offer.clientName || "Unnamed client").trim() || "Unnamed client";
  const phone = String(offer.clientPhone || "").trim();
  return `${name.toLowerCase()}|${phone}`;
}

function renderWorkspaceSection(id, title, content) {
  return `
    <div class="workspace-section workspace-panel ${activeWorkspaceTab === id ? "active" : ""}" data-workspace-panel="${escapeHtml(id)}" data-render-mode="${escapeHtml(WORKSPACE_LAZY_FLAGS[id] || "active")}">
      <h3>${escapeHtml(title)}</h3>
      ${content}
    </div>
  `;
}

function renderWorkspaceCommandBar(offer = {}) {
  const id = escapeHtml(offer.id || "");
  const phone = String(offer.clientPhone || "").replace(/\D/g, "");
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(getWhatsAppText(offer.id || ""))}`;

  return `
    <div class="workspace-command-bar" aria-label="Workspace command bar">
      <div class="workspace-command-group primary">
        <a href="/api/offers/view/${id}" target="_blank">Open</a>
        <a href="/api/offers/${id}/pdf" target="_blank">PDF</a>
      </div>
      <div class="workspace-command-group workflow">
        <button type="button" ${capabilityAttrs("offers.update")} onclick="setStatus('${id}', 'sent')">Sent</button>
        <button type="button" ${capabilityAttrs("offers.update")} onclick="setStatus('${id}', 'booked')">Book</button>
      </div>
      <details class="workspace-command-more">
        <summary>More</summary>
        <div>
          <button type="button" ${capabilityAttrs("offers.update")} onclick="setStatus('${id}', 'viewed')">Viewed</button>
          <button type="button" onclick="copyOfferLink('${id}')">Copy</button>
          <a href="${escapeHtml(waLink)}" target="_blank">WhatsApp</a>
          <button type="button" ${capabilityAttrs("offers.update")} onclick="editOfferFromWorkspace('${id}')">Edit</button>
          <button class="danger-action" type="button" ${capabilityAttrs("offers.update")} onclick="setStatus('${id}', 'lost')">Lost</button>
        </div>
      </details>
    </div>
  `;
}

function renderOfferWorkspace(offerId = activeWorkspaceOfferId) {
  const drawer = $("offerWorkspace");
  const overlay = $("workspaceOverlay");
  if (!drawer || !overlay) return;

  const offer = getOfferById(offerId);
  if (!offer) {
    closeOfferWorkspace();
    return;
  }

  activeWorkspaceOfferId = offer.id;
  const warnings = getOfferWarnings(offer);
  const score = qaScore(offer);
  const tone = qaTone(score, warnings);
  const groups = activeWorkspaceTab === "qa"
    ? offerWorkspaceWarningGroups(offer)
    : { flight: [], hotel: [], image: [], destination: [], other: [] };
  const activities = activeWorkspaceTab === "activity" ? getOfferActivities(offer.id) : [];
  const currency = offer.currency || "EUR";
  const flightPrice = getOfferFlightPrice(offer);
  const hotelPrice = getOfferHotelPrice(offer);
  const transferPrice = Number(offer.transferPrice || 0);
  const basePrice = Number(offer.basePrice || flightPrice + hotelPrice + transferPrice);
  const finalPrice = Number(offer.finalPrice || offer.price || 0);
  const margin = Number(offer.margin || (finalPrice - basePrice));
  const flights = Array.isArray(offer.flights) ? offer.flights : [];
  const hotels = Array.isArray(offer.hotels) ? offer.hotels : [];
  const hotelImages = activeWorkspaceTab === "assets"
    ? uniqueHotelImages(hotels.flatMap((hotel) => Array.isArray(hotel.images) ? hotel.images : []), 6)
    : [];
  const rawClientKey = clientKeyFromOffer(offer);
  const clientKey = encodeURIComponent(rawClientKey);
  const returnClientKey = encodeURIComponent(workspaceReturnClientKey || rawClientKey);
  const sourceClient = getClientByKey(workspaceReturnClientKey || rawClientKey);
  const lastActivity = getLatestOfferActivity(offer.id);
  const lastActivityLabel = lastActivity
    ? `${activityLabel(lastActivity.type)} · ${formatActivityTime(lastActivity.timestamp || lastActivity.createdAt)}`
    : "No activity yet";
  const confidenceLabel = tone === "ready" ? "High confidence" : tone === "review" ? "Needs review" : "High risk";
  const qaTiles = activeWorkspaceTab === "qa"
    ? [
        { label: "Flight", count: groups.flight.length },
        { label: "Hotel", count: groups.hotel.length },
        { label: "Images", count: groups.image.length },
        { label: "Other", count: groups.destination.length + groups.other.length }
      ]
    : [];

  drawer.innerHTML = `
    <div class="workspace-head">
      <div class="workspace-head-left">
        <div class="entity-flow">
          <button type="button" onclick="openClientFromWorkspace('${returnClientKey}')">Client</button>
          <span>Offer</span>
          <strong>Workspace</strong>
        </div>
        <div class="workspace-identity">
          <span>Offer Identity</span>
          <h2>${escapeHtml(offer.destination || "Untitled offer")}</h2>
          <p>${escapeHtml(offer.clientName || "-")} · ${escapeHtml(offer.travelDates || "-")}</p>
        </div>
      </div>
      <div class="workspace-head-center">
        <div class="workspace-identity-strip">
          <span>${escapeHtml(agencyLabel())}</span>
          <span>${escapeHtml(roleLabel())}</span>
          ${statusBadge(offer.status)}
          ${qaBadge(offer)}
          <strong class="workspace-score qa-${tone}">QA ${score}</strong>
          <span>${escapeHtml(confidenceLabel)}</span>
        </div>
        <div class="workspace-identity-metrics">
          <div><span>Total value</span><strong>${formatPrice(finalPrice, currency)}</strong></div>
          <div><span>Last activity</span><strong>${escapeHtml(lastActivityLabel)}</strong></div>
        </div>
      </div>
      <div class="workspace-head-right">
        <div class="workspace-context-source">Opened from: <strong>${escapeHtml(sourceClient ? `CLIENT: ${sourceClient.name}` : "Direct workspace")}</strong></div>
        <div class="workspace-head-actions">
          <button type="button" onclick="openClientFromWorkspace('${returnClientKey}')" aria-label="Back to client">←</button>
          <button type="button" onclick="closeOfferWorkspace()" aria-label="Close offer workspace">×</button>
        </div>
      </div>
    </div>

    ${renderWorkspaceCommandBar(offer)}

    <nav class="workspace-nav" aria-label="Offer workspace sections">
      ${["overview", "qa", "pricing", "activity", "assets"].map((tab) => `
        <button class="${activeWorkspaceTab === tab ? "active" : ""}" type="button" onclick="setWorkspaceTab('${tab}')">${escapeHtml(tab[0].toUpperCase() + tab.slice(1))}</button>
      `).join("")}
    </nav>

    ${activeWorkspaceTab === "overview" ? renderWorkspaceSection("overview", "Overview", `
      <div class="workspace-grid">
        <div><span>Client</span><strong>${escapeHtml(offer.clientName || "-")}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(offer.clientPhone || "-")}</strong></div>
        <div><span>Guests</span><strong>${escapeHtml(offer.guests || "-")}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(offer.status || "draft")}</strong></div>
        <div><span>Flight</span><strong>${escapeHtml(flights[0]?.route || offer.flightRoute || "-")}</strong></div>
        <div><span>Hotel</span><strong>${escapeHtml(hotels[0]?.name || offer.hotel || "-")}</strong></div>
      </div>
      <div class="workspace-inline-actions">
        <button type="button" onclick="openClientFromWorkspace('${clientKey}')">Show related client</button>
        <button type="button" onclick="showClientOffersFromWorkspace('${clientKey}')">Show client offers</button>
      </div>
    `) : ""}

    ${activeWorkspaceTab === "qa" ? renderWorkspaceSection("qa", "QA", `
      <div class="workspace-risk risk-${tone}">
        <div>
          <span>${tone === "ready" ? "Safe automation" : tone === "review" ? "Needs review" : "High risk"}</span>
          <strong>${warnings.length} warning${warnings.length === 1 ? "" : "s"}</strong>
        </div>
        <strong>QA ${score}</strong>
      </div>
      <div class="workspace-qa-summary">
        ${qaTiles.map((tile) => `
          <div class="workspace-qa-chip ${tile.count ? "has-issues" : "is-clear"}">
            <span>${escapeHtml(tile.label)}</span>
            <strong>${tile.count}</strong>
          </div>
        `).join("")}
      </div>
      ${warnings.length ? [
        renderWarningGroup("Flight Issues", groups.flight),
        renderWarningGroup("Hotel Issues", groups.hotel),
        renderWarningGroup("Image Issues", groups.image),
        renderWarningGroup("Destination Issues", groups.destination),
        renderWarningGroup("Other Review Items", groups.other)
      ].join("") : `<div class="muted">No persisted warnings for this offer.</div>`}
    `) : ""}

    ${activeWorkspaceTab === "pricing" ? renderWorkspaceSection("pricing", "Pricing", `
      <div class="workspace-price-hero">
        <div>
          <span>Final client price</span>
          <strong>${formatPrice(finalPrice, currency)}</strong>
        </div>
        <small>Base ${formatPrice(basePrice, currency)} · Margin ${formatPrice(margin, currency)}</small>
      </div>
      <div class="workspace-grid pricing-grid">
        <div><span>Flight</span><strong>${formatPrice(flightPrice, currency)}</strong></div>
        <div><span>Hotel</span><strong>${formatPrice(hotelPrice, currency)}</strong></div>
        <div><span>Transfer</span><strong>${formatPrice(transferPrice, currency)}</strong></div>
        <div><span>Base</span><strong>${formatPrice(basePrice, currency)}</strong></div>
        <div><span>Markup</span><strong>${Number(offer.markupPercent || 0).toFixed(2)}%</strong></div>
        <div><span>Margin</span><strong>${formatPrice(margin, currency)}</strong></div>
      </div>
    `) : ""}

    ${activeWorkspaceTab === "activity" ? renderWorkspaceSection("activity", "Activity", `
      <div class="workspace-activity">
        ${activities.map((activity) => `
          <div class="workspace-activity-row">
            <span class="activity-dot activity-${activityTone(activity.type)}"></span>
            <div class="workspace-activity-main">
              <strong>${escapeHtml(activityLabel(activity.type))}</strong>
              <span>${escapeHtml(activity.type || "activity")}</span>
            </div>
            <time>${escapeHtml(formatActivityTime(activity.timestamp || activity.createdAt))}</time>
          </div>
        `).join("") || `<div class="muted">No activity scoped to this offer yet.</div>`}
      </div>
    `) : ""}

    ${activeWorkspaceTab === "assets" ? renderWorkspaceSection("assets", "Assets", `
      <div class="workspace-asset-grid">
        <a class="workspace-asset-card" href="/api/offers/view/${escapeHtml(offer.id)}" target="_blank"><span>Client Page</span><strong>Open</strong></a>
        <a class="workspace-asset-card" href="/api/offers/${escapeHtml(offer.id)}/pdf" target="_blank"><span>Document</span><strong>PDF</strong></a>
        <button class="workspace-asset-card" type="button" onclick="copyOfferLink('${escapeHtml(offer.id)}')"><span>Share Link</span><strong>Copy</strong></button>
      </div>
      <div class="workspace-asset-note">Persisted hotel images: ${hotelImages.length}</div>
      ${hotelImages.length ? `<div class="workspace-images">${hotelImages.map((src) => `<img src="${escapeHtml(src)}" alt="Hotel image" loading="lazy" decoding="async" />`).join("")}</div>` : `<div class="muted">No persisted hotel images.</div>`}
    `) : ""}

    <div class="drawer-source">
      Data source: offers / validationWarnings / activities / persisted assets. Read-only offer workspace.
      Agency scope: ${escapeHtml(agencyLabel())} · Role: ${escapeHtml(roleLabel())} · Active tab: ${escapeHtml(activeWorkspaceTab)} · Render mode: ${escapeHtml(WORKSPACE_LAZY_FLAGS[activeWorkspaceTab] || "active")}
    </div>
  `;

  drawer.classList.add("open");
  overlay.classList.add("open");
  document.body.classList.add("workspace-focus");
  drawer.setAttribute("tabindex", "-1");
  reflectCapabilities(drawer);
  persistNavigationState();
  setTimeout(() => drawer.focus(), 0);
}

function openOfferWorkspace(offerId = "", returnClientKey = "") {
  workspaceReturnClientKey = returnClientKey ? decodeURIComponent(returnClientKey) : activeClientKey;
  if (!["overview", "qa", "pricing", "activity", "assets"].includes(activeWorkspaceTab)) {
    activeWorkspaceTab = "overview";
  }
  renderOfferWorkspace(offerId);
}

function closeOfferWorkspace() {
  activeWorkspaceOfferId = "";
  workspaceReturnClientKey = "";
  $("offerWorkspace")?.classList.remove("open");
  $("workspaceOverlay")?.classList.remove("open");
  document.body.classList.remove("workspace-focus");
  persistNavigationState();
}

function openClientFromWorkspace(encodedKey = "") {
  const key = decodeURIComponent(encodedKey || "");
  closeOfferWorkspace();
  openClientDrawer(encodeURIComponent(key));
}

function showClientOffersFromWorkspace(encodedKey = "") {
  closeOfferWorkspace();
  showClientOffers(encodedKey);
}

function setWorkspaceTab(tab = "overview") {
  if (!["overview", "qa", "pricing", "activity", "assets"].includes(tab)) return;
  activeWorkspaceTab = tab;
  persistNavigationState();
  renderOfferWorkspace(activeWorkspaceOfferId);
}

async function editOfferFromWorkspace(id = "") {
  closeOfferWorkspace();
  await editOffer(id);
}

function handleEntityFlowKeydown(event) {
  const isCommandK = (event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "k";
  if (isCommandK) {
    event.preventDefault();
    openCommandPalette();
    return;
  }

  if (commandPaletteOpen && event.key === "Enter") {
    event.preventDefault();
    runCommandItem(commandPaletteActiveIndex);
    return;
  }

  if (commandPaletteOpen && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    const results = getCommandResults();
    if (!results.length) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    commandPaletteActiveIndex = (commandPaletteActiveIndex + direction + results.length) % results.length;
    renderCommandPalette();
    return;
  }

  if (commandPaletteOpen && event.key === "Escape") {
    event.preventDefault();
    closeCommandPalette();
    return;
  }

  if (activeWorkspaceOfferId && event.key === "Tab") {
    const workspace = $("offerWorkspace");
    const focusable = Array.from(workspace?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (event.key !== "Escape") return;
  if (activeWorkspaceOfferId) {
    closeOfferWorkspace();
    return;
  }
  if (activeClientKey) {
    closeClientDrawer();
  }
}

function renderOffers() {
  const box = $("offersBox");
  if (!box) return;

  if (!allOffers.length) {
    box.innerHTML = `<div class="muted">No offers yet.</div>`;
    return;
  }

  const offers = allOffers.filter(offerMatchesFilters);

  if (!offers.length) {
    box.innerHTML = `${renderOperationalFilterBanner()}<div class="muted">No offers match this filter.</div>`;
    return;
  }

  if (offerViewMode === "kanban") {
    box.innerHTML = `${renderOperationalFilterBanner()}${renderKanbanOffers(offers)}`;
    reflectCapabilities(box);
    return;
  }

  box.innerHTML = renderOperationalFilterBanner() + offers
    .map((offer) => {
      const currency = offer.currency || "EUR";
      const id = escapeHtml(offer.id || "");
      const clientLink = `/api/offers/view/${id}`;
      const pdfLink = `/api/offers/${id}/pdf`;
      const finalPrice = Number(offer.finalPrice || offer.price || 0);
      const score = qaScore(offer);
      const warnings = getOfferWarnings(offer);
      const tone = qaTone(score, warnings);
      const warningLabel = warnings.length ? `${warnings.length} review item${warnings.length === 1 ? "" : "s"}` : "Clean";

      return `
        <div class="offer qa-card-${tone}" ondblclick="openOfferWorkspace('${id}')">
          <div class="offer-head">
            <div class="offer-title">
              <strong>${escapeHtml(offer.destination || "Untitled offer")}</strong>
              <span>${id || "-"}</span>
            </div>
            <div class="offer-badges">
              ${statusBadge(offer.status)}
              ${qaBadge(offer)}
            </div>
          </div>

          <div class="offer-summary-line">
            <span>${escapeHtml(offer.clientName || "-")}</span>
            <span>${escapeHtml(offer.travelDates || "-")}</span>
          </div>

          <div class="offer-compact-meta">
            <strong>${formatPrice(finalPrice, currency)}</strong>
            <span>${escapeHtml(warningLabel)}</span>
          </div>

          <div class="offer-actions primary-actions">
            <button class="primary-action" type="button" onclick="openOfferWorkspace('${id}')">Work</button>
            <a href="${clientLink}" target="_blank">Open</a>
            <a href="${pdfLink}" target="_blank">PDF</a>
          </div>
        </div>
      `;
    })
    .join("");
  reflectCapabilities(box);
}

function renderOperationalFilterBanner() {
  if (operationalCommandFilter === "all") return "";
  const labels = {
    risk: "Risky offers",
    review: "Review offers",
    booked: "Booked offers"
  };

  return `
    <div class="ops-filter-banner">
      <span>${escapeHtml(labels[operationalCommandFilter] || "Operational filter")}</span>
      <button type="button" onclick="applyOperationalCommandFilter('all')">Clear</button>
    </div>
  `;
}

function setOfferViewMode(mode = "list") {
  offerViewMode = mode === "kanban" ? "kanban" : "list";
  document.querySelectorAll("[data-offer-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.offerView === offerViewMode);
  });
  if (document.readyState !== "loading") persistNavigationState();
  renderOffers();
}

async function loadOffers() {
  const box = $("offersBox");
  if (!box) return;

  box.innerHTML = `<div class="muted">Loading...</div>`;

  try {
    const data = await fetchJson("/api/offers");
    allOffers = Array.isArray(data.offers) ? data.offers : [];
    renderClients();
    renderQaSnapshot();
    renderPipelinePreview();
    renderOffers();
  } catch (error) {
    console.error("Offers error:", error);
    box.innerHTML = `<div class="muted">Error loading offers: ${error.message}</div>`;
  }
}

async function copyText(text, label = "Text") {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied.`);
      return;
    }
  } catch (error) {
    console.warn("Clipboard failed:", error);
  }

  prompt(`${label}:`, text);
}

function copyOfferLink(id) {
  copyText(getPublicOfferUrl(id), "Offer link");
}

function copyPdfLink(id) {
  copyText(getPdfOfferUrl(id), "PDF link");
}

function copyWhatsAppText(id) {
  const offer = getOfferById(id);
  const text = getWhatsAppText(offer?.id || id);
  copyText(text, "WhatsApp text");
}

function focusOfferSearch(query) {
  if ($("offerSearch")) {
    $("offerSearch").value = decodeURIComponent(query || "");
    if ($("offerOwnerFilter")) $("offerOwnerFilter").value = "agency";
    operationalCommandFilter = "all";
    persistNavigationState();
    renderOffers();
    renderClients();
    $("offerSearch").focus();
  }
}

function applyOperationalCommandFilter(filter = "all") {
  operationalCommandFilter = ["all", "risk", "review", "booked"].includes(filter) ? filter : "all";
  if ($("offerSearch")) $("offerSearch").value = "";
  if ($("offerOwnerFilter")) $("offerOwnerFilter").value = "agency";
  if ($("offerStatusFilter")) $("offerStatusFilter").value = operationalCommandFilter === "booked" ? "booked" : "all";
  persistNavigationState();
  renderClients();
  renderOffers();
}

function restoreLastWorkspaceFromCommand() {
  const state = readNavigationState();
  if (state.activeWorkspaceOfferId && getOfferById(state.activeWorkspaceOfferId)) {
    workspaceReturnClientKey = state.workspaceReturnClientKey || state.activeClientKey || "";
    activeWorkspaceTab = state.activeWorkspaceTab || "overview";
    openOfferWorkspace(state.activeWorkspaceOfferId, workspaceReturnClientKey);
  }
}

function restoreFilterState() {
  const state = readNavigationState();
  const filters = state.filters || {};

  if ($("offerSearch")) $("offerSearch").value = filters.search || "";
  if ($("offerOwnerFilter")) $("offerOwnerFilter").value = filters.owner || "agency";
  if ($("offerStatusFilter")) $("offerStatusFilter").value = filters.status || "all";
  if (state.offerViewMode) offerViewMode = state.offerViewMode === "kanban" ? "kanban" : "list";
  if (state.operationalCommandFilter) {
    operationalCommandFilter = ["all", "risk", "review", "booked"].includes(state.operationalCommandFilter)
      ? state.operationalCommandFilter
      : "all";
  }
  if (state.opsPanelState && typeof state.opsPanelState === "object") {
    opsPanelState = state.opsPanelState;
  }
  if (state.activeWorkspaceTab && ["overview", "qa", "pricing", "activity", "assets"].includes(state.activeWorkspaceTab)) {
    activeWorkspaceTab = state.activeWorkspaceTab;
  }
}

function bindOpsPanelMemory() {
  document.querySelectorAll("[data-ops-panel]").forEach((panel) => {
    const key = panel.dataset.opsPanel;
    if (!key) return;
    panel.open = Boolean(opsPanelState[key]);
    panel.addEventListener("toggle", () => {
      opsPanelState = {
        ...opsPanelState,
        [key]: panel.open
      };
      persistNavigationState();
    });
  });
}

function restoreNavigationStateAfterLoad() {
  const state = readNavigationState();

  if (state.activeClientKey && getClientByKey(state.activeClientKey)) {
    renderClientDrawer(state.activeClientKey);
  }

  if (state.activeWorkspaceOfferId && getOfferById(state.activeWorkspaceOfferId)) {
    workspaceReturnClientKey = state.workspaceReturnClientKey || state.activeClientKey || "";
    renderOfferWorkspace(state.activeWorkspaceOfferId);
  }
}

async function setStatus(id, status) {
  if (!hasCapability("offers.update")) {
    alert("Your role cannot update offer status.");
    return;
  }

  try {
    await fetchJson(`/api/offers/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    await loadStats();
    await loadOffers();
    if (activeWorkspaceOfferId) renderOfferWorkspace(activeWorkspaceOfferId);
  } catch (error) {
    alert(`Status update failed: ${error.message}`);
  }
}

function firstItem(items) {
  return Array.isArray(items) && items.length ? items[0] : {};
}

function setValue(id, value = "") {
  const el = $(id);
  if (el) el.value = value ?? "";
}

function setEditMode(offerId = null) {
  editingOfferId = offerId;
  const isEditing = Boolean(offerId);
  if (isEditing) setCreateSurfaceOpen(true);

  if ($("formTitle")) $("formTitle").textContent = isEditing ? "Edit Offer" : "Create Offer";
  if ($("editBanner")) {
    $("editBanner").style.display = isEditing ? "block" : "none";
    $("editBanner").textContent = isEditing
      ? `Editing ${offerId}. Update will change this offer instead of creating a new one.`
      : "";
  }
  if ($("saveOfferBtn")) {
    $("saveOfferBtn").textContent = isEditing ? "Update Offer" : "Save Offer";
    $("saveOfferBtn").dataset.capability = isEditing ? "offers.update" : "offers.create";
    $("saveOfferBtn").dataset.capabilityLabel = isEditing ? "Your role cannot update offers" : "Your role cannot create offers";
  }
  if ($("cancelEditBtn")) $("cancelEditBtn").style.display = isEditing ? "inline-block" : "none";
  reflectCapabilities();
  updateCreateSurfaceSummary();
}

function setCreateSurfaceOpen(isOpen = true) {
  createSurfaceOpen = Boolean(isOpen);
  $("createSurface")?.classList.toggle("collapsed", !createSurfaceOpen);
  $("createSurfaceBody")?.setAttribute("aria-hidden", createSurfaceOpen ? "false" : "true");
  if ($("createSurfaceToggle")) $("createSurfaceToggle").textContent = createSurfaceOpen ? "Collapse" : "+ New Offer";
  updateCreateSurfaceSummary();
}

function toggleCreateSurface() {
  setCreateSurfaceOpen(!createSurfaceOpen);
}

function updateCreateSurfaceSummary() {
  const summary = $("createSurfaceSummary");
  if (!summary) return;
  const destination = $("destination")?.value || "No destination";
  const client = $("clientName")?.value || "No client";
  const mode = editingOfferId ? "Editing" : "Ready";
  summary.textContent = createSurfaceOpen ? `${mode}: ${destination} · ${client}` : "Creation surface collapsed";
}

function populateForm(offer = {}) {
  const flight = firstItem(offer.flights || offer.flightOptions);
  const hotel = firstItem(offer.hotels || offer.hotelOptions);
  flights = Array.isArray(offer.flights) && offer.flights.length ? offer.flights.map((item) => ({ ...item })) : (flight.airline || flight.route || flight.price ? [{ ...flight, price: Number(offer.flightPrice || flight.price || 0) }] : []);
  flights = flights.map(normalizeFlightFields);
  hotels = Array.isArray(offer.hotels) && offer.hotels.length
    ? offer.hotels.map((item) => ({ ...item }))
    : (hotel.name || hotel.price ? [{ ...hotel, price: Number(offer.hotelPrice || hotel.price || 0), selected: true }] : []);
  hotels = dedupeHotelOptionImages(hotels);
  const selectedHotelIndex = hotels.findIndex((item) => item.selected);
  hotels = hotels.map((item, index) => ({
    ...item,
    selected: selectedHotelIndex >= 0 ? index === selectedHotelIndex : index === 0
  }));
  renderFlightCards();
  renderHotelCards();

  setValue("clientName", offer.clientName);
  setValue("clientPhone", offer.clientPhone);
  setValue("destination", offer.destination);
  setValue("travelDates", offer.travelDates);
  setValue("guests", offer.guests);
  setValue("status", offer.status || "draft");
  setValue("currency", offer.currency || "EUR");

  setValue("flightAirline", flight.airline);
  setValue("flightRoute", flight.route || offer.flightRoute);
  setValue("flightDeparture", flight.departure);
  setValue("flightArrival", flight.arrival);
  setValue("flightBaggage", flight.baggage);
  setValue("flightNotes", flight.notes);

  setValue("hotelName", hotel.name || offer.hotel);
  setValue("hotelStars", hotel.stars);
  setValue("hotelArea", hotel.area);
  setValue("hotelDistance", hotel.distance);
  setValue("hotelRoom", hotel.room);
  setValue("hotelMeal", hotel.meal);
  setValue("hotelRoomsLeft", hotel.roomsLeft);
  setValue("hotelDescription", hotel.description);
  setValue("hotelImages", Array.isArray(hotel.images) ? hotel.images.join("\n") : "");

  setValue("destinationDescription", offer.destinationDescription);
  setValue("notes", offer.notes);
  setValue("flightPrice", Number(offer.flightPrice || flight.price || 0).toFixed(2));
  setValue("hotelPrice", Number(offer.hotelPrice || hotel.price || 0).toFixed(2));
  setValue("transferPrice", Number(offer.transferPrice || 0).toFixed(2));
  setValue("markupPercent", Number(offer.markupPercent || 0).toFixed(2));
  setValue("finalPrice", offer.finalOverride ? Number(offer.finalPrice || 0).toFixed(2) : "");
  setValue("validForDays", offer.validForDays || 1);
  setValue("customValidUntil", "");

  updateAutoPrice();
}

async function editOffer(id) {
  try {
    const data = await fetchJson(`/api/offers/${id}`);
    populateForm(data.offer || {});
    setEditMode(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    alert(`Edit failed: ${error.message}`);
  }
}

function cancelEdit() {
  setEditMode(null);
  clearForm();
  setCreateSurfaceOpen(false);
}

async function importData() {
  if (!hasCapability("imports.run")) {
    alert("Your role cannot run imports.");
    return;
  }

  const flightUrl = $("flightUrl")?.value.trim() || "";
  const hotelUrl = $("hotelUrl")?.value.trim() || "";

  if (!flightUrl && !hotelUrl) {
    alert("Paste at least one URL.");
    return;
  }

  try {
    const data = await fetchJson("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flightUrl, hotelUrl })
    });

    if (data.flight) {
      if ($("flightRoute")) $("flightRoute").value = data.flight.route || $("flightRoute").value || "";
      if ($("flightAirline")) $("flightAirline").value = data.flight.airline || $("flightAirline").value || "";
      if (data.flight.dates && $("travelDates") && !$("travelDates").value) {
        $("travelDates").value = data.flight.dates;
      }
    }

    if (data.hotel && $("hotelName")) {
      $("hotelName").value = data.hotel.name || $("hotelName").value || "";
    }

    calculatePricing();
    alert("URL data imported.");
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
}

function applyFlightImportResult(data = {}, successMessage = "Flight screenshot imported successfully.") {
    const f = normalizeFlightFields(data.flight || {});
    const flightPrice = getImportedFlightPrice(data, f);
    const importWarnings = getFlightImportWarnings(data);
    const blockingWarnings = getBlockingFlightImportWarnings(f, flightPrice);
    if (blockingWarnings.length) {
      alert(formatBlockedFlightImportMessage(blockingWarnings, importWarnings));
      return false;
    }
    mergeCurrentValidationWarnings(importWarnings);
    console.log("FLIGHT IMPORT RESPONSE:", {
      flightAirline: f.airline,
      flightRoute: f.route,
      flightPrice
    });
    const selectedDestination = getDestinationValue();

    if (!destinationMatchesFlight(selectedDestination, f)) {
      alert(
        `Flight screenshot does not match the selected destination.\n\n` +
        `Destination: ${selectedDestination || "-"}\n` +
        `Flight: ${f?.route || "-"}\n\n` +
        `Import stopped. Select the matching flight screenshot or change Destination.`
      );
      return false;
    }

    if ($("flightAirline")) $("flightAirline").value = f.airline || "";
    if ($("flightRoute")) $("flightRoute").value = f.route || "";
    if ($("mainFlightRoute")) $("mainFlightRoute").value = f.route || "";
    if ($("flightDeparture")) $("flightDeparture").value = f.departure || "";
    if ($("flightArrival")) $("flightArrival").value = f.arrival || "";
    if ($("flightBaggage")) $("flightBaggage").value = f.baggage || "";
    if ($("flightNotes")) $("flightNotes").value = f.notes || "";
    setValue("flightPrice", flightPrice.toFixed(2));
    addFlight({ ...f, price: flightPrice });

    calculatePricing();
    if (shouldReviewFlightImport(data) && importWarnings.length) {
      alert(`Flight screenshot imported, but needs operator review:\n\n${importWarnings.join("\n")}`);
    } else {
      alert(successMessage);
    }
    return true;
}

async function uploadFlightImage() {
  if (!hasCapability("imports.run")) {
    alert("Your role cannot run imports.");
    return;
  }

  const input = $("flightImage");
  const files = Array.from(input?.files || []);

  if (!files.length) {
    alert("Select at least one flight screenshot first.");
    return;
  }

  try {
    const formData = new FormData();
    files.slice(0, 4).forEach((file) => formData.append("image", file));
    formData.append("destination", $("destination")?.value || "");

    const data = await fetchJson("/api/import-image", {
      method: "POST",
      body: formData
    });

    console.log("FLIGHT OCR DATA:", data);
    applyFlightImportResult(data, "Flight screenshot imported successfully.");
  } catch (error) {
    console.error("Flight image import failed:", error);
    alert(`Error: ${error.message}`);
  }
}

function formatGeminiComparisonLine(label, item = {}) {
  return `${label}: parser=${item.parser || item.parser === 0 ? item.parser : "-"} | gemini=${item.gemini || item.gemini === 0 ? item.gemini : "-"} | ${item.match ? "match" : "diff"}`;
}

async function uploadFlightImageGeminiTest() {
  if (!hasCapability("imports.run")) {
    alert("Your role cannot run imports.");
    return;
  }

  const input = $("flightImage");
  const files = Array.from(input?.files || []);

  if (!files.length) {
    alert("Select at least one flight screenshot first.");
    return;
  }

  try {
    const formData = new FormData();
    files.slice(0, 4).forEach((file) => formData.append("image", file));
    formData.append("destination", $("destination")?.value || "");

    const data = await fetchJson("/api/import-image-gemini-test", {
      method: "POST",
      body: formData
    });

    console.log("GEMINI VISION TEST DATA:", data);
    const comparison = data.comparison || {};
    const message = [
      "Gemini Vision Test complete.",
      "",
      formatGeminiComparisonLine("Route", comparison.route),
      formatGeminiComparisonLine("Price", comparison.price),
      `Dates: parser=${(comparison.dates?.parser || []).join(" / ") || "-"} | gemini=${(comparison.dates?.gemini || []).join(" / ") || "-"} | ${comparison.dates?.match ? "present" : "missing"}`,
      formatGeminiComparisonLine("Segments", comparison.segments),
      formatGeminiComparisonLine("Airline", comparison.airline),
      "",
      "Type GEMINI to use Gemini result.",
      "Type PARSER to use parser result.",
      "Cancel = do not apply anything."
    ].join("\n");

    const choice = window.prompt(message, "GEMINI");
    if (choice === null) return;
    const normalizedChoice = String(choice || "").trim().toLowerCase();
    if (!["gemini", "parser"].includes(normalizedChoice)) {
      alert("Gemini Vision Test cancelled. Type GEMINI or PARSER next time.");
      return;
    }

    const selected = normalizedChoice === "gemini"
      ? {
          flight: data.gemini?.flight || {},
          flightPrice: Number(data.gemini?.flight?.price || data.gemini?.canonical?.price || 0) || 0,
          operatorWarnings: [],
          risk: { requiresOperatorReview: false, warnings: [] }
        }
      : {
          flight: data.parser?.flight || {},
          flightPrice: Number(data.parser?.flight?.price || 0) || 0,
          flightConfidence: data.parser?.flightConfidence,
          operatorWarnings: data.parser?.operatorWarnings || []
        };

    applyFlightImportResult(
      selected,
      normalizedChoice === "gemini"
        ? "Gemini Vision result applied to the offer."
        : "Parser result applied to the offer."
    );
  } catch (error) {
    console.error("Gemini Vision Test failed:", error);
    alert(`Gemini Vision Test failed: ${error.message}`);
  }
}

function universalWarningText(warning = "") {
  const text = String(warning || "").trim();
  if (!text) return "";
  if (/price|fare|amount|currency/i.test(text)) return "Проверете цената.";
  if (/date|time|departure|arrival/i.test(text)) return "Проверете датите и часовете.";
  if (/hotel|room|check/i.test(text)) return "Проверете данните за хотела.";
  if (/flight|segment|airport|route/i.test(text)) return "Проверете данните за полета.";
  return text;
}

function renderUniversalTravelReview(data = {}, files = []) {
  latestUniversalTravelIntake = data;
  latestUniversalTravelObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  latestUniversalTravelObjectUrls = files.map((file) => URL.createObjectURL(file));

  const box = $("universalTravelReview");
  if (!box) return;

  const flight = data.offerFlight || {};
  const hotel = data.offerHotel || {};
  const warnings = Array.from(new Set((data.warnings || []).map(universalWarningText).filter(Boolean)));
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const hasFlight = Boolean(flight.route || flight.airline || (flight.outboundSegments || []).length || (flight.inboundSegments || []).length);
  const hasHotel = Boolean(hotel.name || hotel.area || hotel.room || hotel.price);

  box.innerHTML = `
    <div class="upload-box" style="margin-top: 12px;">
      <h3>Universal Intake Review</h3>
      <div class="muted">Test mode. Review and edit before using the result.</div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 12px 0;">
        ${latestUniversalTravelObjectUrls.map((url, index) => `
          <div>
            <img src="${url}" alt="Original screenshot ${index + 1}" style="width:100%; max-height:220px; object-fit:contain; border:1px solid rgba(148,163,184,.35); border-radius:8px; background:#020617;" />
            <div class="muted">${escapeHtml(sources[index]?.sourceType || "unknown")} · ${escapeHtml(sources[index]?.originalFilename || files[index]?.name || `Screenshot ${index + 1}`)}</div>
          </div>
        `).join("")}
      </div>

      ${warnings.length ? `
        <div class="warning" style="margin: 10px 0;">
          ${warnings.map((warning) => `<div>• ${escapeHtml(warning)}</div>`).join("")}
        </div>
      ` : `<div class="muted">Няма критични предупреждения от Gemini.</div>`}

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 12px;">
        <section>
          <h3>Flight Details</h3>
          ${hasFlight ? `
            <label>Airline</label>
            <input id="universalFlightAirline" value="${escapeHtml(flight.airline || "")}" />
            <label>Route</label>
            <input id="universalFlightRoute" value="${escapeHtml(flight.route || "")}" />
            <label>Outbound</label>
            <input id="universalFlightDeparture" value="${escapeHtml(flight.departure || "")}" />
            <label>Inbound</label>
            <input id="universalFlightArrival" value="${escapeHtml(flight.arrival || "")}" />
            <label>Baggage</label>
            <input id="universalFlightBaggage" value="${escapeHtml(flight.baggage || "")}" />
            <label>Flight Price</label>
            <input id="universalFlightPrice" type="number" step="0.01" value="${Number(flight.price || 0)}" />
            ${flight.displayBg?.itineraryText ? `<pre class="flight-segment-summary" style="white-space:pre-wrap; line-height:1.45;">${escapeHtml(flight.displayBg.itineraryText)}</pre>` : ""}
          ` : `<div class="muted">Не е открит видим полет.</div>`}
        </section>

        <section>
          <h3>Hotel Details</h3>
          ${hasHotel ? `
            <label>Hotel Name</label>
            <input id="universalHotelName" value="${escapeHtml(hotel.name || "")}" />
            <label>Area</label>
            <input id="universalHotelArea" value="${escapeHtml(hotel.area || "")}" />
            <label>Room</label>
            <input id="universalHotelRoom" value="${escapeHtml(hotel.room || "")}" />
            <label>Meal</label>
            <input id="universalHotelMeal" value="${escapeHtml(hotel.meal || "")}" />
            <label>Hotel Price</label>
            <input id="universalHotelPrice" type="number" step="0.01" value="${Number(hotel.price || 0)}" />
            <label>Description</label>
            <textarea id="universalHotelDescription" rows="4">${escapeHtml(hotel.description || "")}</textarea>
          ` : `<div class="muted">Не е открит видим хотел.</div>`}
        </section>
      </div>

      <div class="actions" style="margin-top: 12px;">
        <button type="button" onclick="applyUniversalTravelIntakeResult()">Use Result</button>
        <button type="button" class="secondary" onclick="$('universalTravelReview').innerHTML=''">Cancel</button>
      </div>

      <details style="margin-top: 12px;">
        <summary>Admin/debug JSON</summary>
        <pre style="white-space:pre-wrap; max-height:360px; overflow:auto;">${escapeHtml(JSON.stringify({
          intakeId: data.intakeId,
          confidence: data.confidence,
          sources: data.sources,
          flight: data.flight,
          hotel: data.hotel,
          parser: data.parser,
          evidence: data.evidence
        }, null, 2))}</pre>
      </details>
    </div>
  `;
}

function renderUniversalTravelError(error = {}) {
  const box = $("universalTravelReview");
  if (!box) return;
  const stage = error.stage || error.response?.stage || "unknown";
  const reason = error.reason || error.response?.reason || error.message || "Universal Intake failed";
  const details = error.details || error.response?.details || error.message || "-";
  const requestId = error.requestId || error.response?.requestId || "-";
  box.innerHTML = `
    <div class="upload-box warning" style="margin-top: 12px;">
      <h3>Universal Intake Error</h3>
      <p><strong>Stage:</strong><br>${escapeHtml(stage)}</p>
      <p><strong>Reason:</strong><br>${escapeHtml(reason)}</p>
      <p><strong>Details:</strong><br>${escapeHtml(details)}</p>
      <p><strong>Reference:</strong><br>${escapeHtml(requestId)}</p>
    </div>
  `;
}

async function uploadUniversalTravelIntake() {
  if (!hasCapability("imports.run")) {
    alert("Your role cannot run imports.");
    return;
  }

  const input = $("universalTravelImage");
  const files = Array.from(input?.files || []);
  if (!files.length) {
    alert("Select at least one travel screenshot first.");
    return;
  }

  try {
    const formData = new FormData();
    files.slice(0, 8).forEach((file) => formData.append("image", file));
    formData.append("destination", $("destination")?.value || "");

    const data = await fetchJson("/api/universal-travel-intake-gemini-test", {
      method: "POST",
      body: formData
    });

    console.log("UNIVERSAL GEMINI INTAKE DATA:", data);
    renderUniversalTravelReview(data, files.slice(0, 8));
  } catch (error) {
    console.error("Universal Travel Intake failed:", error);
    renderUniversalTravelError(error);
    const stage = error.stage || error.response?.stage || "unknown";
    const reason = error.reason || error.response?.reason || error.message || "Universal Intake failed";
    const details = error.details || error.response?.details || error.message || "-";
    const requestId = error.requestId || error.response?.requestId || "-";
    alert(`Universal Travel Intake failed\n\nStage: ${stage}\nReason: ${reason}\nDetails: ${details}\nReference: ${requestId}`);
  }
}

function applyUniversalTravelIntakeResult() {
  const data = latestUniversalTravelIntake || {};
  const flight = { ...(data.offerFlight || {}) };
  const hotel = { ...(data.offerHotel || {}) };

  if ($("universalFlightAirline")) flight.airline = $("universalFlightAirline").value.trim();
  if ($("universalFlightRoute")) flight.route = $("universalFlightRoute").value.trim();
  if ($("universalFlightDeparture")) flight.departure = $("universalFlightDeparture").value.trim();
  if ($("universalFlightArrival")) flight.arrival = $("universalFlightArrival").value.trim();
  if ($("universalFlightBaggage")) flight.baggage = $("universalFlightBaggage").value.trim();
  if ($("universalFlightPrice")) flight.price = Number($("universalFlightPrice").value || 0);

  if ($("universalHotelName")) hotel.name = $("universalHotelName").value.trim();
  if ($("universalHotelArea")) hotel.area = $("universalHotelArea").value.trim();
  if ($("universalHotelRoom")) hotel.room = $("universalHotelRoom").value.trim();
  if ($("universalHotelMeal")) hotel.meal = $("universalHotelMeal").value.trim();
  if ($("universalHotelPrice")) hotel.price = Number($("universalHotelPrice").value || 0);
  if ($("universalHotelDescription")) hotel.description = $("universalHotelDescription").value.trim();

  if (flight.route || flight.airline || Number(flight.price || 0) > 0) {
    addFlight(flight);
    if ($("flightAirline")) $("flightAirline").value = flight.airline || "";
    if ($("flightRoute")) $("flightRoute").value = flight.route || "";
    if ($("flightDeparture")) $("flightDeparture").value = flight.departure || "";
    if ($("flightArrival")) $("flightArrival").value = flight.arrival || "";
    if ($("flightBaggage")) $("flightBaggage").value = flight.baggage || "";
    if ($("flightNotes")) $("flightNotes").value = flight.notes || "";
    if ($("flightPrice")) $("flightPrice").value = Number(flight.price || 0).toFixed(2);
  }

  if (hotel.name || hotel.area || Number(hotel.price || 0) > 0) {
    addHotel(hotel);
    if ($("hotelName")) $("hotelName").value = hotel.name || "";
    if ($("hotelArea")) $("hotelArea").value = hotel.area || "";
    if ($("hotelRoom")) $("hotelRoom").value = hotel.room || "";
    if ($("hotelMeal")) $("hotelMeal").value = hotel.meal || "";
    if ($("hotelDescription")) $("hotelDescription").value = hotel.description || "";
    if ($("hotelPrice")) $("hotelPrice").value = Number(hotel.price || 0).toFixed(2);
  }

  calculatePricing();
  alert("Universal Travel Intake result applied. Review and save the offer.");
}

function getImportedFlightPrice(data = {}, flight = {}) {
  return Number(
    data.flightPrice ??
    data.price ??
    data.extractedPrice ??
    flight.flightPrice ??
    flight.price ??
    flight.extractedPrice ??
    0
  ) || 0;
}

function getFlightImportWarnings(data = {}) {
  return [...new Set([
    ...(Array.isArray(data.operatorWarnings) ? data.operatorWarnings : []),
    ...(Array.isArray(data?.risk?.warnings) ? data.risk.warnings : []),
    ...(Array.isArray(data?.flightConfidence?.risk?.warnings) ? data.flightConfidence.risk.warnings : [])
  ].map((warning) => String(warning || "").trim()).filter(Boolean))];
}

function mergeCurrentValidationWarnings(warnings = []) {
  const existing = Array.isArray(window.currentValidationWarnings)
    ? window.currentValidationWarnings
    : [];
  window.currentValidationWarnings = [...new Set([
    ...existing,
    ...warnings.map((warning) => String(warning || "").trim()).filter(Boolean)
  ])];
  return window.currentValidationWarnings;
}

function shouldReviewFlightImport(data = {}) {
  return Boolean(
    data?.risk?.requiresOperatorReview ||
    data?.flightConfidence?.risk?.requiresOperatorReview
  );
}

function getBlockingFlightImportWarnings(flight = {}, flightPrice = 0) {
  const warnings = [];
  if (!String(flight?.route || "").trim()) warnings.push("Маршрутът на полета не е разпознат надеждно.");
  if (!String(flight?.departure || "").trim() || !String(flight?.arrival || "").trim()) {
    warnings.push("Датите или часовете на полета не са разпознати надеждно.");
  }
  if (Number(flightPrice || 0) <= 0) warnings.push("Крайната цена на полета не е разпозната надеждно.");
  return warnings;
}

function formatBlockedFlightImportMessage(blockingWarnings = [], importWarnings = []) {
  const details = [...new Set([
    ...blockingWarnings,
    ...importWarnings
  ].map((warning) => String(warning || "").trim()).filter(Boolean))];
  return [
    "Flight import stopped. Existing flight data was not changed.",
    "",
    ...details.map((warning) => `• ${warning}`),
    "",
    "Използвайте по-ясна снимка или въведете полета ръчно."
  ].join("\n");
}

async function uploadHotelImage() {
  if (!hasCapability("imports.run")) {
    alert("Your role cannot run imports.");
    return;
  }

  const input = $("hotelImage");
  const files = Array.from(input?.files || []);

  if (!files.length) {
    alert("Select at least one hotel screenshot first.");
    return;
  }

  try {
    const formData = new FormData();
    files.slice(0, 4).forEach((file) => formData.append("image", file));
    formData.append("destination", $("destination")?.value || "");

    const data = await fetchJson("/api/import-hotel-image", {
      method: "POST",
      body: formData
    });

    const h = data.hotel || {};
    const hotelImportWarnings = Array.isArray(data.operatorWarnings) ? data.operatorWarnings : [];
    const hotelStayWarnings = getHotelStayMismatchWarnings(
      {
        travelDates: $("travelDates")?.value.trim() || "",
        guests: $("guests")?.value.trim() || ""
      },
      h
    );

    if (hotelStayWarnings.length) {
      const shouldContinue = confirm(
        `${hotelStayWarnings.join("\n")}\n\n` +
        `Hotel: ${h?.name || "-"}\n\n` +
        `Да продължа ли въпреки това?`
      );

      if (!shouldContinue) {
        alert("Hotel import stopped. Please check guests/travel dates or use the matching hotel screenshot.");
        return;
      }
    }

    if ($("hotelName")) $("hotelName").value = h.name || $("hotelName").value || "";
    if ($("hotelStars")) $("hotelStars").value = h.stars || $("hotelStars").value || "";
    if ($("hotelArea")) $("hotelArea").value = h.area || h.location || $("hotelArea").value || "";
    if ($("hotelDistance")) $("hotelDistance").value = h.distance || $("hotelDistance").value || "";
    if ($("hotelRoom")) $("hotelRoom").value = h.room || $("hotelRoom").value || "";
    if ($("hotelMeal")) $("hotelMeal").value = h.meal || $("hotelMeal").value || "";
    if ($("hotelRoomsLeft")) $("hotelRoomsLeft").value = h.roomsLeft || $("hotelRoomsLeft").value || "";
    if ($("hotelDescription")) {
      $("hotelDescription").value = h.description || $("hotelDescription").value || "";
    }

    if (Number(h.price || 0) > 0 && $("hotelPrice")) {
      $("hotelPrice").value = Number(h.price || 0).toFixed(2);
    }
    addHotel(h);

    calculatePricing();
    alert(hotelImportWarnings.length
      ? `Hotel screenshot imported with warning:\n\n${hotelImportWarnings.join("\n")}`
      : "Hotel screenshot imported successfully.");
  } catch (error) {
    console.error("Hotel image import failed:", error);
    alert(`Error: ${error.message}`);
  }
}

function collectForm() {
  updateAutoPrice();

const destinationValue = $("destination")?.value.trim() || "";

const flightForValidation = {
  route: $("flightRoute")?.value.trim() || "",
  airline: $("flightAirline")?.value.trim() || "",
  departure: $("flightDeparture")?.value.trim() || "",
  arrival: $("flightArrival")?.value.trim() || "",
  notes: $("flightNotes")?.value.trim() || ""
};

const hotelForValidation = {
  name: $("hotelName")?.value.trim() || "",
  area: $("hotelArea")?.value.trim() || "",
  room: $("hotelRoom")?.value.trim() || "",
  description: $("hotelDescription")?.value.trim() || ""
};

const formValidationWarnings = [];

formValidationWarnings.push(
  ...getDestinationMismatchWarnings(destinationValue, flightForValidation, hotelForValidation)
);

formValidationWarnings.push(
  ...getHotelStayMismatchWarnings(
    {
      travelDates: $("travelDates")?.value.trim() || "",
      guests: $("guests")?.value.trim() || ""
    },
    hotelForValidation
  )
);

formValidationWarnings.push(
  ...getFlightPassengerMismatchWarnings(
    { guests: $("guests")?.value.trim() || "" },
    flightForValidation
  )
);

formValidationWarnings.push(
  ...(Array.isArray(window.currentValidationWarnings) ? window.currentValidationWarnings : [])
);

  return {
    clientName: $("clientName")?.value.trim() || "",
    clientPhone: $("clientPhone")?.value.trim() || "",
    destination: $("destination")?.value.trim() || "",
    travelDates: $("travelDates")?.value.trim() || "",
    guests: $("guests")?.value.trim() || "",
    status: $("status")?.value || "draft",
    currency: $("currency")?.value.trim() || "EUR",

    flightAirline: $("flightAirline")?.value.trim() || "",
    flightRoute: $("flightRoute")?.value.trim() || "",
    flightDeparture: $("flightDeparture")?.value.trim() || "",
    flightArrival: $("flightArrival")?.value.trim() || "",
    flightBaggage: $("flightBaggage")?.value.trim() || "",
    flightNotes: $("flightNotes")?.value.trim() || "",

    hotelName: $("hotelName")?.value.trim() || "",
    hotelStars: $("hotelStars")?.value.trim() || "",
    hotelArea: $("hotelArea")?.value.trim() || "",
    hotelDistance: $("hotelDistance")?.value.trim() || "",
    hotelRoom: $("hotelRoom")?.value.trim() || "",
    hotelMeal: $("hotelMeal")?.value.trim() || "",
    hotelRoomsLeft: $("hotelRoomsLeft")?.value.trim() || "",
    hotelDescription: $("hotelDescription")?.value.trim() || "",
    hotelImages: uniqueHotelImages(splitLines($("hotelImages")?.value || "")),

    destinationDescription: $("destinationDescription")?.value.trim() || "",
    notes: $("notes")?.value.trim() || "",

    flightPrice: num("flightPrice"),
    hotelPrice: num("hotelPrice"),
    transferPrice: num("transferPrice"),
    basePrice: num("basePrice"),
    markupPercent: num("markupPercent"),
    finalPrice: $("finalPrice")?.value ? Number($("finalPrice").value) : "",

    validForDays: Number($("validForDays")?.value || 1),
    customValidUntil: $("customValidUntil")?.value || "",
    validationWarnings: formValidationWarnings
  };
}

async function saveOffer() {
  const neededCapability = editingOfferId ? "offers.update" : "offers.create";
  if (!hasCapability(neededCapability)) {
    alert("Your role cannot save this offer.");
    return;
  }

  const payload = collectForm();

  payload.flights = flights.map(normalizeFlightFields);
  payload.hotels = dedupeHotelOptionImages(hotels);

  const destinationValue = payload.destination || "";

  const flightForValidation = {
    route: payload.flightRoute || "",
    airline: payload.flightAirline || "",
    departure: payload.flightDeparture || "",
    arrival: payload.flightArrival || "",
    notes: payload.flightNotes || ""
  };

  const hotelForValidation = {
    name: payload.hotelName || payload.hotel || "",
    area: payload.hotelArea || "",
    room: payload.hotelRoom || "",
    description: payload.hotelDescription || ""
  };

const flightText = JSON.stringify(flightForValidation).toLowerCase();
const hotelText = JSON.stringify(hotelForValidation).toLowerCase();

  const validationWarnings = [];

if (
  (flightText && !flightText.includes("needs review")) ||
  (hotelText && !hotelText.includes("needs review"))
) {
  validationWarnings.push(
    ...getDestinationMismatchWarnings(destinationValue, flightForValidation, hotelForValidation)
  );
}

validationWarnings.push(
  ...getHotelStayMismatchWarnings(
    {
      travelDates: payload.travelDates || "",
      guests: payload.guests || ""
    },
    hotelForValidation
  )
);

validationWarnings.push(
  ...getFlightPassengerMismatchWarnings(
    { guests: payload.guests || "" },
    flightForValidation
  )
);

validationWarnings.push(
  ...(Array.isArray(window.currentValidationWarnings) ? window.currentValidationWarnings : [])
);

  payload.validationWarnings = validationWarnings;
console.log("SAVE PAYLOAD WARNINGS:", payload.validationWarnings);

  if (!payload.destination) {
    alert("Destination is required.");
    return;
  }
  try {
    const wasEditing = Boolean(editingOfferId);
    const editId = editingOfferId;

    const result = await fetchJson(wasEditing ? `/api/offers/${editId}` : "/api/offers", {
      method: wasEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    alert(wasEditing ? `Offer updated: ${result.offer.id}` : `Offer saved: ${result.offer.id}`);
    setEditMode(null);
    if (!wasEditing) setCreateSurfaceOpen(false);

    await loadStats();
    await loadOffers();

    if (!wasEditing) {
      window.open(`/api/offers/view/${result.offer.id}`, "_blank");
    }
  } catch (error) {
    alert(`Save failed: ${error.message}`);
  }
}

function formatOperatorFlightSegment(segment = {}) {
  const itinerary = [
    segment.departure || "?",
    segment.from || "?",
    "->",
    segment.arrival || "?",
    segment.to || "?"
  ].join(" ");
  const metadata = [segment.flightNumber, segment.airline, segment.class, segment.duration]
    .filter(Boolean)
    .join(" | ");
  return { itinerary, metadata };
}

function renderOperatorFlightSegments(flight = {}) {
  const bgItinerary = String(flight?.displayBg?.itineraryText || "").trim();
  if (bgItinerary) {
    return `
      <div class="flight-segment-review">
        <div class="flight-segment-review-title">Segment review</div>
        <pre class="flight-segment-summary" style="white-space: pre-wrap; line-height: 1.45;">${escapeHtml(bgItinerary)}</pre>
      </div>
    `;
  }

  const renderDirection = (label, segments = []) => {
    if (!Array.isArray(segments) || !segments.length) return "";

    return `
      <section class="flight-segment-direction">
        <strong>${label}</strong>
        ${segments.map((segment, index) => {
          const formatted = formatOperatorFlightSegment(segment);
          const transfer = index > 0 && segment.transferBefore
            ? `<div class="flight-transfer-badge">Transfer: ${escapeHtml(segment.transferBefore)}</div>`
            : "";
          return `
            ${transfer}
            <div class="flight-segment-row">
              <span>${escapeHtml(formatted.itinerary)}</span>
              ${formatted.metadata ? `<small>${escapeHtml(formatted.metadata)}</small>` : ""}
            </div>
          `;
        }).join("")}
      </section>
    `;
  };

  const outbound = renderDirection("Outbound segments", flight.outboundSegments);
  const inbound = renderDirection("Inbound segments", flight.inboundSegments);
  if (!outbound && !inbound) return "";

  const stopovers = Array.isArray(flight.stopoverAirports) && flight.stopoverAirports.length
    ? `Stopovers: ${flight.stopoverAirports.join(", ")}`
    : "";
  const transferTimes = Array.isArray(flight.transferTimes) && flight.transferTimes.length
    ? `Transfer times: ${flight.transferTimes.join(", ")}`
    : "";
  const summary = [stopovers, transferTimes].filter(Boolean).join(" | ");

  return `
    <div class="flight-segment-review">
      <div class="flight-segment-review-title">Segment review</div>
      ${outbound}
      ${inbound}
      ${summary ? `<div class="flight-segment-summary">${escapeHtml(summary)}</div>` : ""}
    </div>
  `;
}

function renderFlightCards() {
  const box = document.getElementById("flightCards");

  if (!box) return;

  box.innerHTML = flights.map((f, i) => `
    <div class="flight-card">
      <input placeholder="Airline" value="${escapeHtml(f.airline || "")}" onchange="flights[${i}].airline=this.value;updateAutoPrice();" />
      <input placeholder="Route" value="${escapeHtml(f.route || "")}" onchange="flights[${i}].route=this.value;updateAutoPrice();" />
      <input placeholder="Departure" value="${escapeHtml(f.departure || "")}" onchange="flights[${i}].departure=this.value;updateAutoPrice();" />
      <input placeholder="Arrival" value="${escapeHtml(f.arrival || "")}" onchange="flights[${i}].arrival=this.value;updateAutoPrice();" />
      <input placeholder="Baggage" value="${escapeHtml(f.baggage || "")}" onchange="flights[${i}].baggage=this.value;updateAutoPrice();" />
      <input type="number" step="0.01" placeholder="Price" value="${Number(f.price || 0)}" onchange="flights[${i}].price=Number(this.value||0);updateAutoPrice();" />
      <textarea class="flight-notes-field" rows="6" placeholder="Flight Notes" onchange="flights[${i}].notes=this.value;updateAutoPrice();">${escapeHtml(f.notes || "")}</textarea>
      ${renderOperatorFlightSegments(f)}
      <button type="button" onclick="removeFlight(${i})">Remove Flight</button>
    </div>
  `).join("");
}


function removeFlight(index) {
  flights.splice(index, 1);

  renderFlightCards();
  updateAutoPrice();
}

function renderHotelCards() {
  const box = document.getElementById("hotelCards");

  if (!box) return;

  hotels = dedupeHotelOptionImages(hotels);

  box.innerHTML = hotels.map((h, i) => `
    <div class="hotel-card">

      <label>Hotel Name
        <input placeholder="Hotel Name" value="${escapeHtml(h.name || "")}" onchange="hotels[${i}].name=this.value;updateAutoPrice();" />
      </label>
      <label>Stars
        <input placeholder="Not specified" value="${escapeHtml(h.stars || "")}" onchange="hotels[${i}].stars=this.value;updateAutoPrice();" />
      </label>
      <label>Area
        <input placeholder="Not specified" value="${escapeHtml(h.area || "")}" onchange="hotels[${i}].area=this.value;updateAutoPrice();" />
      </label>
      <label>Distance
        <input placeholder="Not specified" value="${escapeHtml(h.distance || "")}" onchange="hotels[${i}].distance=this.value;updateAutoPrice();" />
      </label>
      <label>Room
        <input placeholder="Not specified" value="${escapeHtml(h.room || "")}" onchange="hotels[${i}].room=this.value;updateAutoPrice();" />
      </label>
      <label>Meal
        <input placeholder="Not specified" value="${escapeHtml(h.meal || "")}" onchange="hotels[${i}].meal=this.value;updateAutoPrice();" />
      </label>
      <label>Rooms Left
        <input placeholder="Not specified" value="${escapeHtml(h.roomsLeft || "")}" onchange="hotels[${i}].roomsLeft=this.value;updateAutoPrice();" />
      </label>
      <label>Hotel Price
        <input type="number" step="0.01" placeholder="0.00" value="${Number(h.price || 0)}" onchange="hotels[${i}].price=Number(this.value||0);updateAutoPrice();" />
      </label>

      <label>
        <input
          type="radio"
          name="selectedHotel"
          ${h.selected ? "checked" : ""}
          onchange="
            hotels.forEach(x=>x.selected=false);
            hotels[${i}].selected=true;
            updateAutoPrice();
          "
        />
        Selected
      </label>

      <textarea
        placeholder="Hotel Description"
        onchange="hotels[${i}].description=this.value;updateAutoPrice();"
      >${escapeHtml(h.description || "")}</textarea>
      <textarea
        placeholder="Hotel Image URLs"
        onchange="hotels[${i}].images=uniqueHotelImages(this.value.split('\n').map(x=>x.trim()).filter(Boolean));renderHotelCards();updateAutoPrice();"
      >${escapeHtml(Array.isArray(h.images) ? h.images.join("\n") : "")}</textarea>

      <button
        type="button"
        onclick="removeHotel(${i})"
      >
        Remove
      </button>

    </div>
  `).join("");
}

function addHotel(hotel = {}) {
  hotels.push({
    name: hotel.name || "",
    stars: hotel.stars || "",
    area: hotel.area || "",
    distance: hotel.distance || "",
    room: hotel.room || "",
    meal: hotel.meal || "",
    price: Number(hotel.price || 0),
    roomsLeft: hotel.roomsLeft || "",
    description: hotel.description || "",
    images: uniqueHotelImages(Array.isArray(hotel.images) ? hotel.images : []),
    selected: hotels.length === 0
  });

  renderHotelCards();
  updateAutoPrice();
}

function removeHotel(index) {
  hotels.splice(index, 1);

  if (hotels.length && !hotels.some(h => h.selected)) {
    hotels[0].selected = true;
  }

  renderHotelCards();
  updateAutoPrice();
}

function clearForm() {
  if (editingOfferId) setEditMode(null);

  const ids = [
    "clientName",
    "clientPhone",
    "destination",
    "travelDates",
    "guests",
    "flightUrl",
    "hotelUrl",
    "flightAirline",
    "flightRoute",
    "flightDeparture",
    "flightArrival",
    "flightBaggage",
    "flightNotes",
    "hotelName",
    "hotelStars",
    "hotelArea",
    "hotelDistance",
    "hotelRoom",
    "hotelMeal",
    "hotelRoomsLeft",
    "hotelDescription",
    "hotelImages",
    "destinationDescription",
    "notes",
    "customValidUntil",
    "finalPrice"
  ];

  ids.forEach((id) => {
    if ($(id)) $("" + id).value = "";
  });

  if ($("flightPrice")) $("flightPrice").value = "0";
  if ($("hotelPrice")) $("hotelPrice").value = "0";
  if ($("transferPrice")) $("transferPrice").value = "0";
  if ($("basePrice")) $("basePrice").value = "0";
  if ($("markupPercent")) $("markupPercent").value = "5";
  if ($("currency")) $("currency").value = "EUR";
  if ($("validForDays")) $("validForDays").value = "1";
  if ($("status")) $("status").value = "draft";
  flights = [];
  hotels = [];
  renderFlightCards();
  renderHotelCards();

  calculatePricing();
  updateCreateSurfaceSummary();
}

function bindPricingEvents() {
  ["flightPrice", "hotelPrice", "transferPrice", "markupPercent", "finalPrice", "currency"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", calculatePricing);
  });
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase();
}

function isNoisyFlightDisplay(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 180 ||
    /Baggage The total baggage|Fare rules|Extras you might like|Available in the next steps|Flight time \d/i.test(text);
}

function cleanFlightDisplayField(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || /needs review/i.test(text) || isNoisyFlightDisplay(text)) return "";
  return text;
}

function cleanFlightBaggage(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/checked bags|max weight|carry-on bags|personal items/i.test(text)) {
    const parts = [];
    if (/personal item|personal items/i.test(text)) parts.push("малък личен багаж включен");
    if (/carry-on/i.test(text)) parts.push("ръчен багаж според условията на авиокомпанията");
    if (/checked bag/i.test(text)) parts.push("чекиран багаж според условията на авиокомпанията");
    return [...new Set(parts)].join("; ") || "Багаж според условията на авиокомпанията";
  }
  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

function cleanFlightNotes(value = "") {
  const text = String(value || "")
    .replace(/възрастени/gi, "възрастни")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || /Baggage The total baggage|Fare rules|Extras you might like|Available in the next steps/i.test(text)) {
    return "Полетните часове, багажът и условията се потвърждават финално преди резервация.";
  }

  return text.length > 220 ? `${text.slice(0, 217).trim()}...` : text;
}

function normalizeFlightFields(flight = {}) {
  return {
    ...flight,
    departure: cleanFlightDisplayField(flight.departure || ""),
    arrival: cleanFlightDisplayField(flight.arrival || ""),
    baggage: cleanFlightBaggage(flight.baggage || ""),
    notes: cleanFlightNotes(flight.notes || "")
  };
}

function destinationAlias(value = "") {
  const text = normalizeText(value).trim();

  if (text.includes("rim")) return "rome";
  if (text.includes("prague") || text.includes("praga") || text.includes("praha") || text.includes("prg") || text.includes("прага")) return "prague";
  if (text.includes("milan") || text.includes("milano") || text.includes("милано") || text.includes("mxp") || text.includes("bgy")) return "milan";
  if (text.includes("maldives") || text.includes("maldive") || text.includes("малдив")) return "maldives";
  return text;
}

function destinationPresentationType(destination = "", hotel = {}) {
  const text = normalizeText([
    destination,
    hotel.name,
    hotel.area,
    hotel.room,
    hotel.meal,
    hotel.description
  ].filter(Boolean).join(" "));

  if (/maldiv|atoll|island|остров|resort|water villa|overwater|лагун/.test(text)) return "resort";
  if (/beach|beachfront|плаж|coast|крайбреж|sea view|морска гледка|seaside/.test(text)) return "seaside";
  return "citybreak";
}

function buildGlobalDestinationStory(destinationName = "", type = "citybreak") {
  const name = destinationName.trim() || "Избраната дестинация";

  if (type === "resort") {
    return `${name} предлага спокойна resort атмосфера, красиви природни гледки и условия за пълноценна почивка. Подходящ избор за време край водата, релакс и комфортен престой.`;
  }

  if (type === "seaside") {
    return `${name} съчетава морска атмосфера, време за почивка и възможности за разходки и местни преживявания. Дестинацията е подходяща за спокоен престой и разнообразни дни край морето.`;
  }

  return `${name} предлага възможност да усетите местната атмосфера, кухня и най-характерните части на града. Подходящ избор за city break с време за разходки, култура и местни преживявания.`;
}

function formatDestinationDisplayName(value = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text || text !== text.toLowerCase()) return text;
  return text.replace(/(^|[\s-])([\p{L}])/gu, (_, separator, letter) => `${separator}${letter.toUpperCase()}`);
}

const DESTINATION_QA_PROFILES = [
  {
    key: "tokyo",
    label: "Токио",
    aliases: ["tokyo", "токио", "tokio"],
    airports: ["nrt", "narita", "нарита", "hnd", "haneda", "ханеда"],
    districts: ["minato", "минато", "shinjuku", "шинджуку", "ginza", "гиндза", "shinbashi", "синбаши", "синьбай", "asakusa", "асакуса", "ueno", "уено", "akihabara", "акихабара", "chidoricho", "чидоричо", "hibiya", "хибия"]
  },
  {
    key: "rome",
    label: "Рим",
    aliases: ["rome", "roma", "rim", "рим"],
    airports: ["fco", "fiumicino", "cia", "ciampino"],
    districts: ["trionfale", "triunfale", "трионфале", "триумфале", "prati", "прати", "vatican", "ватикан"]
  },
  {
    key: "maldives",
    label: "Малдиви",
    aliases: ["maldives", "maldive", "малдиви", "малдивски"],
    airports: ["mle", "male", "malé", "мале"],
    districts: ["atoll", "атол", "ari atoll", "ари атол", "himandhoo", "химандху", "maafushi", "маафуши"]
  },
  {
    key: "barcelona",
    label: "Барселона",
    aliases: ["barcelona", "барселона"],
    airports: ["bcn"],
    districts: []
  },
  {
    key: "prague",
    label: "Прага",
    aliases: ["prague", "praga", "praha", "прага"],
    airports: ["prg"],
    districts: ["old town", "stare mesto", "staré město", "стария град", "root"]
  },
  {
    key: "bari",
    label: "Бари",
    aliases: ["bari", "бари"],
    airports: ["bri"],
    districts: []
  }
];

function getDestinationQaProfile(destination = "") {
  const text = normalizeText(destination);
  return DESTINATION_QA_PROFILES.find((profile) =>
    [...profile.aliases, ...profile.airports, ...profile.districts].some((needle) => text.includes(normalizeText(needle)))
  ) || null;
}

function findDestinationQaSignal(profile, value = "", groups = ["aliases", "airports", "districts"]) {
  const text = normalizeText(typeof value === "string" ? value : JSON.stringify(value || {}));
  if (!profile || !text) return null;
  for (const group of groups) {
    const match = (profile[group] || []).find((needle) => text.includes(normalizeText(needle)));
    if (match) return { group, match };
  }
  return null;
}

function displayDestinationQaSignal(signal = {}) {
  const key = normalizeText(signal.match);
  const names = {
    nrt: "NRT",
    narita: "NRT",
    "нарита": "NRT",
    hnd: "HND",
    haneda: "HND",
    "ханеда": "HND",
    fco: "FCO",
    cia: "CIA",
    mle: "MLE",
    male: "MLE",
    "malé": "MLE",
    "мале": "MLE",
    minato: "Минато",
    "минато": "Минато",
    shinjuku: "Шинджуку",
    "шинджуку": "Шинджуку",
    ginza: "Гиндза",
    "гиндза": "Гиндза",
    atoll: "атол",
    "атол": "атол"
  };
  return names[key] || String(signal.match || "").trim();
}

function destinationMatchesFlight(destination, flight = {}) {
  const d = destinationAlias(destination);
  const text = normalizeText(JSON.stringify(flight));

  if (d.includes("rome") || d.includes("рим")) {
    return text.includes("rome") || text.includes("roma") || text.includes("рим") || text.includes("fco") || text.includes("fiumicino");
  }

  if (d.includes("tokyo") || d.includes("токио")) {
    return text.includes("tokyo") || text.includes("nrt") || text.includes("hnd") || text.includes("akihabara");
  }

  if (d.includes("barcelona") || d.includes("барселона")) {
    return text.includes("barcelona") || text.includes("bcn");
  }

  if (d.includes("bari") || d.includes("бари")) {
    return text.includes("bari") || text.includes("bri");
  }

  if (d.includes("maldives") || d.includes("малдив")) {
    return text.includes("maldives") || text.includes("малдив") || text.includes("mle") || text.includes("male") || text.includes("malé") || text.includes("мале");
  }

  return true;
}

function destinationMatchesHotel(destination, hotel = {}) {
  const d = destinationAlias(destination);
  const text = normalizeText(JSON.stringify(hotel));

  if (d.includes("rome") || d.includes("рим")) {
    return (
      text.includes("rome") ||
      text.includes("roma") ||
      text.includes("рим") ||
      text.includes("fiumicino") ||
      text.includes("fco") ||
      text.includes("trionfale") ||
      text.includes("трионфале") ||
      text.includes("triunfale") ||
      text.includes("триумфале") ||
      text.includes("prati") ||
      text.includes("прати") ||
      text.includes("vatican") ||
      text.includes("ватикан")
    );
  }

  if (d.includes("tokyo") || d.includes("токио")) {
    return (
      text.includes("tokyo") ||
      text.includes("токио") ||
      text.includes("akihabara") ||
      text.includes("shinjuku") ||
      text.includes("шинджуку") ||
      text.includes("ginza") ||
      text.includes("гиндза") ||
      text.includes("minato") ||
      text.includes("минато") ||
      text.includes("shinbashi") ||
      text.includes("синбаши") ||
      text.includes("синьбай") ||
      text.includes("asakusa") ||
      text.includes("асакуса") ||
      text.includes("ueno") ||
      text.includes("уено") ||
      text.includes("hibiya") ||
      text.includes("хибия") ||
      text.includes("chidoricho") ||
      text.includes("чидоричо")
    );
  }

  if (d.includes("barcelona") || d.includes("барселона")) {
    return text.includes("barcelona") || text.includes("bcn");
  }

  if (d.includes("bari") || d.includes("бари")) {
    return text.includes("bari");
  }

  if (d.includes("maldives") || d.includes("малдив")) {
    return (
      text.includes("maldives") ||
      text.includes("малдив") ||
      text.includes("mle") ||
      text.includes("male") ||
      text.includes("malé") ||
      text.includes("мале") ||
      text.includes("atoll") ||
      text.includes("атол") ||
      text.includes("himandhoo") ||
      text.includes("химандху")
    );
  }

  return true;
}

function getDestinationMismatchWarnings(destination, flight = {}, hotel = {}) {
  const warnings = [];
  const profile = getDestinationQaProfile(destination);
  const flightSignal = profile ? findDestinationQaSignal(profile, flight, ["aliases", "airports"]) : null;
  const airportSignal = profile ? findDestinationQaSignal(profile, flight, ["airports"]) : null;
  const hotelSignal = profile ? findDestinationQaSignal(profile, hotel, ["aliases", "districts", "airports"]) : null;
  const districtSignal = profile ? findDestinationQaSignal(profile, hotel, ["districts"]) : null;

  if (!destinationMatchesFlight(destination, flight)) {
    warnings.push(
      `[WARNING] Полетът не споменава ясно дестинацията "${destination || "-"}". Проверете маршрута преди изпращане.`
    );
  } else if (profile && airportSignal) {
    warnings.push(
      `[INFO] Полетът каца в ${displayDestinationQaSignal(airportSignal)}, което е разпознато като валидно летище за ${profile.label}. Проверете трансфера до хотела.`
    );
  } else if (profile && flightSignal?.group === "airports") {
    warnings.push(
      `[INFO] Полетът използва ${displayDestinationQaSignal(flightSignal)}, което е валидно за ${profile.label}.`
    );
  }

  if (!destinationMatchesHotel(destination, hotel)) {
    warnings.push(
      `[WARNING] Локацията на хотела не съвпада ясно с основната дестинация "${destination || "-"}". Проверете дали това е търсеният район.`
    );
  } else if (profile && districtSignal) {
    warnings.push(
      `[INFO] Хотелът е в район ${displayDestinationQaSignal(districtSignal)}, който е разпознат като част от ${profile.label}.`
    );
  } else if (profile && hotelSignal?.group === "districts") {
    warnings.push(
      `[INFO] Хотелската локация е разпозната като валидна за ${profile.label}.`
    );
  }

  return warnings;
}

function parseAdultCount(value = "") {
  const text = normalizeText(value);
  const match = text.match(/(\d+)(?:\s*-\s*ма)?\s*(?:adult|adults|възрастен|възрастни)/i);
  return match ? Number(match[1]) : 0;
}

function parseHotelNightCount(hotel = {}) {
  const text = normalizeText(JSON.stringify(hotel));

  if (/1\s*(?:week|седмица)/i.test(text)) return 7;

  const nightMatch = text.match(/(\d+)\s*(?:night|nights|нощ|нощи|нощувка|нощувки)/i);
  if (nightMatch) return Number(nightMatch[1]);

  const weekMatch = text.match(/(\d+)\s*(?:week|weeks|седмица|седмици)/i);
  if (weekMatch) return Number(weekMatch[1]) * 7;

  return 0;
}

function parseOfferNightCount(travelDates = "") {
  const text = String(travelDates || "");
  const matches = [...text.matchAll(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/g)];

  if (matches.length < 2) return 0;

  const nowYear = new Date().getFullYear();
  const startYear = Number(matches[0][3] || matches[1][3] || nowYear);
  const endYear = Number(matches[1][3] || matches[0][3] || nowYear);
  const normalizedStartYear = startYear < 100 ? 2000 + startYear : startYear;
  const normalizedEndYear = endYear < 100 ? 2000 + endYear : endYear;
  const start = new Date(normalizedStartYear, Number(matches[0][2]) - 1, Number(matches[0][1]));
  const end = new Date(normalizedEndYear, Number(matches[1][2]) - 1, Number(matches[1][1]));
  const diff = Math.round((end - start) / 86400000);

  return diff > 0 && diff < 60 ? diff : 0;
}

function getHotelStayMismatchWarnings(offer = {}, hotel = {}) {
  const warnings = [];
  const offerAdults = parseAdultCount(offer.guests);
  const hotelAdults = parseAdultCount(`${hotel.room || ""} ${hotel.description || ""}`);
  const inferredSingleRoomAdults =
    !hotelAdults &&
    offerAdults > 1 &&
    /единична стая|single room/i.test(`${hotel.room || ""} ${hotel.description || ""}`)
      ? 1
      : 0;
  const effectiveHotelAdults = hotelAdults || inferredSingleRoomAdults;

  if (offerAdults && effectiveHotelAdults && offerAdults !== effectiveHotelAdults) {
    warnings.push(`[WARNING] Броят гости в офертата е "${offer.guests || "-"}", но хотелът показва ${effectiveHotelAdults} възрастни. Проверете броя гости.`);
  }

  const offerNights = parseOfferNightCount(offer.travelDates);
  const hotelNights = parseHotelNightCount(hotel);

  if (offerNights && hotelNights && offerNights !== hotelNights) {
    warnings.push(`[WARNING] Офертата е за ${offerNights} нощувки, но хотелският screenshot показва ${hotelNights} нощувки. Проверете периода.`);
  }

  return warnings;
}

function getFlightPassengerMismatchWarnings(offer = {}, flight = {}) {
  const warnings = [];
  const offerAdults = parseAdultCount(offer.guests);
  const flightAdults = parseAdultCount(
    `${flight.airline || ""} ${flight.route || ""} ${flight.departure || ""} ${flight.arrival || ""} ${flight.notes || ""}`
  );

  if (offerAdults && flightAdults && offerAdults !== flightAdults) {
    warnings.push(`[WARNING] Броят гости в офертата е "${offer.guests || "-"}", но полетът показва ${flightAdults} възрастни. Проверете броя пътници.`);
  }

  return warnings;
}

function confirmMismatchWarnings(destination, flight, hotel) {
  const warnings = getDestinationMismatchWarnings(destination, flight, hotel);
  const actionableWarnings = warnings.filter((warning) => warningSeverity(warning) !== "info");

  if (!actionableWarnings.length) return true;

  return confirm(
    `${actionableWarnings.map(displayWarning).join("\n")}\n\n` +
    `Destination: ${destination || "-"}\n` +
    `Flight: ${flight?.route || "-"}\n` +
    `Hotel: ${hotel?.name || "-"}\n\n` +
    `Да продължа ли въпреки това?`
  );
}

function getAutoBuildBlockingMismatchWarnings(destination, flight = {}, hotel = {}) {
  const value = String(destination || "").trim();
  if (!value) return [];

  const flightMatches = destinationMatchesFlight(value, flight);
  const hotelMatches = destinationMatchesHotel(value, hotel);
  const warnings = [];

  if (flightMatches && !hotelMatches) {
    warnings.push(
      `[CRITICAL] Полетът съвпада с "${value}", но хотелът изглежда за друга дестинация. Изберете правилния хотелски screenshot.`
    );
  }

  if (!flightMatches && hotelMatches) {
    warnings.push(
      `[CRITICAL] Хотелът съвпада с "${value}", но полетът изглежда за друга дестинация. Изберете правилния flight screenshot.`
    );
  }

  return warnings;
}

function getDestinationValue() {
  return (
    $("destination")?.value ||
    document.querySelector('[name="destination"]')?.value ||
    ""
  ).trim();
}

async function autoBuildOffer() {
  if (!hasCapability("imports.run")) {
    alert("Your role cannot run imports.");
    return;
  }

  try {
    const flightFiles = Array.from($("flightImage")?.files || []);
    const hotelFiles = Array.from($("hotelImage")?.files || []);

    if (!flightFiles.length) {
      alert("Select at least one flight screenshot first.");
      return;
    }

    if (!hotelFiles.length) {
      alert("Select at least one hotel screenshot first.");
      return;
    }

    // 1) Import flight screenshot
    const flightForm = new FormData();
    flightFiles.slice(0, 4).forEach((file) => flightForm.append("image", file));
    flightForm.append("destination", $("destination")?.value || "");

    const flightData = await fetchJson("/api/import-image", {
      method: "POST",
      body: flightForm
    });

    const f = flightData.flight || {};
    const flightPrice = getImportedFlightPrice(flightData, f);
    const flightImportWarnings = getFlightImportWarnings(flightData);
    const blockingFlightWarnings = getBlockingFlightImportWarnings(f, flightPrice);
    console.log("AUTO FLIGHT IMPORT RESPONSE:", {
      flightAirline: f.airline,
      flightRoute: f.route,
      flightPrice
    });
    if (blockingFlightWarnings.length) {
      alert(formatBlockedFlightImportMessage(blockingFlightWarnings, flightImportWarnings));
      return;
    }

    // 2) Import hotel screenshot
  const hotelForm = new FormData();

hotelFiles.slice(0, 4).forEach((file) => hotelForm.append("image", file));
hotelForm.append("destination", $("destination")?.value || "");

const hotelData = await fetchJson("/api/import-hotel-image", {
  method: "POST",
  body: hotelForm
});

    const h = hotelData.hotel || {};

console.log("AUTO HOTEL DATA:", h);

const selectedDestination = getDestinationValue();

const validationWarnings = [];

validationWarnings.push(...flightImportWarnings);
validationWarnings.push(...(Array.isArray(hotelData.operatorWarnings) ? hotelData.operatorWarnings : []));

validationWarnings.push(
  ...getDestinationMismatchWarnings(selectedDestination, f, h)
);

validationWarnings.push(
  ...getHotelStayMismatchWarnings(
    {
      travelDates: $("travelDates")?.value.trim() || "",
      guests: $("guests")?.value.trim() || ""
    },
    h
  )
);

validationWarnings.push(
  ...getFlightPassengerMismatchWarnings(
    { guests: $("guests")?.value.trim() || "" },
    f
  )
);

const blockingMismatchWarnings = getAutoBuildBlockingMismatchWarnings(selectedDestination, f, h);
if (blockingMismatchWarnings.length) {
  window.currentValidationWarnings = [...validationWarnings, ...blockingMismatchWarnings];
  alert(
    `AUTO BUILD stopped. Провери screenshot-ите преди продължаване.\n\n` +
    blockingMismatchWarnings.map(displayWarning).join("\n") +
    `\n\nDestination: ${selectedDestination || "-"}\n` +
    `Flight: ${f?.route || "-"}\n` +
    `Hotel: ${h?.name || "-"}`
  );
  return;
}

window.currentValidationWarnings = validationWarnings;

if (validationWarnings.length) {
  const shouldContinue = confirm(
    `⚠ Възможно е несъответствие в офертата.\n\n` +
    `Destination: ${selectedDestination || "-"}\n` +
    `Flight: ${f?.route || "-"}\n` +
    `Hotel: ${h?.name || "-"}\n\n` +
    `Да продължа ли въпреки това?`
  );

  if (!shouldContinue) {
    alert("AUTO BUILD stopped. Please check flight/hotel screenshots.");
    return;
  }
}
    if ($("flightAirline")) $("flightAirline").value = f.airline || "";
    if ($("flightRoute")) $("flightRoute").value = f.route || "";
    if ($("flightDeparture")) $("flightDeparture").value = f.departure || "";
    if ($("flightArrival")) $("flightArrival").value = f.arrival || "";
    if ($("flightBaggage")) $("flightBaggage").value = f.baggage || "";
    if ($("flightNotes")) $("flightNotes").value = f.notes || "";
    setValue("flightPrice", flightPrice.toFixed(2));

    if ($("hotelName")) $("hotelName").value = h.name || $("hotelName").value || "";
    if ($("hotelStars")) $("hotelStars").value = h.stars || $("hotelStars").value || "";
    if ($("hotelArea")) $("hotelArea").value = h.area || h.location || $("hotelArea").value || "";
    if ($("hotelDistance")) $("hotelDistance").value = h.distance || $("hotelDistance").value || "";
    if ($("hotelRoom")) $("hotelRoom").value = h.room || $("hotelRoom").value || "";
    if ($("hotelMeal")) $("hotelMeal").value = h.meal || $("hotelMeal").value || "";
    if ($("hotelRoomsLeft")) $("hotelRoomsLeft").value = h.roomsLeft || $("hotelRoomsLeft").value || "";
    if ($("hotelDescription")) $("hotelDescription").value = h.description || $("hotelDescription").value || "";

    if (Number(h.price || 0) > 0 && $("hotelPrice")) {
      $("hotelPrice").value = Number(h.price || 0).toFixed(2);
    }
    addFlight({ ...f, price: flightPrice });
    addHotel(h);

    // 3) Auto destination text
    const destination = $("destination")?.value || "";
    const destinationKey = destinationAlias(destination);
    const destinationNames = {
      rome: "Рим",
      "рим": "Рим",
      bari: "Бари",
      "бари": "Бари",
      barcelona: "Барселона",
      "барселона": "Барселона",
      prague: "Прага",
      praga: "Прага",
      praha: "Прага",
      prg: "Прага",
      "прага": "Прага",
      milan: "Милано",
      milano: "Милано",
      "милано": "Милано",
      mxp: "Милано",
      bgy: "Милано",
      tokyo: "Токио",
      "токио": "Токио",
      maldives: "Малдиви",
      "малдиви": "Малдиви"
    };
    const destinationStories = {
      prague:
        "Прага е град на кули, площади и романтични улици. Само за няколко дни можете да посетите Стария град, Пражкия замък и Карловия мост.\n\nГрадът съчетава средновековна архитектура, гледки към река Вълтава и спокойна атмосфера за кратка европейска почивка.",
      rome:
        "Рим съчетава антична история, впечатляваща архитектура и жива градска атмосфера. Колизеумът, Ватиканът, Фонтанът ди Треви и малките улички около площадите превръщат пътуването в класически city break.",
      barcelona:
        "Барселона комбинира море, архитектура и градска енергия. Гауди, Готическият квартал, плажовете и оживените булеварди я правят отличен избор за кратко европейско пътуване.",
      milan:
        "Милано съчетава елегантна архитектура, италианска мода и оживена градска атмосфера. Дуомото, галерията „Виторио Емануеле II“ и кварталите Брера и Навили превръщат града в отличен избор за стилен city break.",
      tokyo:
        "Токио съчетава модерни квартали, традиционни храмове и впечатляваща градска култура. Градът е подходящ за пътуване с много открития, силна кухня и различни лица във всеки район.",
      maldives:
        "Малдивите са island escape дестинация с кристални лагуни, водни вили и спокойна premium resort атмосфера. Подходящи са за плажна почивка, романтично пътуване и пълен релакс."
    };
    const destinationName = destinationNames[destinationKey] || formatDestinationDisplayName(destination) || "Дестинацията";
    const hotelType = destinationPresentationType(destination, h);
    const hotelHighlights = (window.HOTEL_TAGS?.[hotelType] || [])
      .map(item => `• ${item}`)
      .join("\n");

    if ($("destinationDescription")) {
      const baseDescription =
        window.DESTINATION_DESCRIPTIONS?.[destinationKey] ||
        destinationStories[destinationKey] ||
        buildGlobalDestinationStory(destinationName, hotelType);

      $("destinationDescription").value =
        `${baseDescription.trim()}\n\n` +
        `Офертата комбинира удобен полет, подбрани варианти за настаняване ` +
        `и ясна крайна цена, без скрити вътрешни разбивки за клиента.` +
        (hotelHighlights ? `\n\nНастаняването е подбрано за:\n${hotelHighlights}` : "");
    }

    // 4) Auto notes
    if ($("notes") && !$("notes").value) {
      $("notes").value =
        `Офертата е подбрана според наличните полетни и хотелски условия. ` +
        `Препоръчваме потвърждение възможно най-скоро, тъй като местата и цените подлежат на промяна.`;
    }

    calculatePricing();

    alert("GT63 AUTO BUILD completed. Review and click Save Offer.");
  } catch (error) {
    console.error("AUTO BUILD failed:", error);
    alert(`AUTO BUILD failed: ${error.message}`);
  }
}

window.importData = importData;
window.uploadFlightImage = uploadFlightImage;
window.uploadFlightImageGeminiTest = uploadFlightImageGeminiTest;
window.uploadUniversalTravelIntake = uploadUniversalTravelIntake;
window.applyUniversalTravelIntakeResult = applyUniversalTravelIntakeResult;
window.uploadHotelImage = uploadHotelImage;
window.autoBuildOffer = autoBuildOffer;
window.saveOffer = saveOffer;
window.clearForm = clearForm;
window.setStatus = setStatus;
window.logout = logout;
window.editOffer = editOffer;
window.cancelEdit = cancelEdit;
window.copyOfferLink = copyOfferLink;
window.copyPdfLink = copyPdfLink;
window.copyWhatsAppText = copyWhatsAppText;
window.focusOfferSearch = focusOfferSearch;
window.setOfferViewMode = setOfferViewMode;
window.openClientDrawer = openClientDrawer;
window.closeClientDrawer = closeClientDrawer;
window.showClientOffers = showClientOffers;
window.openOfferWorkspace = openOfferWorkspace;
window.closeOfferWorkspace = closeOfferWorkspace;
window.openClientFromWorkspace = openClientFromWorkspace;
window.showClientOffersFromWorkspace = showClientOffersFromWorkspace;
window.setWorkspaceTab = setWorkspaceTab;
window.editOfferFromWorkspace = editOfferFromWorkspace;
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.updateCommandPaletteQuery = updateCommandPaletteQuery;
window.runCommandItem = runCommandItem;
window.setCommandPaletteActiveIndex = setCommandPaletteActiveIndex;
window.applyOperationalCommandFilter = applyOperationalCommandFilter;
window.toggleCreateSurface = toggleCreateSurface;
window.setCreateSurfaceOpen = setCreateSurfaceOpen;

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadCurrentUser();
    await loadAgencyContext();
  } catch (e) {
    console.error("LOAD USER ERROR:", e);
  }

  try {
    bindPricingEvents();
    restoreFilterState();
    $("offerSearch")?.addEventListener("input", () => {
      persistNavigationState();
      renderClients();
      renderOffers();
    });
    $("offerStatusFilter")?.addEventListener("change", () => {
      persistNavigationState();
      renderClients();
      renderOffers();
    });
    $("offerOwnerFilter")?.addEventListener("change", () => {
      persistNavigationState();
      renderClients();
      renderOffers();
    });
    document.querySelectorAll("[data-offer-view]").forEach((button) => {
      button.addEventListener("click", () => setOfferViewMode(button.dataset.offerView));
    });
    ["clientName", "destination", "travelDates"].forEach((id) => {
      $(id)?.addEventListener("input", updateCreateSurfaceSummary);
    });
    setCreateSurfaceOpen(false);
    bindOpsPanelMemory();
    setOfferViewMode(offerViewMode);
    document.addEventListener("keydown", handleEntityFlowKeydown);
    calculatePricing();
  } catch (e) {
    console.error("INIT FORM ERROR:", e);
  }

  try {
    await loadStats();
  } catch (e) {
    console.error("LOAD STATS ERROR:", e);
  }

  try {
    await loadAirportResolverMetrics();
  } catch (e) {
    console.error("LOAD AIRPORT RESOLVER METRICS ERROR:", e);
  }

  try {
    await loadRegressionLibraryMetrics();
  } catch (e) {
    console.error("LOAD REGRESSION LIBRARY METRICS ERROR:", e);
  }

  try {
    await loadBetaHealthMetrics();
  } catch (e) {
    console.error("LOAD BETA HEALTH METRICS ERROR:", e);
  }

  try {
    await loadOffers();
    restoreNavigationStateAfterLoad();
  } catch (e) {
    console.error("LOAD OFFERS ERROR:", e);
  }

  try {
    await loadActivities();
  } catch (e) {
    console.error("LOAD ACTIVITIES ERROR:", e);
  }
});

document
  .getElementById("addFlightBtn")
  ?.addEventListener("click", () => addFlight());

document
  .getElementById("addHotelBtn")
  ?.addEventListener("click", () => addHotel());

renderFlightCards();
renderHotelCards();

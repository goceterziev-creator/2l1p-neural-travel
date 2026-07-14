"use strict";

const productProvider = window.GT63CoreDataProvider;
const proposalInputAdapter = window.GT63ProposalInputAdapter;
const luxuryRenderer = window.GT63LuxuryV11Renderer;

const nodes = {
  form: document.getElementById("proposalForm"),
  clientName: document.getElementById("clientName"),
  destination: document.getElementById("destination"),
  travelDates: document.getElementById("travelDates"),
  screenshots: document.getElementById("screenshots"),
  providerMode: document.getElementById("providerMode"),
  fixtureField: document.getElementById("fixtureField"),
  fixtureSelect: document.getElementById("fixtureSelect"),
  endpointField: document.getElementById("endpointField"),
  liveEndpoint: document.getElementById("liveEndpoint"),
  currentStep: document.getElementById("currentStep"),
  readinessBadge: document.getElementById("readinessBadge"),
  gateMessage: document.getElementById("gateMessage"),
  continueButton: document.getElementById("continueButton"),
  errorPanel: document.getElementById("errorPanel"),
  errorMessage: document.getElementById("errorMessage"),
  flightReview: document.getElementById("flightReview"),
  hotelReview: document.getElementById("hotelReview"),
  warningsReview: document.getElementById("warningsReview"),
  blockingReview: document.getElementById("blockingReview"),
  previewArea: document.getElementById("previewArea")
};

let currentModel = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function valueOrFallback(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function money(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "-";
  return `${amount.toLocaleString("en-US")} EUR`;
}

function routeFromSegments(segments) {
  if (!Array.isArray(segments) || !segments.length) return "";
  const codes = [segments[0].from, ...segments.map((segment) => segment.to)].filter(Boolean);
  return codes.join(" -> ");
}

function renderList(items, emptyText) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<span class="muted">${escapeHtml(emptyText)}</span>`;
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function segmentTitle(segment) {
  return [segment.airline, segment.flightNumber].filter(Boolean).join(" ") || "Flight segment";
}

function segmentHtml(segment) {
  return `
    <div class="segment">
      <div class="segment-title">${escapeHtml(segmentTitle(segment))}</div>
      <div>${escapeHtml(valueOrFallback(segment.from))} &rarr; ${escapeHtml(valueOrFallback(segment.to))}</div>
      <div>${escapeHtml(valueOrFallback(segment.departure))} &rarr; ${escapeHtml(valueOrFallback(segment.arrival))}</div>
      <div class="muted">Duration: ${escapeHtml(valueOrFallback(segment.duration))}</div>
    </div>
  `;
}

function renderFlight(flight) {
  if (!flight) {
    nodes.flightReview.textContent = "No flight data";
    return;
  }

  const outboundSegments = Array.isArray(flight.outboundSegments) ? flight.outboundSegments : [];
  const inboundSegments = Array.isArray(flight.inboundSegments) ? flight.inboundSegments : [];
  const outboundSummary = routeFromSegments(outboundSegments) || flight.departure || "-";
  const inboundSummary = routeFromSegments(inboundSegments) || flight.arrival || "-";

  nodes.flightReview.innerHTML = `
    <div class="summary">
      <div class="summary-row"><span class="label">Airline</span><span>${escapeHtml(valueOrFallback(flight.airline))}</span></div>
      <div class="summary-row"><span class="label">Route</span><span>${escapeHtml(valueOrFallback(flight.route))}</span></div>
      <div class="summary-row"><span class="label">Outbound</span><span>${escapeHtml(valueOrFallback(outboundSummary))}</span></div>
      <div class="summary-row"><span class="label">Inbound</span><span>${escapeHtml(valueOrFallback(inboundSummary))}</span></div>
      <div class="summary-row"><span class="label">Baggage</span><span>${escapeHtml(valueOrFallback(flight.baggage, "No baggage data"))}</span></div>
      <div class="summary-row"><span class="label">Price</span><span>${escapeHtml(money(flight.price))}</span></div>
      <div class="summary-row"><span class="label">Notes</span><span>${escapeHtml(valueOrFallback(flight.notes, "No notes"))}</span></div>
    </div>
    <h3>Outbound segments</h3>
    ${outboundSegments.length ? outboundSegments.map(segmentHtml).join("") : "<p>No outbound segments</p>"}
    <h3>Inbound segments</h3>
    ${inboundSegments.length ? inboundSegments.map(segmentHtml).join("") : "<p>No inbound segments</p>"}
  `;
}

function renderHotel(hotel) {
  if (!hotel) {
    nodes.hotelReview.textContent = "No hotel data";
    return;
  }

  const imageUrl = Array.isArray(hotel.imageUrls) && hotel.imageUrls.length ? hotel.imageUrls[0] : "";
  nodes.hotelReview.innerHTML = `
    ${imageUrl ? `<img class="hotel-image" src="${escapeHtml(imageUrl)}" alt="">` : ""}
    <div class="summary">
      <div class="summary-row"><span class="label">Name</span><span>${escapeHtml(valueOrFallback(hotel.name))}</span></div>
      <div class="summary-row"><span class="label">Stars</span><span>${escapeHtml(valueOrFallback(hotel.stars))}</span></div>
      <div class="summary-row"><span class="label">Area</span><span>${escapeHtml(valueOrFallback(hotel.area))}</span></div>
      <div class="summary-row"><span class="label">Room</span><span>${escapeHtml(valueOrFallback(hotel.room))}</span></div>
      <div class="summary-row"><span class="label">Meal</span><span>${escapeHtml(valueOrFallback(hotel.meal))}</span></div>
      <div class="summary-row"><span class="label">Rooms left</span><span>${escapeHtml(valueOrFallback(hotel.roomsLeft))}</span></div>
      <div class="summary-row"><span class="label">Price</span><span>${escapeHtml(money(hotel.price))}</span></div>
      <div class="summary-row"><span class="label">Description</span><span>${escapeHtml(valueOrFallback(hotel.description, "No description"))}</span></div>
    </div>
  `;
}

function proposalContext() {
  return {
    clientName: nodes.clientName.value.trim(),
    destination: nodes.destination.value.trim(),
    travelDates: nodes.travelDates.value.trim(),
    travelers: ""
  };
}

function renderPreview(model) {
  if (model.readiness !== "ready") {
    nodes.previewArea.className = "disabled-preview";
    nodes.previewArea.textContent = "Preview disabled until readiness is READY.";
    return;
  }

  if (!proposalInputAdapter?.buildProposalInputFromProductModel || !luxuryRenderer?.renderLuxuryProposal) {
    nodes.previewArea.className = "disabled-preview";
    nodes.previewArea.textContent = "V11 proposal renderer unavailable.";
    return;
  }

  nodes.previewArea.className = "preview-shell";
  const proposalInput = proposalInputAdapter.buildProposalInputFromProductModel(model, proposalContext());
  nodes.previewArea.innerHTML = luxuryRenderer.renderLuxuryProposal(proposalInput);
}

function renderGate(model) {
  const ready = model.readiness === "ready";
  nodes.readinessBadge.textContent = ready ? "READY FOR PROPOSAL" : "OPERATOR REVIEW REQUIRED";
  nodes.readinessBadge.className = `readiness ${ready ? "ready" : "review"}`;
  nodes.gateMessage.className = `gate-message ${ready ? "ready-message" : "review-message"}`;
  nodes.gateMessage.innerHTML = ready
    ? "<strong>Continue to Preview</strong><span>This proposal is ready for the next step.</span>"
    : "<strong>Needs operator action</strong><span>Resolve blocking issues before preview.</span>";
  nodes.continueButton.disabled = !ready;
  nodes.currentStep.textContent = ready ? "Preview ready" : "Review required";
}

function renderModel(model) {
  currentModel = model;
  renderFlight(model.flight);
  renderHotel(model.hotel);
  nodes.warningsReview.innerHTML = renderList(model.warnings, "No warnings");
  nodes.blockingReview.innerHTML = renderList(model.blockingIssues, "No blocking issues");
  renderGate(model);
  renderPreview(model);
}

function showError(message) {
  nodes.errorMessage.textContent = message;
  nodes.errorPanel.classList.remove("hidden");
}

function clearError() {
  nodes.errorMessage.textContent = "";
  nodes.errorPanel.classList.add("hidden");
}

function isRelativeEndpoint(endpoint) {
  return endpoint.startsWith("/");
}

function liveEndpointValue() {
  const endpoint = nodes.liveEndpoint.value.trim() || "/api/smart-import";
  if (window.location.protocol === "file:" && isRelativeEndpoint(endpoint)) {
    throw new Error("Live Smart Import needs a server URL. This shell is opened as a local file, so /api/smart-import cannot be reached. Use Fixture mode, or enter a full endpoint URL such as https://2l1p-neural-travel-production.up.railway.app/api/smart-import.");
  }
  return endpoint;
}

function selectedFixtureUrl() {
  const fixtureUrl = nodes.fixtureSelect.value;
  if (window.location.protocol !== "file:" && fixtureUrl.includes("/test/fixtures/smart-import/")) {
    return `/gt63-core/fixtures/smart-import/${fixtureUrl.split("/").pop()}`;
  }
  return fixtureUrl;
}

function syncProviderMode() {
  const live = nodes.providerMode.value === "live";
  nodes.fixtureField.classList.toggle("hidden", live);
  nodes.endpointField.classList.toggle("hidden", !live);
}

async function loadProductModel() {
  clearError();
  if (!productProvider || typeof productProvider.loadProductModel !== "function") {
    throw new Error("Core Data Provider failed");
  }

  if (nodes.providerMode.value === "live") {
    const files = Array.from(nodes.screenshots.files || []);
    if (!files.length) throw new Error("Select at least one screenshot first.");
    return productProvider.loadProductModel({
      provider: "live",
      endpoint: liveEndpointValue(),
      destination: nodes.destination.value || "",
      files
    });
  }

  return productProvider.loadProductModel({
    provider: "fixture",
    fixtureUrl: selectedFixtureUrl()
  });
}

nodes.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    nodes.currentStep.textContent = "Importing";
    const model = await loadProductModel();
    renderModel(model);
  } catch (error) {
    nodes.currentStep.textContent = "Create proposal";
    showError(error.message || "Product model load failed.");
  }
});

nodes.continueButton.addEventListener("click", () => {
  if (!currentModel || currentModel.readiness !== "ready") return;
  document.querySelector(".preview-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

nodes.providerMode.addEventListener("change", syncProviderMode);
syncProviderMode();

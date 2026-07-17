"use strict";

const productProvider = window.GT63CoreDataProvider;
const reviewDraftApi = window.GT63ReviewDraft;
const flightDisplayBg = window.GT63FlightDisplayBg;
const offerEngineAdapter = window.GT63OfferEngineAdapter;
const proposalInputAdapter = window.GT63ProposalInputAdapter;
const proposalRendererRegistry = window.GT63ProposalRendererRegistry;
const templateResolver = window.GT63ProposalTemplateResolver;

const nodes = {
  form: document.getElementById("proposalForm"),
  clientName: document.getElementById("clientName"),
  clientPhone: document.getElementById("clientPhone"),
  destination: document.getElementById("destination"),
  travelDates: document.getElementById("travelDates"),
  guests: document.getElementById("guests"),
  marginPercent: document.getElementById("marginPercent"),
  screenshots: document.getElementById("screenshots"),
  providerMode: document.getElementById("providerMode"),
  fixtureField: document.getElementById("fixtureField"),
  fixtureSelect: document.getElementById("fixtureSelect"),
  endpointField: document.getElementById("endpointField"),
  liveEndpoint: document.getElementById("liveEndpoint"),
  currentStep: document.getElementById("currentStep"),
  missionClient: document.getElementById("missionClient"),
  missionDestination: document.getElementById("missionDestination"),
  missionStatus: document.getElementById("missionStatus"),
  missionValue: document.getElementById("missionValue"),
  missionAction: document.getElementById("missionAction"),
  pricingFinal: document.getElementById("pricingFinal"),
  pricingFlight: document.getElementById("pricingFlight"),
  pricingHotel: document.getElementById("pricingHotel"),
  pricingBase: document.getElementById("pricingBase"),
  pricingMargin: document.getElementById("pricingMargin"),
  readinessBadge: document.getElementById("readinessBadge"),
  gateMessage: document.getElementById("gateMessage"),
  continueButton: document.getElementById("continueButton"),
  errorPanel: document.getElementById("errorPanel"),
  errorMessage: document.getElementById("errorMessage"),
  flightReview: document.getElementById("flightReview"),
  hotelReview: document.getElementById("hotelReview"),
  applyReviewButton: document.getElementById("applyReviewButton"),
  editAgainButton: document.getElementById("editAgainButton"),
  resetReviewButton: document.getElementById("resetReviewButton"),
  addHotelOptionButton: document.getElementById("addHotelOptionButton"),
  reviewState: document.getElementById("reviewState"),
  templateRecommendation: document.getElementById("templateRecommendation"),
  templateReason: document.getElementById("templateReason"),
  templateSelect: document.getElementById("templateSelect"),
  warningsReview: document.getElementById("warningsReview"),
  blockingReview: document.getElementById("blockingReview"),
  previewArea: document.getElementById("previewArea"),
  createOfferButton: document.getElementById("createOfferButton"),
  offerResult: document.getElementById("offerResult")
};

let currentModel = null;
let reviewDraft = null;

function originalModel() {
  return reviewDraft?.originalModel || null;
}

function reviewedModel() {
  return reviewDraft?.reviewedModel || null;
}

function hasManualEdits() {
  return Boolean(reviewDraft?.hasManualEdits);
}

function activeProductModel() {
  if (reviewDraftApi?.activeProductModel && reviewDraft) {
    return reviewDraftApi.activeProductModel(reviewDraft);
  }
  return currentModel;
}

function templateLabel(value) {
  return templateResolver?.templateLabel?.(value) || valueOrFallback(value, "Template to confirm");
}

function resolveProposalTemplate(model = {}, selectedOverride = "") {
  if (!templateResolver?.resolveProposalTemplate) {
    return {
      recommended: "cathedral",
      selected: selectedOverride || model?.proposalTemplate?.selected || "cathedral",
      source: selectedOverride ? "agent_override" : "resolver",
      reason: "Template resolver unavailable."
    };
  }

  const baseModel = selectedOverride
    ? {
      ...model,
      proposalTemplate: {
        ...(model?.proposalTemplate || {}),
        selected: selectedOverride
      }
    }
    : model;
  return templateResolver.resolveProposalTemplate(baseModel);
}

function withResolvedProposalTemplate(model = {}, selectedOverride = "") {
  const template = resolveProposalTemplate(model, selectedOverride);
  return {
    ...model,
    proposalTemplate: template
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

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
  return text && !/^(null|undefined)$/i.test(text) ? text : fallback;
}

function isPhoneLike(value) {
  const text = String(value ?? "").trim();
  const digits = text.replace(/\D/g, "");
  return digits.length >= 7 && digits.length >= Math.max(7, Math.round(text.length * 0.55));
}

const DESTINATION_CONSISTENCY_PROFILES = [
  {
    name: "Tokyo",
    labels: ["tokyo", "токио", "japan", "япония"],
    positive: ["tokyo", "токио", "japan", "япония", "hnd", "nrt", "haneda", "нарита", "ханеда", "osaka", "kix", "itami"],
    negative: ["santiago", "сантяго", "chile", "чили", "scl", "arturo merino benitez", "артуро мерино бенитес", "pudahuel", "tocumen", "токумен", "pty"]
  },
  {
    name: "Santiago",
    labels: ["santiago", "сантяго", "chile", "чили"],
    positive: ["santiago", "сантяго", "chile", "чили", "scl", "arturo merino benitez", "артуро мерино бенитес", "pudahuel", "tocumen", "токумен", "pty"],
    negative: ["tokyo", "токио", "japan", "япония", "hnd", "nrt", "haneda", "нарита", "ханеда"]
  }
];

function normalizeConsistencyText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function destinationProfileFor(destination) {
  const text = normalizeConsistencyText(destination);
  if (!text) return null;
  return DESTINATION_CONSISTENCY_PROFILES.find((profile) =>
    profile.labels.some((label) => text.includes(normalizeConsistencyText(label)))
  ) || null;
}

function destinationEvidenceText(model = {}) {
  const flight = model?.flight || {};
  const outboundSegments = Array.isArray(flight.outboundSegments) ? flight.outboundSegments : [];
  const inboundSegments = Array.isArray(flight.inboundSegments) ? flight.inboundSegments : [];
  const looseSegments = Array.isArray(flight.segments) ? flight.segments : [];
  const segmentText = [...outboundSegments, ...inboundSegments, ...looseSegments]
    .map((segment) => [
      segment.from,
      segment.to,
      segment.departureAirport,
      segment.arrivalAirport,
      segment.departureCity,
      segment.arrivalCity,
      segment.departure,
      segment.arrival
    ].filter(Boolean).join(" "))
    .join(" ");
  const hotelText = hotelOptions(model)
    .map((hotel) => [
      hotel.name,
      hotel.area,
      hotel.location,
      hotel.address,
      hotel.description
    ].filter(Boolean).join(" "))
    .join(" ");
  return normalizeConsistencyText([
    flight.airline,
    flight.route,
    flight.departure,
    flight.arrival,
    flight.notes,
    segmentText,
    hotelText
  ].filter(Boolean).join(" "));
}

function destinationConsistencyIssues(model = activeProductModel()) {
  const profile = destinationProfileFor(proposalContext().destination);
  if (!profile || !model) return [];

  const evidence = destinationEvidenceText(model);
  if (!evidence) return [];

  const hasExpectedEvidence = profile.positive.some((term) => evidence.includes(normalizeConsistencyText(term)));
  const hasConflictingEvidence = profile.negative.some((term) => evidence.includes(normalizeConsistencyText(term)));

  if (hasConflictingEvidence && !hasExpectedEvidence) {
    return [
      `Destination mismatch: offer destination appears to be ${profile.name}, but extracted flight/hotel data points to another destination.`
    ];
  }

  return [];
}

function combinedBlockingIssues(model = activeProductModel()) {
  return Array.from(new Set([
    ...(
      Array.isArray(model?.blockingIssues)
        ? model.blockingIssues
        : []
    ),
    ...destinationConsistencyIssues(model)
  ]));
}

function editInput(path, value, label, type = "text") {
  return `
    <label class="editable-field">
      <span>${escapeHtml(label)}</span>
      <input data-review-path="${escapeHtml(path)}" type="${escapeHtml(type)}" value="${escapeHtml(valueOrFallback(value, ""))}">
    </label>
  `;
}

function editTextarea(path, value, label) {
  return `
    <label class="editable-field editable-field-full">
      <span>${escapeHtml(label)}</span>
      <textarea data-review-path="${escapeHtml(path)}">${escapeHtml(valueOrFallback(value, ""))}</textarea>
    </label>
  `;
}

function money(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "-";
  return `${amount.toLocaleString("en-US")} EUR`;
}

function marginPercent() {
  const value = Number(nodes.marginPercent?.value);
  return Number.isFinite(value) && value >= 0 ? value : 5;
}

function totalBasePrice(model) {
  return Number(model?.flight?.price || 0) + Number(selectedHotel(model)?.price || 0);
}

function finalPrice(model) {
  const base = totalBasePrice(model);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return base * (1 + marginPercent() / 100);
}

function marginAmount(model) {
  const base = totalBasePrice(model);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return base * (marginPercent() / 100);
}

function renderPricing(model = currentModel) {
  const flightPrice = Number(model?.flight?.price || 0);
  const hotelPrice = Number(selectedHotel(model)?.price || 0);
  const base = totalBasePrice(model);
  const margin = marginAmount(model);
  const final = finalPrice(model);

  nodes.pricingFlight.textContent = money(flightPrice);
  nodes.pricingHotel.textContent = money(hotelPrice);
  nodes.pricingBase.textContent = money(base);
  nodes.pricingMargin.textContent = margin > 0 ? `${money(margin)} (${marginPercent()}%)` : `0 EUR (${marginPercent()}%)`;
  nodes.pricingFinal.textContent = money(final);
}

function missionDestination(model) {
  const contextDestination = nodes.destination.value.trim();
  const hotel = selectedHotel(model);
  if (contextDestination && !isPhoneLike(contextDestination)) return contextDestination;
  if (hotel?.area) return hotel.area;
  if (hotel?.name) return hotel.name;
  if (model?.flight?.route) return model.flight.route;
  return "";
}

function hotelOptions(model = {}) {
  if (Array.isArray(model?.hotelOptions) && model.hotelOptions.length) return model.hotelOptions;
  return model?.hotel ? [{ ...model.hotel, selected: true }] : [];
}

function selectedHotel(model = {}) {
  const options = hotelOptions(model);
  return options.find((hotel) => hotel?.selected) || model?.hotel || options[0] || null;
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

function segmentHtml(segment, pathPrefix = "", direction = "", index = 0) {
  const removeButton = direction
    ? `<button class="inline-danger" type="button" data-review-action="remove-segment" data-segment-direction="${escapeHtml(direction)}" data-segment-index="${escapeHtml(index)}">Remove segment</button>`
    : "";
  if (flightDisplayBg?.renderSegmentHtml) {
    const view = flightDisplayBg.segmentView ? flightDisplayBg.segmentView(segment) : null;
    return `
      <div class="segment editable-segment">
        <div class="segment-header">
          <div class="segment-title">${escapeHtml(view?.title || segmentTitle(segment))}</div>
          ${removeButton}
        </div>
        <div class="editable-grid">
          ${editInput(`${pathPrefix}.airline`, segment.airline, "Airline")}
          ${editInput(`${pathPrefix}.flightNumber`, segment.flightNumber, "Flight no.")}
          ${editInput(`${pathPrefix}.from`, segment.from, "From")}
          ${editInput(`${pathPrefix}.to`, segment.to, "To")}
          ${editInput(`${pathPrefix}.departure`, segment.departure, "Departure")}
          ${editInput(`${pathPrefix}.arrival`, segment.arrival, "Arrival")}
          ${editInput(`${pathPrefix}.duration`, segment.duration, "Duration")}
        </div>
        ${view ? `<div class="segment-preview">${escapeHtml(view.route)} · ${escapeHtml(view.date)} · ${escapeHtml(view.time)} · ${escapeHtml(view.duration)}</div>` : ""}
      </div>
    `;
  }
  return `
    <div class="segment">
      <div class="segment-header">
        <div class="segment-title">${escapeHtml(segmentTitle(segment))}</div>
        ${removeButton}
      </div>
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
  const outboundSummary = flightDisplayBg?.routeFromSegments?.(outboundSegments) || routeFromSegments(outboundSegments) || flight.departure || "-";
  const inboundSummary = flightDisplayBg?.routeFromSegments?.(inboundSegments) || routeFromSegments(inboundSegments) || flight.arrival || "-";

  nodes.flightReview.innerHTML = `
    <div class="summary">
      <div class="summary-row editable-summary">${editInput("flight.airline", flight.airline, "Airline")}</div>
      <div class="summary-row editable-summary">${editInput("flight.route", flight.route, "Route")}</div>
      <div class="summary-row"><span class="label">Outbound</span><span>${escapeHtml(valueOrFallback(outboundSummary))}</span></div>
      <div class="summary-row"><span class="label">Inbound</span><span>${escapeHtml(valueOrFallback(inboundSummary))}</span></div>
      <div class="summary-row editable-summary">${editInput("flight.baggage", flight.baggage, "Baggage")}</div>
      <div class="summary-row editable-summary">${editInput("flight.price", flight.price, "Price", "number")}</div>
      <div class="summary-row editable-summary">${editTextarea("flight.notes", flight.notes, "Notes")}</div>
    </div>
    <div class="review-subsection-heading">
      <h3>Outbound segments</h3>
      <button class="inline-action" type="button" data-review-action="add-segment" data-segment-direction="outbound">Add outbound segment</button>
    </div>
    ${outboundSegments.length ? outboundSegments.map((segment, index) => segmentHtml(segment, `flight.outboundSegments.${index}`, "outbound", index)).join("") : "<p>No outbound segments</p>"}
    <div class="review-subsection-heading">
      <h3>Inbound segments</h3>
      <button class="inline-action" type="button" data-review-action="add-segment" data-segment-direction="inbound">Add inbound segment</button>
    </div>
    ${inboundSegments.length ? inboundSegments.map((segment, index) => segmentHtml(segment, `flight.inboundSegments.${index}`, "inbound", index)).join("") : "<p>No inbound segments</p>"}
  `;
}

function renderHotelOption(hotel, index, selected, removable) {
  const hotelImages = Array.isArray(hotel.imageUrls) && hotel.imageUrls.length
    ? hotel.imageUrls
    : Array.isArray(hotel.images)
      ? hotel.images
      : [];
  const imageUrl = hotelImages[0] || "";
  return `
    <article class="hotel-option-card ${selected ? "selected" : ""}">
      <div class="hotel-option-header">
        <label class="hotel-option-selector">
          <input type="radio" name="selectedHotelOption" value="${index}" ${selected ? "checked" : ""}>
          <span>${selected ? "Selected hotel" : `Hotel option ${index + 1}`}</span>
        </label>
        ${removable ? `<button class="inline-danger" type="button" data-review-action="remove-hotel-option" data-hotel-index="${escapeHtml(index)}">Remove hotel</button>` : ""}
      </div>
      ${imageUrl ? `<img class="hotel-image" src="${escapeHtml(imageUrl)}" alt="">` : ""}
      <div class="summary">
        <div class="summary-row editable-summary">${editInput(`hotelOptions.${index}.name`, hotel.name, "Name")}</div>
        <div class="summary-row editable-summary">${editInput(`hotelOptions.${index}.stars`, hotel.stars, "Stars")}</div>
        <div class="summary-row editable-summary">${editInput(`hotelOptions.${index}.area`, hotel.area, "Area")}</div>
        <div class="summary-row editable-summary">${editInput(`hotelOptions.${index}.room`, hotel.room, "Room")}</div>
        <div class="summary-row editable-summary">${editInput(`hotelOptions.${index}.meal`, hotel.meal, "Meal")}</div>
        <div class="summary-row editable-summary">${editInput(`hotelOptions.${index}.roomsLeft`, hotel.roomsLeft, "Rooms left")}</div>
        <div class="summary-row editable-summary">${editInput(`hotelOptions.${index}.price`, hotel.price, "Price", "number")}</div>
        <div class="summary-row editable-summary">${editInput(`hotelOptions.${index}.url`, hotel.url, "Hotel website")}</div>
        <div class="summary-row editable-summary">${editTextarea(`hotelOptions.${index}.description`, hotel.description, "Description")}</div>
      </div>
    </article>
  `;
}

function renderHotels(model) {
  const options = hotelOptions(model);
  if (!options.length) {
    nodes.hotelReview.textContent = "No hotel data";
    return;
  }

  const selectedIndex = Math.max(0, options.findIndex((hotel) => hotel?.selected));
  nodes.hotelReview.innerHTML = options
    .map((hotel, index) => renderHotelOption(hotel, index, index === selectedIndex, options.length > 1))
    .join("");
}

function renderTemplateSelection(model) {
  if (!nodes.templateSelect) return;
  if (!model) {
    nodes.templateRecommendation.textContent = "Load data to evaluate template.";
    nodes.templateReason.textContent = "The agent can confirm or override the recommended presentation.";
    nodes.templateSelect.value = "cathedral";
    nodes.templateSelect.disabled = true;
    return;
  }

  const template = resolveProposalTemplate(model);
  nodes.templateRecommendation.textContent = `${templateLabel(template.recommended)} recommended`;
  nodes.templateReason.textContent = template.source === "agent_override"
    ? `${template.reason} Current selection: ${templateLabel(template.selected)}.`
    : template.reason;
  nodes.templateSelect.value = template.selected;
  nodes.templateSelect.disabled = false;
}

function proposalContext() {
  return {
    clientName: nodes.clientName.value.trim(),
    clientPhone: nodes.clientPhone.value.trim(),
    destination: nodes.destination.value.trim(),
    travelDates: nodes.travelDates.value.trim(),
    travelers: nodes.guests.value.trim(),
    guests: nodes.guests.value.trim(),
    marginPercent: marginPercent()
  };
}

function offerReadinessIssues(model = activeProductModel()) {
  const issues = [];
  const context = proposalContext();

  if (!model || model.readiness !== "ready") {
    issues.push("Product model must be READY before creating an offer.");
  }

  if (!context.clientName) {
    issues.push("Client name is required before creating an offer.");
  }

  if (!context.destination || isPhoneLike(context.destination)) {
    issues.push("Destination is required before creating an offer.");
  }

  if (!context.travelDates) {
    issues.push("Travel dates are required before creating an offer.");
  }

  if (reviewDraft?.status !== "approved") {
    issues.push("Review changes must be approved before creating an offer.");
  }

  return [...issues, ...destinationConsistencyIssues(model)];
}

function renderOfferReadiness(model = activeProductModel()) {
  const issues = offerReadinessIssues(model);
  nodes.createOfferButton.disabled = issues.length > 0;

  if (!model) {
    nodes.offerResult.className = "disabled-preview";
    nodes.offerResult.textContent = "Create Offer is available after import, review approval, and required client context.";
    return;
  }

  if (issues.length > 0) {
    nodes.offerResult.className = "disabled-preview";
    nodes.offerResult.innerHTML = `
      <strong>Offer not ready</strong>
      ${renderList(issues, "No blocking issues")}
    `;
    return;
  }

  nodes.offerResult.className = "disabled-preview";
  nodes.offerResult.textContent = `Ready to create a draft offer in 2L1P. Base: ${money(totalBasePrice(model))}. With margin ${marginPercent()}%: ${money(finalPrice(model))}.`;
}

function renderMission(model = currentModel) {
  const client = nodes.clientName.value.trim();
  const destination = missionDestination(model);
  const ready = model?.readiness === "ready";
  const hasBlockingIssues = Array.isArray(model?.blockingIssues) && model.blockingIssues.length > 0;

  nodes.missionClient.textContent = valueOrFallback(client, "No client");
  nodes.missionDestination.textContent = valueOrFallback(destination, "No destination");
  nodes.missionStatus.textContent = model ? (ready ? "READY" : "REVIEW") : "Not started";
  nodes.missionStatus.className = model ? (ready ? "mission-ready" : "mission-review") : "";
  nodes.missionValue.textContent = model ? money(finalPrice(model)) : "-";
  nodes.missionAction.textContent = !model
    ? "Start Smart Import"
    : ready
      ? "Review and Create Offer"
      : hasBlockingIssues
        ? "Resolve blocking issues"
        : "Review extracted data";
  renderPricing(model);
}

function renderPreview(model) {
  if (model.readiness !== "ready") {
    nodes.previewArea.className = "disabled-preview";
    nodes.previewArea.textContent = "Preview disabled until readiness is READY.";
    return;
  }

  if (!proposalInputAdapter?.buildProposalInputFromProductModel || !proposalRendererRegistry?.renderProposal) {
    nodes.previewArea.className = "disabled-preview";
    nodes.previewArea.textContent = "Proposal renderer registry unavailable.";
    return;
  }

  nodes.previewArea.className = "preview-shell";
  const proposalInput = proposalInputAdapter.buildProposalInputFromProductModel(model, proposalContext());
  nodes.previewArea.innerHTML = proposalRendererRegistry.renderProposal(proposalInput);
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

function renderReviewState() {
  if (!nodes.reviewState) return;
  const approved = reviewDraft?.status === "approved";
  const loaded = Boolean(originalModel());
  nodes.reviewState.className = `review-state ${approved ? "approved" : loaded ? "draft" : "muted"}`;
  nodes.reviewState.textContent = approved
    ? hasManualEdits()
      ? "Approved with manual edits. Preview and Create Offer use operator corrections."
      : "Approved. Preview and Create Offer use the reviewed model."
    : loaded
      ? "Draft review active. Original extraction is preserved until you approve changes."
      : "Load data to create a review draft.";
}

function renderReviewedModel(model) {
  currentModel = model;
  renderMission(model);
  renderFlight(model.flight);
  renderHotels(model);
  renderTemplateSelection(model);
  nodes.warningsReview.innerHTML = renderList(model.warnings, "No warnings");
  nodes.blockingReview.innerHTML = renderList(combinedBlockingIssues(model), "No blocking issues");
  renderGate(model);
  renderPreview(model);
  renderOfferReadiness(model);
  nodes.applyReviewButton.disabled = !originalModel();
  nodes.editAgainButton.disabled = !reviewDraft?.approvedModel;
  nodes.resetReviewButton.disabled = !originalModel();
  nodes.addHotelOptionButton.disabled = !reviewedModel();
  renderReviewState();
}

function renderModel(model) {
  const modelWithTemplate = withResolvedProposalTemplate(model);
  reviewDraft = reviewDraftApi?.createReviewDraft
    ? reviewDraftApi.createReviewDraft(modelWithTemplate)
    : {
      originalModel: deepClone(modelWithTemplate),
      reviewedModel: deepClone(modelWithTemplate),
      approvedModel: null,
      hasManualEdits: false,
      status: "draft"
    };
  renderReviewedModel(reviewedModel());
}

function showError(message) {
  renderMission(currentModel);
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

function coerceReviewValue(path, value) {
  if (/\.price$/.test(path)) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  return valueOrFallback(value, "");
}

function setPath(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const nextPart = parts[index + 1];
    const isIndex = /^\d+$/.test(nextPart);
    if (cursor[part] == null) cursor[part] = isIndex ? [] : {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function draftFromReviewFields() {
  if (!reviewedModel()) return;
  const draft = deepClone(reviewedModel());
  document.querySelectorAll("[data-review-path]").forEach((field) => {
    const path = field.getAttribute("data-review-path");
    setPath(draft, path, coerceReviewValue(path, field.value));
  });
  const selectedHotelInput = document.querySelector("input[name='selectedHotelOption']:checked");
  const selectedIndex = selectedHotelInput ? Number(selectedHotelInput.value) : 0;
  if (Array.isArray(draft.hotelOptions)) {
    draft.hotelOptions = draft.hotelOptions.map((hotel, index) => ({
      ...hotel,
      selected: index === selectedIndex
    }));
    draft.hotel = draft.hotelOptions[selectedIndex] || draft.hotelOptions[0] || null;
  }
  return withResolvedProposalTemplate(draft, nodes.templateSelect?.value || draft.proposalTemplate?.selected);
}

function saveDraftModel(draft) {
  const nextDraft = withResolvedProposalTemplate(draft, draft?.proposalTemplate?.selected || nodes.templateSelect?.value);
  reviewDraft = reviewDraftApi?.updateReviewedModel
    ? reviewDraftApi.updateReviewedModel(reviewDraft, nextDraft)
    : {
      originalModel: originalModel(),
      reviewedModel: nextDraft,
      approvedModel: null,
      hasManualEdits: JSON.stringify(nextDraft) !== JSON.stringify(originalModel()),
      status: "draft"
    };
  currentModel = reviewedModel();
  renderReviewedModel(currentModel);
}

function applyReviewChanges() {
  const draft = draftFromReviewFields();
  if (!draft) return;
  reviewDraft = reviewDraftApi?.approveReviewedModel
    ? reviewDraftApi.approveReviewedModel(reviewDraft, draft)
    : {
      originalModel: originalModel(),
      reviewedModel: draft,
      approvedModel: deepClone(draft),
      hasManualEdits: JSON.stringify(draft) !== JSON.stringify(originalModel()),
      status: "approved"
    };
  currentModel = activeProductModel();
  renderReviewedModel(currentModel);
}

function editApprovedModelAgain() {
  if (!reviewDraft?.approvedModel) return;
  reviewDraft = reviewDraftApi?.updateReviewedModel
    ? reviewDraftApi.updateReviewedModel(reviewDraft, reviewDraft.approvedModel)
    : {
      originalModel: originalModel(),
      reviewedModel: deepClone(reviewDraft.approvedModel),
      approvedModel: null,
      hasManualEdits: JSON.stringify(reviewDraft.approvedModel) !== JSON.stringify(originalModel()),
      status: "draft"
    };
  currentModel = reviewedModel();
  renderReviewedModel(currentModel);
}

function resetReviewToExtracted() {
  const extracted = originalModel();
  if (!extracted) return;
  const modelWithTemplate = withResolvedProposalTemplate(extracted);
  reviewDraft = reviewDraftApi?.createReviewDraft
    ? reviewDraftApi.createReviewDraft(modelWithTemplate)
    : {
      originalModel: deepClone(modelWithTemplate),
      reviewedModel: deepClone(modelWithTemplate),
      approvedModel: null,
      hasManualEdits: false,
      status: "draft"
    };
  currentModel = reviewedModel();
  renderReviewedModel(currentModel);
}

function addHotelOption() {
  const draft = draftFromReviewFields();
  if (!draft) return;
  const base = selectedHotel(draft) || {};
  const options = hotelOptions(draft);
  draft.hotelOptions = [
    ...options.map((hotel, index) => ({ ...hotel, selected: index === 0 && options.every((item) => !item.selected) ? true : hotel.selected === true })),
    {
      ...base,
      name: base.name ? `${base.name} alternative` : "",
      price: base.price || 0,
      selected: false
    }
  ];
  draft.hotel = selectedHotel(draft);
  saveDraftModel(draft);
}

function removeHotelOption(index) {
  const draft = draftFromReviewFields();
  if (!draft) return;
  const options = hotelOptions(draft);
  if (options.length <= 1) return;
  const nextOptions = options.filter((_, optionIndex) => optionIndex !== index);
  const hasSelected = nextOptions.some((hotel) => hotel?.selected);
  draft.hotelOptions = nextOptions.map((hotel, optionIndex) => ({
    ...hotel,
    selected: hasSelected ? hotel.selected === true : optionIndex === 0
  }));
  draft.hotel = selectedHotel(draft);
  saveDraftModel(draft);
}

function emptySegment(seed = {}) {
  return {
    airline: seed.airline || reviewedModel()?.flight?.airline || "",
    flightNumber: "",
    from: seed.to || "",
    to: "",
    departure: "",
    arrival: "",
    duration: ""
  };
}

function segmentListKey(direction) {
  return direction === "inbound" ? "inboundSegments" : "outboundSegments";
}

function addFlightSegment(direction) {
  const draft = draftFromReviewFields();
  if (!draft?.flight) return;
  const key = segmentListKey(direction);
  const segments = Array.isArray(draft.flight[key]) ? draft.flight[key] : [];
  draft.flight[key] = [...segments, emptySegment(segments[segments.length - 1])];
  saveDraftModel(draft);
}

function removeFlightSegment(direction, index) {
  const draft = draftFromReviewFields();
  if (!draft?.flight) return;
  const key = segmentListKey(direction);
  const segments = Array.isArray(draft.flight[key]) ? draft.flight[key] : [];
  draft.flight[key] = segments.filter((_, segmentIndex) => segmentIndex !== index);
  saveDraftModel(draft);
}

function handleReviewAction(event) {
  const button = event.target.closest("[data-review-action]");
  if (!button) return;
  const action = button.getAttribute("data-review-action");
  if (action === "add-segment") {
    addFlightSegment(button.getAttribute("data-segment-direction"));
  }
  if (action === "remove-segment") {
    removeFlightSegment(button.getAttribute("data-segment-direction"), Number(button.getAttribute("data-segment-index")));
  }
  if (action === "remove-hotel-option") {
    removeHotelOption(Number(button.getAttribute("data-hotel-index")));
  }
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

async function createOfferFromCurrentModel() {
  const model = activeProductModel();
  if (!model || model.readiness !== "ready") {
    throw new Error("Create Offer requires READY readiness.");
  }
  const issues = offerReadinessIssues(model);
  if (issues.length > 0) {
    throw new Error(`Offer is not ready: ${issues.join(" ")}`);
  }
  if (!offerEngineAdapter?.buildOfferPayloadFromProductModel) {
    throw new Error("Offer Engine adapter unavailable.");
  }

  const context = proposalContext();
  const payload = offerEngineAdapter.buildOfferPayloadFromProductModel(model, context);
  if (proposalInputAdapter?.buildProposalInputFromProductModel) {
    payload.proposalInput = proposalInputAdapter.buildProposalInputFromProductModel(model, context);
    payload.proposalTemplate = payload.proposalInput.proposalTemplate || payload.proposalTemplate || null;
  }
  const response = await fetch("/api/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data?.error || data?.message || text || `Offer Engine failed (${response.status})`;
    throw new Error(message);
  }
  return data?.offer || data;
}

function renderCreatedOffer(offer) {
  const offerId = offer?.id || offer?.offerId || "";
  const publicLink = offer?.publicLink || (offerId ? `/offer/${encodeURIComponent(offerId)}` : "");
  nodes.offerResult.className = "offer-result";
  nodes.offerResult.innerHTML = `
    <strong>Offer created</strong>
    <span>${escapeHtml(offerId || "Draft offer")}</span>
    <div class="offer-actions">
      ${publicLink ? `<a href="${escapeHtml(publicLink)}" target="_blank" rel="noreferrer">Open Proposal</a>` : ""}
      ${offerId ? `<a href="/admin" target="_blank" rel="noreferrer">Open Admin</a>` : ""}
    </div>
  `;
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
  const model = activeProductModel();
  if (!model || model.readiness !== "ready") return;
  document.querySelector(".preview-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

nodes.createOfferButton.addEventListener("click", async () => {
  let created = false;
  try {
    nodes.createOfferButton.disabled = true;
    nodes.offerResult.className = "disabled-preview";
    nodes.offerResult.textContent = "Creating offer in 2L1P...";
    const offer = await createOfferFromCurrentModel();
    renderCreatedOffer(offer);
    created = true;
  } catch (error) {
    nodes.offerResult.className = "error-panel";
    nodes.offerResult.textContent = error.message || "Create Offer failed.";
  } finally {
    const model = activeProductModel();
    if (created) {
      nodes.createOfferButton.disabled = offerReadinessIssues(model).length > 0;
    } else {
      renderOfferReadiness(model);
    }
  }
});

nodes.providerMode.addEventListener("change", syncProviderMode);
nodes.templateSelect.addEventListener("change", () => {
  const draft = draftFromReviewFields();
  if (!draft) return;
  saveDraftModel(draft);
});
nodes.marginPercent.addEventListener("input", () => {
  if (currentModel) {
    renderReviewedModel(currentModel);
  } else {
    renderMission();
    renderOfferReadiness();
  }
});
[
  nodes.clientName,
  nodes.destination,
  nodes.travelDates,
  nodes.guests
].forEach((node) => node.addEventListener("input", () => {
  const model = activeProductModel() || currentModel;
  renderMission(model);
  if (model) {
    nodes.blockingReview.innerHTML = renderList(combinedBlockingIssues(model), "No blocking issues");
  }
  renderOfferReadiness(model);
}));
nodes.applyReviewButton.addEventListener("click", applyReviewChanges);
nodes.editAgainButton.addEventListener("click", editApprovedModelAgain);
nodes.resetReviewButton.addEventListener("click", resetReviewToExtracted);
nodes.addHotelOptionButton.addEventListener("click", addHotelOption);
document.addEventListener("click", handleReviewAction);
renderMission();
syncProviderMode();

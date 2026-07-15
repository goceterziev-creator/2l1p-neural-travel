"use strict";

(function exposeLuxuryV11Renderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63LuxuryV11Renderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLuxuryV11Renderer() {
  const SUPPORTED_VERSION = "1.0";
  const SUPPORTED_MODE = "GT63_LUXURY_PROPOSAL_INPUT";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function text(value, fallback = "-") {
    const cleaned = String(value ?? "").trim();
    return cleaned || fallback;
  }

  function money(value, currency = "EUR") {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "-";
    return `${number.toLocaleString("en-US")} ${currency || "EUR"}`;
  }

  function assertLuxuryProposalInput(input) {
    if (!input || input.proposalInputVersion !== SUPPORTED_VERSION) {
      throw new Error("Unsupported V11 proposal input version");
    }
    if (input.mode !== SUPPORTED_MODE) {
      throw new Error("Unsupported V11 proposal input mode");
    }
    if (!["ready", "review"].includes(input.readiness)) {
      throw new Error("Unsupported V11 proposal readiness");
    }
    return input;
  }

  function routeLine(segments = []) {
    const display = typeof globalThis !== "undefined" ? globalThis.GT63FlightDisplayBg : null;
    if (display?.routeFromSegments) return display.routeFromSegments(segments);
    if (!Array.isArray(segments) || !segments.length) return "";
    const codes = [segments[0].from, ...segments.map((segment) => segment.to)].filter(Boolean);
    return codes.join(" -> ");
  }

  function segmentCard(segment) {
    const display = typeof globalThis !== "undefined" ? globalThis.GT63FlightDisplayBg : null;
    if (display?.segmentView) {
      const view = display.segmentView(segment);
      return `
        <article class="v11-segment">
          <strong>${escapeHtml(view.title)}</strong>
          <span>${escapeHtml(view.route)}</span>
          <span>${escapeHtml(view.date)}</span>
          <span>${escapeHtml(view.time)}</span>
          <small>${escapeHtml(view.duration)}</small>
        </article>
      `;
    }
    const title = [segment.airline, segment.flightNumber].filter(Boolean).join(" ") || "Flight segment";
    return `
      <article class="v11-segment">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text(segment.from))} &rarr; ${escapeHtml(text(segment.to))}</span>
        <span>${escapeHtml(text(segment.departure))} &rarr; ${escapeHtml(text(segment.arrival))}</span>
        <small>Duration: ${escapeHtml(text(segment.duration))}</small>
      </article>
    `;
  }

  function segmentGroup(label, segments = [], fallback) {
    const route = routeLine(segments) || fallback || "";
    return `
      <section class="v11-itinerary-block">
        <div>
          <p class="v11-kicker">${escapeHtml(label)}</p>
          <h4>${escapeHtml(text(route, "To be confirmed"))}</h4>
        </div>
        <div class="v11-segment-list">
          ${segments.length ? segments.map(segmentCard).join("") : "<p class=\"v11-muted\">No segment data</p>"}
        </div>
      </section>
    `;
  }

  function isUsableImageUrl(value) {
    const url = String(value || "").trim();
    return /^https?:\/\//i.test(url) && !/example\.com/i.test(url);
  }

  function fallbackImage(input) {
    const haystack = [
      input.destination?.name,
      input.destination?.requested,
      input.hotel?.area,
      input.hotel?.name,
      input.content?.heroTitle
    ].filter(Boolean).join(" ").toLowerCase();

    if (/maldives|maldive|мале|малдив/i.test(haystack)) {
      return "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=85";
    }
    if (/tokyo|japan|токио|япония/i.test(haystack)) {
      return "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=85";
    }
    if (/santiago|chile|сантяго|чили/i.test(haystack)) {
      return "https://images.unsplash.com/photo-1531778272849-d1dd22444c06?auto=format&fit=crop&w=1200&q=85";
    }
    return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85";
  }

  function proposalImage(input) {
    const hotelImages = Array.isArray(input.hotel?.imageUrls) ? input.hotel.imageUrls : [];
    return hotelImages.find(isUsableImageUrl) || fallbackImage(input);
  }

  function warningList(items = []) {
    if (!Array.isArray(items) || !items.length) return "";
    return `
      <section class="v11-note">
        <strong>Operator note</strong>
        <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
    `;
  }

  function hotelImage(input) {
    const image = proposalImage(input);
    return `<img class="v11-hotel-image" src="${escapeHtml(image)}" alt="">`;
  }

  function hotelOptionCard(hotel, index, currency) {
    const selected = hotel?.selected || index === 0;
    const imageUrls = Array.isArray(hotel?.imageUrls) ? hotel.imageUrls : [];
    const image = imageUrls.find(isUsableImageUrl);
    return `
      <article class="v11-hotel-option ${selected ? "selected" : ""}">
        ${image ? `<img src="${escapeHtml(image)}" alt="">` : ""}
        <div>
          <span>${selected ? "Selected hotel" : `Hotel option ${index + 1}`}</span>
          <strong>${escapeHtml(text(hotel?.name, "Hotel to confirm"))}</strong>
          <small>${escapeHtml(text(hotel?.area))}</small>
          <small>${escapeHtml(text(hotel?.room))}</small>
        </div>
        <strong>${escapeHtml(money(hotel?.price, currency))}</strong>
      </article>
    `;
  }

  function renderLuxuryProposal(input) {
    const proposal = assertLuxuryProposalInput(input);
    const flight = proposal.flight || {};
    const hotel = proposal.hotel || {};
    const hotelOptions = Array.isArray(proposal.hotelOptions) ? proposal.hotelOptions : [];
    const currency = proposal.pricing?.currency || "EUR";
    const title = proposal.content?.heroTitle || proposal.destination?.name || "Private Travel Proposal";
    const subtitle = proposal.content?.heroSubtitle || "A curated travel brief prepared for review.";
    const travelDates = proposal.client?.travelDates || proposal.destination?.requested || "";
    const total = proposal.pricing?.totalAmount || flight.price || hotel.price;
    const baseTotal = proposal.pricing?.baseAmount;
    const marginPercent = proposal.pricing?.marginPercent;
    const image = proposalImage(proposal);

    return `
      <article class="v11-proposal" aria-label="Luxury V11 proposal preview">
        <section class="v11-hero">
          <div>
            <p class="v11-eyebrow">AYA TRAVEL · V11 CLIENT BRIEF</p>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(subtitle)}</p>
            <div class="v11-chip-row">
              <span>${escapeHtml(text(proposal.client?.name, "Client to confirm"))}</span>
              <span>${escapeHtml(text(travelDates, "Dates to confirm"))}</span>
              <span>${escapeHtml(text(proposal.client?.travelers, "Travelers to confirm"))}</span>
            </div>
          </div>
          <div class="v11-hero-visual">
            <img src="${escapeHtml(image)}" alt="">
          </div>
          <div class="v11-price-card">
            <span>Estimated investment</span>
            <strong>${escapeHtml(money(total, currency))}</strong>
            ${baseTotal && marginPercent ? `<small>Base ${escapeHtml(money(baseTotal, currency))} + ${escapeHtml(marginPercent)}% margin</small>` : ""}
            <small>Prepared for operator review</small>
          </div>
        </section>

        ${warningList(proposal.warnings)}

        <section class="v11-content-grid">
          <div class="v11-card v11-flight-card">
            <p class="v11-kicker">Flight Experience</p>
            <h4>${escapeHtml(text(flight.airline, "Airline to confirm"))}</h4>
            <p>${escapeHtml(text(flight.route, "Route to confirm"))}</p>
            ${segmentGroup("Outbound", flight.outboundSegments, flight.outbound)}
            ${segmentGroup("Inbound", flight.inboundSegments, flight.inbound)}
            <div class="v11-detail-row">
              <span>Baggage</span>
              <strong>${escapeHtml(text(flight.baggage, "To be confirmed"))}</strong>
            </div>
          </div>

          <div class="v11-card v11-hotel-card">
            ${hotelImage(proposal)}
            <p class="v11-kicker">Hotel Selection</p>
            <h4>${escapeHtml(text(hotel.name, "Hotel to confirm"))}</h4>
            <p>${escapeHtml(text(hotel.description, "Hotel details to confirm"))}</p>
            <div class="v11-detail-grid">
              <div><span>Area</span><strong>${escapeHtml(text(hotel.area))}</strong></div>
              <div><span>Room</span><strong>${escapeHtml(text(hotel.room))}</strong></div>
              <div><span>Meal</span><strong>${escapeHtml(text(hotel.meal))}</strong></div>
              <div><span>Hotel Price</span><strong>${escapeHtml(money(hotel.price, currency))}</strong></div>
            </div>
            ${hotelOptions.length > 1 ? `
              <div class="v11-hotel-options">
                <p class="v11-kicker">Alternative Hotel Options</p>
                ${hotelOptions.map((option, index) => hotelOptionCard(option, index, currency)).join("")}
              </div>
            ` : ""}
          </div>
        </section>

        <section class="v11-closing">
          <div>
            <p class="v11-kicker">Ready for client preview</p>
            <h4>${escapeHtml(text(proposal.content?.primaryCta, "Review proposal"))}</h4>
          </div>
          <span>${proposal.readiness === "ready" ? "READY" : "REVIEW"}</span>
        </section>
      </article>
    `;
  }

  return {
    renderLuxuryProposal,
    assertLuxuryProposalInput
  };
});

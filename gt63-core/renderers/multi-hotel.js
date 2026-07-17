"use strict";

(function exposeMultiHotelRenderer(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63MultiHotelRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMultiHotelRenderer(root) {
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

    if (/maldives|maldive/i.test(haystack)) {
      return "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=85";
    }
    if (/tokyo|japan/i.test(haystack)) {
      return "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=85";
    }
    if (/santiago|chile/i.test(haystack)) {
      return "https://images.unsplash.com/photo-1531778272849-d1dd22444c06?auto=format&fit=crop&w=1200&q=85";
    }
    return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85";
  }

  function firstHotelImage(hotel, input) {
    const urls = Array.isArray(hotel?.imageUrls) ? hotel.imageUrls : [];
    return urls.find(isUsableImageUrl) || fallbackImage(input);
  }

  function segmentCard(segment = {}) {
    const display = root.GT63FlightDisplayBg;
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
    const route = segments.length
      ? [segments[0]?.from, ...segments.map((segment) => segment?.to)].filter(Boolean).join(" -> ")
      : fallback;

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

  function hotelOptionCard(hotel = {}, index, currency, input) {
    const label = `Hotel option ${index + 1}`;
    const image = firstHotelImage(hotel, input);
    const selected = hotel.selected || index === 0;
    const hotelUrl = String(hotel.url || hotel.link || hotel.bookingUrl || "").trim();
    const optionPrice = money(hotel.price, currency);
    const whatsappPhone = String(input.contact?.whatsappPhone || "359885078980").replace(/[^\d]/g, "");
    const preferMessage = encodeURIComponent(`Предпочитам ${text(hotel.name, label)} - ${optionPrice}`);
    const preferUrl = `https://wa.me/${whatsappPhone}?text=${preferMessage}`;

    return `
      <article class="v11-hotel-option ${selected ? "selected" : ""}">
        <img src="${escapeHtml(image)}" alt="">
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(text(hotel.name, "Accommodation to confirm"))}</strong>
          <small>${escapeHtml(text(hotel.area))}</small>
          <small>${escapeHtml(text(hotel.room))}</small>
          <small>${escapeHtml(text(hotel.meal))}</small>
          <div class="v11-option-actions">
            ${hotelUrl ? `<a href="${escapeHtml(hotelUrl)}" target="_blank" rel="noreferrer">Виж хотела</a>` : ""}
            <a href="${escapeHtml(preferUrl)}" target="_blank" rel="noreferrer">Предпочитам този хотел</a>
          </div>
        </div>
        <strong>${escapeHtml(optionPrice)}</strong>
      </article>
    `;
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

  function transferBlock(input = {}) {
    const transfer = input.transfer || {};
    const status = text(transfer.status || transfer.included || transfer.note, "За потвърждение");
    const route = text(transfer.route || transfer.description, "Летище → място за настаняване → летище");
    return `
      <section class="v11-card v11-transfer-card">
        <p class="v11-kicker">Transfer</p>
        <h4>${escapeHtml(route)}</h4>
        <p>${escapeHtml(status)}</p>
      </section>
    `;
  }

  function renderMultiHotelProposal(input) {
    const flight = input.flight || {};
    const hotelOptions = Array.isArray(input.hotelOptions) && input.hotelOptions.length
      ? input.hotelOptions
      : (input.hotel ? [input.hotel] : []);
    const activeHotel = hotelOptions.find((hotel) => hotel?.selected) || input.hotel || hotelOptions[0] || {};
    const currency = input.pricing?.currency || "EUR";
    const total = input.pricing?.totalAmount || flight.price || activeHotel.price;
    const title = input.content?.heroTitle || input.destination?.name || "Travel Proposal";
    const travelDates = input.client?.travelDates || input.destination?.requested || "";
    const heroImage = firstHotelImage(activeHotel, input);

    return `
      <article class="v11-proposal multi-hotel-proposal" aria-label="Multi-hotel proposal preview">
        <section class="v11-hero">
          <div>
            <p class="v11-eyebrow">AYA TRAVEL · MULTI-HOTEL BRIEF</p>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(input.content?.heroSubtitle || "A curated travel proposal with accommodation options.")}</p>
            <div class="v11-chip-row">
              <span>${escapeHtml(text(input.client?.name, "Client to confirm"))}</span>
              <span>${escapeHtml(text(travelDates, "Dates to confirm"))}</span>
              <span>${escapeHtml(text(input.client?.travelers, "Travelers to confirm"))}</span>
            </div>
          </div>
          <div class="v11-hero-visual">
            <img src="${escapeHtml(heroImage)}" alt="">
          </div>
          <div class="v11-price-card">
            <span>Selected option estimate</span>
            <strong>${escapeHtml(money(total, currency))}</strong>
            <small>${escapeHtml(String(hotelOptions.length))} accommodation option${hotelOptions.length === 1 ? "" : "s"}</small>
          </div>
        </section>

        ${warningList(input.warnings)}

        <section class="v11-content-grid">
          <div class="v11-card v11-flight-card">
            <p class="v11-kicker">Flight Experience</p>
            <h4>${escapeHtml(text(flight.airline, "Airline to confirm"))}</h4>
            <p>${escapeHtml(text(flight.route, "Route to confirm"))}</p>
            ${segmentGroup("Outbound", flight.outboundSegments || [], flight.outbound)}
            ${segmentGroup("Inbound", flight.inboundSegments || [], flight.inbound)}
            <div class="v11-detail-row">
              <span>Baggage</span>
              <strong>${escapeHtml(text(flight.baggage, "To be confirmed"))}</strong>
            </div>
          </div>

          <div class="v11-card v11-hotel-card">
            <p class="v11-kicker">Accommodation Options</p>
            <h4>Compare selected stays</h4>
            <p>Neutral accommodation options for operator review. Price labels are factual only.</p>
            <div class="v11-hotel-options">
              ${hotelOptions.length
                ? hotelOptions.map((hotel, index) => hotelOptionCard(hotel, index, currency, input)).join("")
                : "<p class=\"v11-muted\">No hotel option data</p>"}
            </div>
          </div>
        </section>

        ${transferBlock(input)}

        <section class="v11-closing">
          <div>
            <p class="v11-kicker">Ready for client preview</p>
            <h4>${escapeHtml(text(input.content?.primaryCta, "Review proposal"))}</h4>
          </div>
          <span>${input.readiness === "ready" ? "READY" : "REVIEW"}</span>
        </section>
      </article>
    `;
  }

  return {
    renderMultiHotelProposal
  };
});

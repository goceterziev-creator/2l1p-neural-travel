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
    const title = [segment.airline, segment.flightNumber].filter(Boolean).join(" ") || "Полетен сегмент";
    return `
      <article class="v11-segment">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text(segment.from))} &rarr; ${escapeHtml(text(segment.to))}</span>
        <span>${escapeHtml(text(segment.departure))} &rarr; ${escapeHtml(text(segment.arrival))}</span>
        <small>Продължителност: ${escapeHtml(text(segment.duration))}</small>
      </article>
    `;
  }

  function segmentGroup(label, segments = [], fallback) {
    const route = routeLine(segments) || fallback || "";
    return `
      <section class="v11-itinerary-block">
        <div>
          <p class="v11-kicker">${escapeHtml(label)}</p>
          <h4>${escapeHtml(text(route, "За потвърждение"))}</h4>
        </div>
        <div class="v11-segment-list">
          ${segments.length ? segments.map(segmentCard).join("") : "<p class=\"v11-muted\">Няма данни за сегментите</p>"}
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
        <strong>Бележка за преглед</strong>
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
          <span>${selected ? "Избран хотел" : `Хотелска опция ${index + 1}`}</span>
          <strong>${escapeHtml(text(hotel?.name, "Хотел за потвърждение"))}</strong>
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
    const title = proposal.content?.heroTitle || proposal.destination?.name || "Персонално предложение";
    const subtitle = proposal.content?.heroSubtitle || "Персонално подготвено пътуване за клиентски преглед.";
    const travelDates = proposal.client?.travelDates || proposal.destination?.requested || "";
    const total = proposal.pricing?.totalAmount || flight.price || hotel.price;
    const baseTotal = proposal.pricing?.baseAmount;
    const marginPercent = proposal.pricing?.marginPercent;
    const image = proposalImage(proposal);

    return `
      <article class="v11-proposal" aria-label="Luxury V11 proposal preview">
        <section class="v11-hero">
          <div>
            <p class="v11-eyebrow">AYA TRAVEL &middot; КЛИЕНТСКО ПРЕДЛОЖЕНИЕ</p>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(subtitle)}</p>
            <div class="v11-chip-row">
              <span>${escapeHtml(text(proposal.client?.name, "Клиент за потвърждение"))}</span>
              <span>${escapeHtml(text(travelDates, "Дати за потвърждение"))}</span>
              <span>${escapeHtml(text(proposal.client?.travelers, "Пътуващи за потвърждение"))}</span>
            </div>
          </div>
          <div class="v11-hero-visual">
            <img src="${escapeHtml(image)}" alt="">
          </div>
          <div class="v11-price-card">
            <span>Ориентировъчна крайна цена</span>
            <strong>${escapeHtml(money(total, currency))}</strong>
            ${baseTotal && marginPercent ? `<small>База ${escapeHtml(money(baseTotal, currency))} + ${escapeHtml(marginPercent)}% марж</small>` : ""}
            <small>Подготвено за финален преглед</small>
          </div>
        </section>

        ${warningList(proposal.warnings)}

        <section class="v11-content-grid">
          <div class="v11-card v11-flight-card">
            <p class="v11-kicker">Полет</p>
            <h4>${escapeHtml(text(flight.airline, "Авиокомпания за потвърждение"))}</h4>
            <p>${escapeHtml(text(flight.route, "Маршрут за потвърждение"))}</p>
            ${segmentGroup("Отиване", flight.outboundSegments, flight.outbound)}
            ${segmentGroup("Връщане", flight.inboundSegments, flight.inbound)}
            <div class="v11-detail-row">
              <span>Багаж</span>
              <strong>${escapeHtml(text(flight.baggage, "За потвърждение"))}</strong>
            </div>
          </div>

          <div class="v11-card v11-hotel-card">
            ${hotelImage(proposal)}
            <p class="v11-kicker">Хотел</p>
            <h4>${escapeHtml(text(hotel.name, "Хотел за потвърждение"))}</h4>
            <p>${escapeHtml(text(hotel.description, "Детайли за хотела за потвърждение"))}</p>
            <div class="v11-detail-grid">
              <div><span>Локация</span><strong>${escapeHtml(text(hotel.area))}</strong></div>
              <div><span>Стая</span><strong>${escapeHtml(text(hotel.room))}</strong></div>
              <div><span>Изхранване</span><strong>${escapeHtml(text(hotel.meal))}</strong></div>
              <div><span>Цена на хотел</span><strong>${escapeHtml(money(hotel.price, currency))}</strong></div>
            </div>
            ${hotelOptions.length > 1 ? `
              <div class="v11-hotel-options">
                <p class="v11-kicker">Алтернативни хотели</p>
                ${hotelOptions.map((option, index) => hotelOptionCard(option, index, currency)).join("")}
              </div>
            ` : ""}
          </div>
        </section>

        <section class="v11-closing">
          <div>
            <p class="v11-kicker">Готово за клиентски преглед</p>
            <h4>${escapeHtml(text(proposal.content?.primaryCta, "Прегледайте предложението"))}</h4>
          </div>
          <span>${proposal.readiness === "ready" ? "ГОТОВО" : "ЗА ПРЕГЛЕД"}</span>
        </section>
      </article>
    `;
  }

  return {
    renderLuxuryProposal,
    assertLuxuryProposalInput
  };
});

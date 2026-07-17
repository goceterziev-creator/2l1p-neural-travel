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

  function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function money(value, currency = "EUR") {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "-";
    return `${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || "EUR"}`;
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

  function hotelImages(hotel, input) {
    const urls = [
      ...(Array.isArray(hotel?.imageUrls) ? hotel.imageUrls : []),
      ...(Array.isArray(hotel?.images) ? hotel.images : []),
      hotel?.imageUrl,
      hotel?.image,
      hotel?.photo,
      hotel?.thumbnail
    ].filter(isUsableImageUrl);
    const unique = [...new Set(urls)];
    return (unique.length ? unique : [fallbackImage(input)]).slice(0, 3);
  }

  function hotelUrl(hotel = {}) {
    return String(
      hotel.url ||
      hotel.link ||
      hotel.bookingUrl ||
      hotel.bookingLink ||
      hotel.websiteUrl ||
      hotel.website ||
      hotel.sourceUrl ||
      ""
    ).trim();
  }

  function optionPackageTotal(hotel = {}, input = {}) {
    const pricing = input.pricing || {};
    const flightAmount = amount(pricing.flightAmount || input.flight?.price);
    const hotelAmount = amount(hotel.price);
    const transferAmount = amount(pricing.transferAmount || input.transfer?.price);
    const marginPercent = amount(pricing.marginPercent);
    const baseAmount = flightAmount + hotelAmount + transferAmount;
    if (baseAmount <= 0) return 0;
    return baseAmount + (baseAmount * (marginPercent / 100));
  }

  function selectedHotelIndex(hotelOptions = [], activeHotel = {}) {
    const selectedIndex = hotelOptions.findIndex((hotel) => hotel?.selected);
    if (selectedIndex >= 0) return selectedIndex;
    const activeName = String(activeHotel?.name || "").trim();
    if (activeName) {
      const matchingIndex = hotelOptions.findIndex((hotel) => String(hotel?.name || "").trim() === activeName);
      if (matchingIndex >= 0) return matchingIndex;
    }
    return 0;
  }

  function selectedOptionPayload(hotel = {}, index, currency, input) {
    const label = `Hotel option ${index + 1}`;
    const hotelOnly = amount(hotel.price);
    const total = optionPackageTotal(hotel, input) || hotelOnly;
    const name = text(hotel.name, label);
    const priceDisplay = money(total, currency);
    const hotelPriceDisplay = money(hotelOnly, currency);
    const whatsappPhone = String(input.contact?.whatsappPhone || "359885078980").replace(/[^\d]/g, "");
    const preferMessage = encodeURIComponent(`РџСЂРµРґРїРѕС‡РёС‚Р°Рј ${name} - РѕР±С‰Р° РїР°РєРµС‚РЅР° С†РµРЅР° ${priceDisplay}`);

    return {
      label,
      name,
      priceDisplay,
      hotelPriceDisplay,
      whatsappUrl: `https://wa.me/${whatsappPhone}?text=${preferMessage}`
    };
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

  function hotelOptionCard(hotel = {}, index, currency, input, activeIndex) {
    const payload = selectedOptionPayload(hotel, index, currency, input);
    const gallery = hotelImages(hotel, input);
    const selected = index === activeIndex;
    const optionUrl = hotelUrl(hotel);

    return `
      <article class="v11-hotel-option ${selected ? "selected" : ""}" data-option-index="${escapeHtml(index)}">
        <div class="v11-hotel-gallery">
          ${gallery.map((image) => `<img src="${escapeHtml(image)}" alt="">`).join("")}
        </div>
        <div>
          <span>${escapeHtml(payload.label)}${selected ? " В· РР·Р±СЂР°РЅ С…РѕС‚РµР»" : ""}</span>
          <strong>${escapeHtml(payload.name)}</strong>
          <small>${escapeHtml(text(hotel.area))}</small>
          <small>${escapeHtml(text(hotel.room))}</small>
          <small>${escapeHtml(text(hotel.meal))}</small>
          <div class="v11-option-price">
            <span>РћР±С‰Р° РєР»РёРµРЅС‚СЃРєР° С†РµРЅР°</span>
            <strong>${escapeHtml(payload.priceDisplay)}</strong>
            <small>РҐРѕС‚РµР»: ${escapeHtml(payload.hotelPriceDisplay)}</small>
          </div>
          <div class="v11-option-actions">
            ${optionUrl ? `<a href="${escapeHtml(optionUrl)}" target="_blank" rel="noreferrer">Виж хотела</a>` : ""}
            <button type="button"
              class="v11-prefer-option"
              data-option-name="${escapeHtml(payload.name)}"
              data-option-price="${escapeHtml(payload.priceDisplay)}"
              data-option-whatsapp="${escapeHtml(payload.whatsappUrl)}">
              РџСЂРµРґРїРѕС‡РёС‚Р°Рј С‚РѕР·Рё С…РѕС‚РµР»
            </button>
          </div>
        </div>
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
    const destinationText = [
      input.destination?.name,
      input.destination?.requested,
      input.hotel?.area,
      input.hotel?.name,
      input.content?.heroTitle
    ].filter(Boolean).join(" ");
    const needsIslandTransfer = /maldives|maldive|РјР°Р»РґРёРІ/i.test(destinationText);
    const status = text(
      transfer.status || transfer.included || transfer.note,
      needsIslandTransfer
        ? "РќРµРѕР±С…РѕРґРёРј С‚СЂР°РЅСЃС„РµСЂ: speedboat / seaplane / domestic flight, Р·Р° РїРѕС‚РІСЉСЂР¶РґРµРЅРёРµ"
        : "Р—Р° РїРѕС‚РІСЉСЂР¶РґРµРЅРёРµ"
    );
    const route = text(transfer.route || transfer.description, "Р›РµС‚РёС‰Рµ в†’ РјСЏСЃС‚Рѕ Р·Р° РЅР°СЃС‚Р°РЅСЏРІР°РЅРµ в†’ Р»РµС‚РёС‰Рµ");

    return `
      <section class="v11-card v11-transfer-card">
        <p class="v11-kicker">РўСЂР°РЅСЃС„РµСЂ</p>
        <h4>${escapeHtml(route)}</h4>
        <p>${escapeHtml(status)}</p>
      </section>
    `;
  }

  function selectedHotelScript() {
    return `
      <script>
        (function () {
          var script = document.currentScript;
          var root = script && script.closest(".multi-hotel-proposal");
          if (!root) return;
          var selectedName = root.querySelector(".js-selected-option-name");
          var selectedPrice = root.querySelector(".js-selected-option-price");
          var whatsapp = root.querySelector(".js-selected-option-whatsapp");
          root.querySelectorAll(".v11-prefer-option").forEach(function (button) {
            button.addEventListener("click", function () {
              root.querySelectorAll(".v11-hotel-option").forEach(function (card) {
                card.classList.remove("selected");
              });
              var card = button.closest(".v11-hotel-option");
              if (card) card.classList.add("selected");
              if (selectedName) selectedName.textContent = button.dataset.optionName || "Hotel option";
              if (selectedPrice) selectedPrice.textContent = button.dataset.optionPrice || "-";
              if (whatsapp && button.dataset.optionWhatsapp) whatsapp.href = button.dataset.optionWhatsapp;
            });
          });
        })();
      </script>
    `;
  }

  function renderMultiHotelProposal(input) {
    const flight = input.flight || {};
    const hotelOptions = Array.isArray(input.hotelOptions) && input.hotelOptions.length
      ? input.hotelOptions
      : (input.hotel ? [input.hotel] : []);
    const activeHotel = hotelOptions.find((hotel) => hotel?.selected) || input.hotel || hotelOptions[0] || {};
    const currency = input.pricing?.currency || "EUR";
    const activeIndex = selectedHotelIndex(hotelOptions, activeHotel);
    const selectedPayload = selectedOptionPayload(hotelOptions[activeIndex] || activeHotel, activeIndex, currency, input);
    const title = input.content?.heroTitle || input.destination?.name || "Travel Proposal";
    const travelDates = input.client?.travelDates || input.destination?.requested || "";
    const heroImage = firstHotelImage(activeHotel, input);

    return `
      <article class="v11-proposal multi-hotel-proposal" aria-label="Multi-hotel proposal preview">
        <section class="v11-hero">
          <div>
            <p class="v11-eyebrow">AYA TRAVEL В· MULTI-HOTEL BRIEF</p>
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
            <span>РР·Р±СЂР°РЅ С…РѕС‚РµР»</span>
            <strong class="js-selected-option-name">${escapeHtml(selectedPayload.name)}</strong>
            <small>Selected option estimate</small>
            <strong class="js-selected-option-price">${escapeHtml(selectedPayload.priceDisplay)}</strong>
            <small>${escapeHtml(String(hotelOptions.length))} accommodation option${hotelOptions.length === 1 ? "" : "s"}</small>
            <a class="js-selected-option-whatsapp v11-selected-option-whatsapp" href="${escapeHtml(selectedPayload.whatsappUrl)}" target="_blank" rel="noreferrer">РР·РїСЂР°С‚Рё РёР·Р±РѕСЂР° РІ WhatsApp</a>
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
                ? hotelOptions.map((hotel, index) => hotelOptionCard(hotel, index, currency, input, activeIndex)).join("")
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
        ${selectedHotelScript()}
      </article>
    `;
  }

  return {
    renderMultiHotelProposal
  };
});

"use strict";

(function exposeMultiHotelRenderer(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63MultiHotelRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMultiHotelRenderer(root) {
  const COMPACT_GALLERY_IMAGE_COUNT = 3;

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
    const urls = [
      hotel?.heroImage,
      ...(Array.isArray(hotel?.imageUrls) ? hotel.imageUrls : []),
      ...(Array.isArray(hotel?.images) ? hotel.images : []),
      hotel?.imageUrl,
      hotel?.image,
      hotel?.photo,
      hotel?.thumbnail
    ];
    return urls.find(isUsableImageUrl) || fallbackImage(input);
  }

  function hotelImages(hotel, input) {
    const urls = [
      hotel?.heroImage,
      ...(Array.isArray(hotel?.imageUrls) ? hotel.imageUrls : []),
      ...(Array.isArray(hotel?.images) ? hotel.images : []),
      hotel?.imageUrl,
      hotel?.image,
      hotel?.photo,
      hotel?.thumbnail
    ].filter(isUsableImageUrl);
    const unique = [...new Set(urls)];
    return (unique.length ? unique : [fallbackImage(input)]).slice(0, COMPACT_GALLERY_IMAGE_COUNT);
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
    const preferMessage = encodeURIComponent(`Predpochitam ${name} - obshta paketna tsena ${priceDisplay}`);

    return {
      label,
      name,
      priceDisplay,
      hotelPriceDisplay,
      whatsappUrl: `https://wa.me/${whatsappPhone}?text=${preferMessage}`
    };
  }

  function hotelSubtitle(hotel = {}) {
    return text(
      hotel.subtitle ||
      hotel.area ||
      hotel.location ||
      hotel.description,
      "Accommodation details to confirm"
    );
  }

  function hotelHighlights(hotel = {}) {
    const candidates = [
      ...(Array.isArray(hotel.amenities) ? hotel.amenities : []),
      ...(Array.isArray(hotel.highlights) ? hotel.highlights : []),
      ...(Array.isArray(hotel.travelHighlights) ? hotel.travelHighlights : []),
      hotel.roomsLeft,
      hotel.availability
    ].filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
    return [...new Set(candidates)].slice(0, 8);
  }

  function hotelPayload(hotel = {}, index, currency, input) {
    const payload = selectedOptionPayload(hotel, index, currency, input);
    const images = hotelImages(hotel, input);
    const optionUrl = hotelUrl(hotel);
    return {
      index,
      label: payload.label,
      name: payload.name,
      priceDisplay: payload.priceDisplay,
      hotelPriceDisplay: payload.hotelPriceDisplay,
      whatsappUrl: payload.whatsappUrl,
      image: firstHotelImage(hotel, input),
      images,
      url: optionUrl,
      subtitle: hotelSubtitle(hotel),
      description: text(hotel.description, "Hotel description to confirm."),
      room: text(hotel.room || hotel.roomType, "Room to confirm"),
      meal: text(hotel.meal || hotel.board, "Meal plan to confirm"),
      area: text(hotel.area || hotel.location || hotel.city, "Location to confirm"),
      transfer: transferSummary(input),
      highlights: hotelHighlights(hotel)
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
    const payload = hotelPayload(hotel, index, currency, input);
    const selected = index === activeIndex;

    return `
      <article class="v11-hotel-option ${selected ? "selected" : ""}" data-option-index="${escapeHtml(index)}">
        <div class="v11-hotel-gallery">
          ${payload.images.map((image) => `<img src="${escapeHtml(image)}" alt="">`).join("")}
        </div>
        <div>
          <span>${escapeHtml(payload.label)}${selected ? " &middot; &#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1093;&#1086;&#1090;&#1077;&#1083;" : ""}</span>
          <strong>${escapeHtml(payload.name)}</strong>
          <small>${escapeHtml(text(hotel.room))}</small>
          <small>${escapeHtml(text(hotel.meal))}</small>
          <div class="v11-option-price">
            <span>&#1054;&#1073;&#1097;&#1072; &#1082;&#1083;&#1080;&#1077;&#1085;&#1090;&#1089;&#1082;&#1072; &#1094;&#1077;&#1085;&#1072;</span>
            <strong>${escapeHtml(payload.priceDisplay)}</strong>
            <small>&#1061;&#1086;&#1090;&#1077;&#1083;: ${escapeHtml(payload.hotelPriceDisplay)}</small>
          </div>
          <div class="v11-option-actions">
            ${payload.url ? `<a href="${escapeHtml(payload.url)}" target="_blank" rel="noreferrer">&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;</a>` : ""}
            <button type="button"
              class="v11-prefer-option"
              data-option-index="${escapeHtml(index)}"
              data-option-name="${escapeHtml(payload.name)}"
              data-option-price="${escapeHtml(payload.priceDisplay)}"
              data-option-whatsapp="${escapeHtml(payload.whatsappUrl)}"
              data-option-image="${escapeHtml(payload.image)}"
              data-option-subtitle="${escapeHtml(payload.subtitle)}"
              data-option-url="${escapeHtml(payload.url)}"
              data-option-transfer="${escapeHtml(payload.transfer)}">
              &#1055;&#1088;&#1077;&#1076;&#1087;&#1086;&#1095;&#1080;&#1090;&#1072;&#1084; &#1090;&#1086;&#1079;&#1080; &#1093;&#1086;&#1090;&#1077;&#1083;
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

  function transferSummary(input = {}) {
    const transfer = input.transfer || {};
    const destinationText = [
      input.destination?.name,
      input.destination?.requested,
      input.hotel?.area,
      input.hotel?.name,
      input.content?.heroTitle
    ].filter(Boolean).join(" ");
    const needsIslandTransfer = /maldives|maldive|\u043c\u0430\u043b\u0434\u0438\u0432/i.test(destinationText);
    const status = text(
      transfer.status || transfer.included || transfer.note,
      needsIslandTransfer
        ? "\u041d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c \u0442\u0440\u0430\u043d\u0441\u0444\u0435\u0440: speedboat / seaplane / domestic flight, \u0437\u0430 \u043f\u043e\u0442\u0432\u044a\u0440\u0436\u0434\u0435\u043d\u0438\u0435"
        : "\u0417\u0430 \u043f\u043e\u0442\u0432\u044a\u0440\u0436\u0434\u0435\u043d\u0438\u0435"
    );
    const route = text(transfer.route || transfer.description, "\u041b\u0435\u0442\u0438\u0449\u0435 \u2192 \u043c\u044f\u0441\u0442\u043e \u0437\u0430 \u043d\u0430\u0441\u0442\u0430\u043d\u044f\u0432\u0430\u043d\u0435 \u2192 \u043b\u0435\u0442\u0438\u0449\u0435");
    return `${route}. ${status}`;
  }

  function transferBlock(input = {}) {
    const summary = transferSummary(input);
    return `
      <section class="v11-card v11-transfer-card">
        <p class="v11-kicker">&#1058;&#1088;&#1072;&#1085;&#1089;&#1092;&#1077;&#1088;</p>
        <h4>${escapeHtml(summary.split(". ")[0])}</h4>
        <p>${escapeHtml(summary.split(". ").slice(1).join(". ") || "\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f\u0442\u0430 \u0437\u0430 \u0442\u0440\u0430\u043d\u0441\u0444\u0435\u0440 \u0449\u0435 \u0431\u044a\u0434\u0435 \u043f\u043e\u0442\u0432\u044a\u0440\u0434\u0435\u043d\u0430 \u043f\u0440\u0435\u0434\u0438 \u0440\u0435\u0437\u0435\u0440\u0432\u0430\u0446\u0438\u044f.")}</p>
      </section>
    `;
  }

  function selectedHotelDetails(hotel = {}, index, currency, input, activeIndex) {
    const payload = hotelPayload(hotel, index, currency, input);
    return `
      <article class="v11-selected-hotel-detail ${index === activeIndex ? "active" : ""}" data-selected-detail-index="${escapeHtml(index)}">
        <div class="v11-selected-hotel-gallery">
          ${payload.images.map((image) => `<img src="${escapeHtml(image)}" alt="">`).join("")}
        </div>
        <div class="v11-selected-hotel-copy">
          <p class="v11-kicker">${escapeHtml(payload.label)}</p>
          <h4>${escapeHtml(payload.name)}</h4>
          <p>${escapeHtml(payload.description)}</p>
          <div class="v11-detail-grid">
            <div><span>Room</span><strong>${escapeHtml(payload.room)}</strong></div>
            <div><span>Meal</span><strong>${escapeHtml(payload.meal)}</strong></div>
            <div><span>Location</span><strong>${escapeHtml(payload.area)}</strong></div>
            <div><span>Total package</span><strong>${escapeHtml(payload.priceDisplay)}</strong></div>
          </div>
          ${payload.highlights.length ? `<ul class="v11-hotel-highlights">${payload.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
          <div class="v11-detail-row">
            <span>Transfer</span>
            <strong>${escapeHtml(payload.transfer)}</strong>
          </div>
          <div class="v11-option-actions">
            ${payload.url ? `<a href="${escapeHtml(payload.url)}" target="_blank" rel="noreferrer">&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;</a>` : ""}
            <a href="${escapeHtml(payload.whatsappUrl)}" target="_blank" rel="noreferrer">&#1048;&#1079;&#1087;&#1088;&#1072;&#1090;&#1080; &#1080;&#1079;&#1073;&#1086;&#1088;&#1072; &#1074; WhatsApp</a>
          </div>
        </div>
      </article>
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
          var selectedSubtitle = root.querySelector(".js-selected-option-subtitle");
          var selectedTransfer = root.querySelector(".js-selected-option-transfer");
          var selectedImage = root.querySelector(".js-selected-option-image");
          var selectedWebsite = root.querySelector(".js-selected-option-website");
          var whatsapp = root.querySelector(".js-selected-option-whatsapp");
          root.querySelectorAll(".v11-prefer-option").forEach(function (button) {
            button.addEventListener("click", function () {
              root.querySelectorAll(".v11-hotel-option").forEach(function (card) {
                card.classList.remove("selected");
              });
              var card = button.closest(".v11-hotel-option");
              if (card) card.classList.add("selected");
              root.querySelectorAll(".v11-selected-hotel-detail").forEach(function (detail) {
                detail.classList.toggle("active", detail.dataset.selectedDetailIndex === button.dataset.optionIndex);
              });
              if (selectedName) selectedName.textContent = button.dataset.optionName || "Hotel option";
              if (selectedPrice) selectedPrice.textContent = button.dataset.optionPrice || "-";
              if (selectedSubtitle) selectedSubtitle.textContent = button.dataset.optionSubtitle || "";
              if (selectedTransfer) selectedTransfer.textContent = button.dataset.optionTransfer || "";
              if (selectedImage && button.dataset.optionImage) selectedImage.src = button.dataset.optionImage;
              if (selectedWebsite) {
                if (button.dataset.optionUrl) {
                  selectedWebsite.href = button.dataset.optionUrl;
                  selectedWebsite.hidden = false;
                } else {
                  selectedWebsite.hidden = true;
                }
              }
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
    const selectedFullPayload = hotelPayload(hotelOptions[activeIndex] || activeHotel, activeIndex, currency, input);
    const title = input.content?.heroTitle || input.destination?.name || "Travel Proposal";
    const travelDates = input.client?.travelDates || input.destination?.requested || "";
    const heroImage = firstHotelImage(activeHotel, input);

    return `
      <article class="v11-proposal multi-hotel-proposal" aria-label="Multi-hotel proposal preview">
        <section class="v11-hero">
          <div>
            <p class="v11-eyebrow">AYA TRAVEL &middot; MULTI-HOTEL BRIEF</p>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(input.content?.heroSubtitle || "A curated travel proposal with accommodation options.")}</p>
            <div class="v11-chip-row">
              <span>${escapeHtml(text(input.client?.name, "Client to confirm"))}</span>
              <span>${escapeHtml(text(travelDates, "Dates to confirm"))}</span>
              <span>${escapeHtml(text(input.client?.travelers, "Travelers to confirm"))}</span>
            </div>
          </div>
          <div class="v11-hero-visual">
            <img class="js-selected-option-image" src="${escapeHtml(heroImage)}" alt="">
          </div>
          <div class="v11-price-card">
            <span>&#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1093;&#1086;&#1090;&#1077;&#1083;</span>
            <strong class="js-selected-option-name">${escapeHtml(selectedPayload.name)}</strong>
            <small class="js-selected-option-subtitle">${escapeHtml(selectedFullPayload.subtitle)}</small>
            <small>Selected option estimate</small>
            <strong class="js-selected-option-price">${escapeHtml(selectedPayload.priceDisplay)}</strong>
            <small>${escapeHtml(String(hotelOptions.length))} accommodation option${hotelOptions.length === 1 ? "" : "s"}</small>
            <small class="js-selected-option-transfer">${escapeHtml(selectedFullPayload.transfer)}</small>
            <a class="js-selected-option-website v11-selected-option-website" href="${escapeHtml(selectedFullPayload.url)}" target="_blank" rel="noreferrer" ${selectedFullPayload.url ? "" : "hidden"}>&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;</a>
            <a class="js-selected-option-whatsapp v11-selected-option-whatsapp" href="${escapeHtml(selectedPayload.whatsappUrl)}" target="_blank" rel="noreferrer">&#1048;&#1079;&#1087;&#1088;&#1072;&#1090;&#1080; &#1080;&#1079;&#1073;&#1086;&#1088;&#1072; &#1074; WhatsApp</a>
          </div>
        </section>

        ${warningList(input.warnings)}

        <section class="v11-content-grid multi-hotel-sequential-grid">
          <div class="v11-card v11-flight-card">
            <p class="v11-kicker">&#1042;&#1072;&#1096;&#1080;&#1103;&#1090; &#1087;&#1086;&#1083;&#1077;&#1090;</p>
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
            <p class="v11-kicker">&#1042;&#1072;&#1088;&#1080;&#1072;&#1085;&#1090;&#1080; &#1079;&#1072; &#1085;&#1072;&#1089;&#1090;&#1072;&#1085;&#1103;&#1074;&#1072;&#1085;&#1077;</p>
            <h4>&#1057;&#1088;&#1072;&#1074;&#1085;&#1077;&#1090;&#1077; &#1087;&#1088;&#1077;&#1076;&#1083;&#1086;&#1078;&#1077;&#1085;&#1080;&#1090;&#1077; &#1074;&#1072;&#1088;&#1080;&#1072;&#1085;&#1090;&#1080;</h4>
            <p>&#1061;&#1086;&#1090;&#1077;&#1083;&#1089;&#1082;&#1080;&#1090;&#1077; &#1086;&#1087;&#1094;&#1080;&#1080; &#1089;&#1072; &#1087;&#1086;&#1076;&#1088;&#1077;&#1076;&#1077;&#1085;&#1080; &#1079;&#1072; &#1103;&#1089;&#1085;&#1086; &#1089;&#1088;&#1072;&#1074;&#1085;&#1077;&#1085;&#1080;&#1077;. &#1062;&#1077;&#1085;&#1080;&#1090;&#1077; &#1089;&#1072; &#1086;&#1073;&#1097;&#1080; &#1082;&#1083;&#1080;&#1077;&#1085;&#1090;&#1089;&#1082;&#1080; &#1094;&#1077;&#1085;&#1080; &#1079;&#1072; &#1089;&#1098;&#1086;&#1090;&#1074;&#1077;&#1090;&#1085;&#1080;&#1103; &#1080;&#1079;&#1073;&#1086;&#1088;.</p>
            <div class="v11-hotel-options">
              ${hotelOptions.length
                ? hotelOptions.map((hotel, index) => hotelOptionCard(hotel, index, currency, input, activeIndex)).join("")
                : "<p class=\"v11-muted\">No hotel option data</p>"}
            </div>
          </div>
        </section>

        <section class="v11-card v11-selected-hotel-card">
          <p class="v11-kicker">&#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1074;&#1072;&#1088;&#1080;&#1072;&#1085;&#1090;</p>
          <h4>&#1044;&#1077;&#1090;&#1072;&#1081;&#1083;&#1080; &#1079;&#1072; &#1080;&#1079;&#1073;&#1088;&#1072;&#1085;&#1080;&#1103; &#1093;&#1086;&#1090;&#1077;&#1083;</h4>
          ${hotelOptions.length
            ? hotelOptions.map((hotel, index) => selectedHotelDetails(hotel, index, currency, input, activeIndex)).join("")
            : "<p class=\"v11-muted\">No selected hotel details</p>"}
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

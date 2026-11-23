"use strict";

(function exposePrintPresentationRenderer(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63PrintPresentationRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPrintPresentationRenderer(root) {
  const viewModelApi = root.GT63PresentationViewModel || (typeof require === "function" ? require("../presentation-view-model") : null);


  const travelDates = typeof require === "function" ? require("../../server/travel-normalizers/date-normalizer") : root.AYATravelDates;
  // These are visual palettes, never forecasts or assertions about local weather.
  const seasonalRegions = [
    { key: "temperate-north", aliases: ["rome", "roma", "рим", "tokyo", "токио", "london", "лондон", "paris", "париж", "prague", "прага", "barcelona", "барселона", "bari", "бари", "sofia", "софия"], months: ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"] },
    { key: "temperate-south", aliases: ["sydney", "сидни", "melbourne", "мелбърн", "cape town", "кейптаун"], months: ["summer", "summer", "autumn", "autumn", "autumn", "winter", "winter", "winter", "spring", "spring", "spring", "summer"] },
    { key: "abu-dhabi-desert", aliases: ["abu dhabi", "абу даби", "abu dhabi, uae", "абу даби, оае"], months: ["winter", "winter", "spring", "spring", "summer", "summer", "summer", "summer", "summer", "autumn", "autumn", "winter"] },
    { key: "dubai-desert", aliases: ["dubai", "дубай"], months: ["winter", "winter", "spring", "spring", "summer", "summer", "summer", "summer", "summer", "autumn", "autumn", "winter"] },
    { key: "maldives-tropical", aliases: ["maldives", "малдиви", "малдивските острови"], months: Array(12).fill("summer") }
  ];

  // PDF-only labels: shared HTML presentation and saved input remain unchanged.
  function detailNeedsConfirmation(value) {
    return /^(?:|not specified|not provided|unknown|не е посочен[оа]?|не е потвърден[оа]?|(?:хранене|изхранване|багаж) за потвърждение|за потвърждение)$/i.test(nonEmpty(value));
  }
  function baggageLabel(value) {
    return localize(viewModelApi.baggageLabel(value));
  }
  function printNotices(input, options = {}) {
    return viewModelApi.presentationNotices(input, options).map(item => {
      const prefix = item.text.match(/^\[(WARNING|INFO)\]\s*/i);
      return { ...item, level: item.level === "blocking" ? "blocking" : prefix?.[1].toUpperCase() === "INFO" ? "info" : item.level, text: prefix ? `${prefix[1].toUpperCase() === "INFO" ? "Информация" : "Важно"}: ${item.text.slice(prefix[0].length)}` : item.text };
    });
  }

  function resolveSeasonalTheme(input = {}) {
    const neutral = { theme: "neutral", region: "unknown" };
    const normalize = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s-]+/g, " ").trim();
    const names = [input.destination?.name, input.destination?.requested].filter(value => String(value || "").trim());
    if (!names.length) return neutral;
    const regions = names.map(name => seasonalRegions.find(region => region.aliases.includes(normalize(name))));
    if (regions.some(region => !region) || new Set(regions.map(region => region.key)).size !== 1) return neutral;
    const region = regions[0];
    const range = String(input.client?.travelDates || "").trim().match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})\s*[-–—]\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})$/);
    if (!range || !travelDates?.normalizeTravelDate) return neutral;
    const parse = raw => {
      // DD.MM.YYYY is deliberately not interpreted as MM.DD.YYYY.
      if (raw.includes(".") && Number(raw.split(".")[1]) > 12) return null;
      const parsed = travelDates.normalizeTravelDate(raw);
      if (!parsed.year || !parsed.month || !parsed.day) return null;
      const key = `${String(parsed.year).padStart(4,"0")}-${String(parsed.month).padStart(2,"0")}-${String(parsed.day).padStart(2,"0")}`;
      const date = new Date(`${key}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === key ? date : null;
    };
    const start = parse(range[1]), end = parse(range[2]);
    if (!start || !end || end < start) return neutral;
    const theme = region.months[start.getUTCMonth()];
    // Check every intersected month, including year transitions, not just endpoints.
    const cursor = new Date(start); cursor.setUTCDate(1);
    while (cursor <= end) {
      if (region.months[cursor.getUTCMonth()] !== theme) return { theme: "neutral", region: region.key };
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { theme, region: region.key };
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

  function text(value, fallback = "-") {
    return viewModelApi.text(value, fallback);
  }

  function localize(value) {
    return viewModelApi.localizeClientText(value);
  }

  function nonEmpty(value) {
    return text(value, "");
  }

  function formatPrintDateTime(value) {
    const raw = nonEmpty(value);
    if (!raw) return "";
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
    if (!match) return localize(raw);
    const months = [
      "януари", "февруари", "март", "април", "май", "юни",
      "юли", "август", "септември", "октомври", "ноември", "декември"
    ];
    const year = match[1];
    const month = months[Number(match[2]) - 1] || match[2];
    const day = String(Number(match[3]));
    return `${day} ${month} ${year} · ${match[4]}:${match[5]}`;
  }

  function imageUrl(hotel = {}) {
    const candidates = [
      ...(Array.isArray(hotel.imageUrls) ? hotel.imageUrls : []),
      ...(Array.isArray(hotel.images) ? hotel.images : []),
      hotel.heroImage,
      hotel.image,
      hotel.imageUrl,
      hotel.photo,
      hotel.thumbnail
    ].map((item) => String(item || "").trim()).filter(Boolean);
    return candidates.find((url) => /^https?:\/\//i.test(url)) || "";
  }

  function imageUrls(item = {}, limit = 3) {
    const candidates = [
      ...(Array.isArray(item.imageUrls) ? item.imageUrls : []),
      ...(Array.isArray(item.images) ? item.images : []),
      item.heroImage,
      item.image,
      item.imageUrl,
      item.photo,
      item.thumbnail
    ].map((value) => String(value || "").trim()).filter((value) => /^https?:\/\//i.test(value));
    return [...new Set(candidates)].slice(0, limit);
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

  function starsLabel(hotel = {}) {
    const stars = viewModelApi.numericStars(hotel);
    return stars ? `${stars} звезди` : "Категорията не е посочена";
  }

  function printPage(className, content) {
    const body = nonEmpty(content);
    if (!body) return "";
    return `<section class="gt63-print-page ${escapeHtml(className || "")}">${body}</section>`;
  }

  function editorialSection(className, kicker, title, content) {
    const body = nonEmpty(content);
    if (!body) return "";
    return `
      <section class="gt63-print-section ${escapeHtml(className || "")}">
        <div class="gt63-print-section-head">
          ${kicker ? (["gt63-print-flight", "gt63-print-included-services"].some(name => className.split(" ").includes(name))
            ? `<div class="gt63-luxury-eyebrow"><p class="gt63-print-kicker">${escapeHtml(kicker)}</p><span class="gt63-luxury-brand">AYA TRAVEL · GT63</span></div>`
            : `<p class="gt63-print-kicker">${escapeHtml(kicker)}</p>`) : ""}
          ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
        </div>
        ${body}
      </section>
    `;
  }

  function contentPage(className, content) {
    const body = nonEmpty(content);
    if (!body) return "";
    return `<section class="gt63-print-page gt63-print-flow-page ${escapeHtml(className || "")}">${body}</section>`;
  }

  function factGrid(items = [], className = "") {
    const cards = items
      .filter((item) => nonEmpty(item?.value))
      .map((item) => `
        <div class="gt63-print-fact">
          <dt>${escapeHtml(item.label)}</dt>
          <dd>${escapeHtml(localize(item.value))}</dd>
        </div>
      `).join("");
    if (!cards) return "";
    return `<dl class="gt63-print-fact-grid ${escapeHtml(className)}">${cards}</dl>`;
  }

  function imageFrame(image, alt, label = "", className = "") {
    if (!image) {
      return `
        <div class="gt63-print-image-frame is-placeholder ${escapeHtml(className)}" aria-label="Снимка за потвърждение">
          <span>Снимка за потвърждение</span>
        </div>
      `;
    }
    return `
      <figure class="gt63-print-image-frame ${escapeHtml(className)}">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(alt || "Снимка към офертата")}">
        ${label ? `<figcaption>${escapeHtml(label)}</figcaption>` : ""}
      </figure>
    `;
  }

  // Compact PDF-only projection of the existing segments; never infer itinerary facts.
  function journeyOverview(input = {}, detailed = false) {
    const flight = input.flight || {};
    const legs = [["Отиване", flight.outboundSegments], ["Връщане", flight.inboundSegments]];
    const cards = legs.filter(([, segments]) => Array.isArray(segments) && segments.length).map(([label, segments]) => {
      const first = segments[0], last = segments[segments.length - 1];
      const route = [first.from, ...segments.map(segment => segment.to)].filter(Boolean).join(" → ");
      const times = [first.departure, last.arrival].filter(Boolean).map(formatPrintDateTime).join(" — ");
      return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(route)}</strong>${detailed && times ? `<p>${escapeHtml(times)}</p>` : ""}</div>`;
    });
    return cards.length ? `<div class="gt63-print-journey-overview">${cards.join("")}</div>` : "";
  }

  function coverPage(viewModel, input = {}, mode = "selected") {
    const hotel = viewModel.selectedHotel || {};
    const destination = text(input.destination?.name || input.destination?.requested || input.content?.heroTitle, "Персонална оферта");
    const hotelName = text(hotel.name, "Избран хотел");
    const heroImage = imageUrl(hotel);
    const clientName = nonEmpty(input.client?.name || input.client?.displayName || input.clientName);
    const travelers = nonEmpty(input.client?.travelers);
    const travelerLabel = travelers && /^\d+$/.test(String(travelers).trim())
      ? `${travelers} ${String(travelers).trim() === "1" ? "пътуващ" : "пътуващи"}`
      : travelers;
    const preparedFor = clientName ? `Подготвено специално за ${clientName}` : "Подготвено специално за Вашето пътуване";
    const meta = [viewModel.travelDates, travelerLabel].filter(Boolean).join(" · ");

    return printPage(`gt63-print-cover gt63-print-cover-fullbleed ${heroImage ? "has-cover-image" : "without-cover-image"}`, `
      <figure class="gt63-print-image-frame gt63-print-cover-art ${heroImage ? "" : "is-placeholder"}">
        ${heroImage ? `<img class="gt63-print-cover-hero" src="${escapeHtml(heroImage)}" alt="${escapeHtml(`Снимка към ${hotelName}`)}">` : `<span data-print-image-placeholder="true">Снимка за потвърждение</span>`}
      </figure>
      <div class="gt63-print-cover-shade"></div>
      <aside class="gt63-print-cover-overview">
        <p class="gt63-print-kicker">Вашето пътуване накратко</p>
        ${journeyOverview(input)}
        <p>${escapeHtml([viewModel.travelDates, input.flight?.airline].filter(Boolean).join(" · "))}</p>
        <p>${escapeHtml([hotelName, viewModel.selectedMealPlan].filter(Boolean).join(" · "))}</p>
      </aside>
      <header class="gt63-print-cover-copy">
        <p class="gt63-print-brand">AYA Travel · GT63</p>
        <p class="gt63-print-kicker">Луксозна книга на пътуването</p>
        <h1>${escapeHtml(destination)}</h1>
        <p class="gt63-print-subtitle">${escapeHtml(hotelName)}</p>
        <p class="gt63-print-cover-prepared">${escapeHtml(preparedFor)}</p>
        ${meta ? `<p class="gt63-print-cover-meta">${escapeHtml(localize(meta))}</p>` : ""}
        <p class="gt63-print-cover-mode">${escapeHtml(mode === "comparison" ? "Сравнително издание" : "Издание с избран хотел")}</p>
      </header>
    `);
  }

  function journeyIntroductionPage(viewModel, input = {}) {
    const hotel = viewModel.selectedHotel || {};
    const destination = text(input.destination?.name || input.destination?.requested || input.content?.heroTitle, "");
    const facts = factGrid([
      { label: "Дестинация", value: destination },
      { label: "Избран хотел", value: hotel.name },
      { label: "Период на пътуване", value: viewModel.travelDates },
      { label: "Пътуващи", value: input.client?.travelers },
      { label: "Хотелска заетост", value: viewModelApi.hotelOccupancyLabel(hotel.occupancy) },
      { label: "Изхранване", value: viewModel.selectedMealPlan }
    ], "is-compact");
    const reasons = (viewModel.selectedRecommendationReasons || []).slice(0, 3);
    const reasonList = reasons.length ? `
      <ul class="gt63-print-reason-list gt63-print-intro-reasons">
        ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
      </ul>
    ` : "";
    return `<div class="gt63-print-intro-page">
      <section class="gt63-print-intro">
        <div class="gt63-luxury-eyebrow"><p class="gt63-print-kicker">Въведение към пътуването</p><span class="gt63-luxury-brand">AYA TRAVEL · GT63</span></div>
        <h2>${escapeHtml(destination || "Вашето пътуване")}</h2>
        <p class="gt63-print-editorial-lead">Тази книга на пътуването събира избрания хотел, ритъма на пътуването и инвестицията в една ясна клиентска презентация.</p>
        ${facts}
        ${reasonList}
        ${imageUrls(hotel, 3).length > 1 ? imageFrame(imageUrl(hotel), `Снимка към ${hotel.name || "избрания хотел"}`, `Избраният хотел: ${hotel.name || "За потвърждение"}`, "gt63-print-intro-image") : ""}
      </section>
    </div>`;
  }

  function transferSummary(input = {}) {
    const transfer = input.transfer || {};
    if (!(transfer.included || transfer.price > 0 || transfer.type || transfer.status || transfer.route || transfer.description)) return "";
    const route = text(transfer.route || transfer.description, "Летище → място за настаняване → летище");
    const status = text(transfer.status || transfer.type || "За потвърждение");
    return `${localize(route)}. ${localize(status)}`;
  }

  function transferBlock(input = {}) {
    const summary = transferSummary(input);
    if (!summary) return "";
    const parts = summary.split(". ");
    return editorialSection(
      "gt63-print-transfer",
      "Трансфер",
      parts[0],
      `<p>${escapeHtml(parts.slice(1).join(". ") || "За потвърждение")}</p>`
    );
  }

  function hasMeaningfulFlight(input = {}) {
    const flight = input.flight || {};
    const outbound = Array.isArray(flight.outboundSegments) ? flight.outboundSegments : [];
    const inbound = Array.isArray(flight.inboundSegments) ? flight.inboundSegments : [];
    return Boolean(flight.airline || flight.route || flight.baggage || flight.price || outbound.length || inbound.length);
  }

  function connectionCard(segment, next) {
    if (!next || !segment.to || segment.to !== next.from) return "";
    // Compare supplied local clocks only at the same airport on the same date.
    const pattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
    const arrival = String(segment.arrival || "").match(pattern);
    const departure = String(next.departure || "").match(pattern);
    if (!arrival || !departure || arrival[1] !== departure[1]) return "";
    const date = new Date(`${arrival[1]}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== arrival[1]) return "";
    const a = Number(arrival[2])*60 + Number(arrival[3]);
    const b = Number(departure[2])*60 + Number(departure[3]);
    if ([arrival,departure].some(value=>Number(value[2])>23 || Number(value[3])>59) || b <= a) return "";
    const minutes = b-a;
    return `<div class="gt63-print-connection"><span>Престой в ${escapeHtml(segment.to)}</span><strong>${Math.floor(minutes/60)} ч. ${minutes%60} мин.</strong><small>Между посочените местни часове</small></div>`;
  }

  function technicalSegments(title, segments = []) {
    if (!segments.length) return "";
    return `
      <section class="gt63-print-technical-group">
        <h3>${escapeHtml(title)}</h3>
        <div class="gt63-print-segment-list">
          ${segments.map((segment, index) => `
            <article class="gt63-print-segment">
              <strong>${escapeHtml(localize([segment.airline, segment.flightNumber].filter(Boolean).join(" ") || "Полетен сегмент"))}</strong>
              <span>${escapeHtml(text(segment.from || segment.departureAirport, ""))} → ${escapeHtml(text(segment.to || segment.arrivalAirport, ""))}</span>
              <span>${escapeHtml(formatPrintDateTime(segment.departure || segment.date))}${segment.arrival ? ` → ${escapeHtml(formatPrintDateTime(segment.arrival))}` : ""}</span>
              ${segment.duration ? `<small>${escapeHtml(localize(segment.duration))}</small>` : ""}
            </article>
            ${connectionCard(segment, segments[index + 1])}
          `).join("")}
        </div>
      </section>
    `;
  }

  function luxuryIcon(name) {
    const shapes = {
      star: '<path d="m12 2 3 6.1 6.7 1-4.9 4.8 1.2 6.7-6-3.2-6 3.2 1.2-6.7-4.9-4.8 6.7-1Z" fill="currentColor" stroke="none"/>',
      room: '<path d="M3 20V6m18 14v-8H3m0 5h18M6 8h4v4H6zm6 0h6a3 3 0 0 1 3 3v1h-9Z"/>',
      guests: '<circle cx="12" cy="7" r="3"/><path d="M7 21v-5a5 5 0 0 1 10 0v5M3 7a2 2 0 1 0 0 4m18-4a2 2 0 1 1 0 4M2 20v-4a3 3 0 0 1 3-3m17 7v-4a3 3 0 0 0-3-3"/>',
      meal: '<path d="M5 3v6m3-6v6m-6-6v6a3 3 0 0 0 6 0m-3 3v9m14 0V3c-5 3-5 10 0 10"/>',
      location: '<path d="M12 22S4 14 4 9a8 8 0 0 1 16 0c0 5-8 13-8 13Z"/><circle cx="12" cy="9" r="2.5"/>',
      price: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v5c0 4 16 4 16 0V5M4 10v5c0 4 16 4 16 0v-5M4 15v4c0 4 16 4 16 0v-4"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
      warning: '<path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v1"/>',
      check: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m6.5 12 3.5 3.5 7.5-8" stroke="#fff"/>'
    };
    return `<svg class="gt63-luxury-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name] || ""}</svg>`;
  }

  function luxuryHotelDetails(viewModel, hotel, images, decoration) {
    const rawStars = viewModelApi.numericStars(hotel), count = Number(rawStars?.replace(",", "."));
    const stars = Number.isInteger(count) && count >= 1 && count <= 5
      ? `<div class="gt63-luxury-stars" role="img" aria-label="Категория: ${escapeHtml(rawStars)} звезди">${Array.from({length:count},()=>luxuryIcon("star")).join("")}</div>` : "";
    const items = [
      { icon: "star", label: "Категория", value: starsLabel(hotel) },
      { icon: "room", label: "Стая", value: hotel.room || hotel.roomType || "Стая за потвърждение" },
      { icon: "guests", label: "Хотелска заетост", value: viewModelApi.hotelOccupancyLabel(hotel.occupancy) },
      { icon: "meal", label: "Изхранване", value: viewModel.selectedMealPlan },
      { icon: "location", label: "Локация", value: hotel.area || hotel.location || hotel.city || "Локация за потвърждение" },
      { icon: "price", label: "Крайна цена", value: printPrice(viewModel.selectedPayload.priceDisplay) }
    ];
    const reasons = (viewModel.selectedRecommendationReasons || []).filter(reason => !/потвърждение|непотвърден|не е посочен/i.test(reason)).slice(0,3);
    const benefits = reasons.length ? `<ul class="gt63-luxury-benefits">${reasons.map(reason=>`<li>${luxuryIcon("check")}<span>${escapeHtml(reason)}</span></li>`).join("")}</ul>` : "";
    const url = hotelUrl(hotel);
    return `<section class="gt63-print-section gt63-print-selected-details with-gallery gt63-luxury-hotel">
      ${decoration}
      <header class="gt63-print-section-head gt63-luxury-heading">
        <div class="gt63-luxury-eyebrow"><p class="gt63-print-kicker">Избран хотел</p><span class="gt63-luxury-brand">AYA TRAVEL · GT63</span></div>
        <h2>${escapeHtml(text(hotel.name,"Избран хотел за потвърждение"))}</h2>
        ${stars}
      </header>
      <div class="gt63-print-editorial-grid">
        <div class="gt63-luxury-visual-column">
          <div class="gt63-print-hotel-imagery">
            ${imageFrame(images[0],"Снимка на избрания хотел","","is-dominant")}
            <div class="gt63-print-hotel-thumbs">${images.slice(1,3).map((image,index)=>imageFrame(image,`Допълнителна снимка ${index+1}`,"","is-thumb")).join("")}</div>
          </div>
          ${benefits}
        </div>
        <div class="gt63-luxury-information">
          <p>${escapeHtml(localize(text(viewModelApi.mealSafeDescription(hotel),"Описание на хотела за потвърждение.")))}</p>
          <dl class="gt63-print-fact-grid gt63-luxury-facts">${items.map(item=>`<div class="gt63-print-fact${item.icon==="price" ? " is-price" : ""}">${luxuryIcon(item.icon)}<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(localize(item.value))}</dd></div></div>`).join("")}</dl>
          ${url ? `<p class="gt63-print-link">Хотел: ${escapeHtml(url)}</p>` : ""}
        </div>
      </div>
      <svg class="gt63-luxury-wave" viewBox="0 0 1000 70" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 22C220-20 600 125 1000 18V70H0Z" fill="currentColor" opacity=".22"/><path d="M0 30C250-10 610 130 1000 27V39C610 142 250 2 0 42Z" fill="currentColor"/><path d="M0 54C290 18 620 150 1000 45V70H0Z" fill="#172a43"/></svg>
    </section>`;
  }

  function selectedHotelDetails(viewModel) {
    const hotel = viewModel.selectedHotel || {};
    const images = imageUrls(hotel, 3);
    const image = images[0] || "";
    const url = hotelUrl(hotel);
    const description = localize(text(viewModelApi.mealSafeDescription(hotel), "Описание на хотела за потвърждение."));
    const facts = factGrid([
      { label: "Категория", value: starsLabel(hotel) },
      { label: "Стая", value: hotel.room || hotel.roomType || "Стая за потвърждение" },
      { label: "Хотелска заетост", value: viewModelApi.hotelOccupancyLabel(hotel.occupancy) },
      { label: "Изхранване", value: viewModel.selectedMealPlan },
      { label: "Локация", value: hotel.area || hotel.location || hotel.city || "Локация за потвърждение" },
      { label: "Крайна цена", value: printPrice(viewModel.selectedPayload.priceDisplay) }
    ]);

    const decoration = images.length ? `<div class="gt63-seasonal-hotel-background" aria-hidden="true"><img src="${escapeHtml(images[images.length - 1])}" alt="" role="presentation"></div>` : "";
    if (images.length > 1) return luxuryHotelDetails(viewModel, hotel, images, decoration);
    return editorialSection(`gt63-print-selected-details${images.length > 1 ? " with-gallery" : ""}`, "Избран хотел", text(hotel.name, "Избран хотел за потвърждение"), `
      ${decoration}
      <div class="gt63-print-editorial-grid">
        <div class="gt63-print-hotel-imagery">
          ${imageFrame(image, "Снимка на избрания хотел", "", "is-dominant")}
          ${images.length > 1 ? `
            <div class="gt63-print-hotel-thumbs">
              ${images.slice(1, 3).map((thumb, index) => imageFrame(thumb, `Допълнителна снимка ${index + 1}`, "", "is-thumb")).join("")}
            </div>
          ` : ""}
        </div>
        <div>
          <p>${escapeHtml(description)}</p>
          ${facts}
          ${url ? `<p class="gt63-print-link">Хотел: ${escapeHtml(url)}</p>` : ""}
        </div>
      </div>
    `);
  }

  function includedServicesBlock(viewModel, input = {}) {
    const hotel = viewModel.selectedHotel || {}, flight = input.flight || {}, transfer = input.transfer || {};
    const quoted = [], included = [], pending = [];
    if (hotel.name) quoted.push({ icon: "room", label: "Настаняване", value: hotel.name, detail: hotel.room || hotel.roomType || "Стая за потвърждение" });
    (hotel.occupancy?.confirmed === true ? quoted : pending).push({ icon: "guests", label: "Хотелска заетост", value: viewModelApi.hotelOccupancyLabel(hotel.occupancy) });
    const meals = Object.values(viewModelApi.mealServiceEvidence(hotel.meal || hotel.board));
    const paidMeal = meals.find(meal => meal.state === "paid");
    const includedMeal = meals.find(meal => meal.state === "included");
    if (paidMeal && includedMeal && !paidMeal.clauses.some(clause => includedMeal.clauses.includes(clause))) {
      pending.push({ icon: "meal", label: "Изхранване", value: paidMeal.clauses.join("; ") });
      included.push({ icon: "meal", label: "Изхранване", value: includedMeal.clauses.join("; ") });
    } else {
      (detailNeedsConfirmation(viewModel.selectedMealPlan) || paidMeal ? pending : quoted).push({ icon: "meal", label: "Изхранване", value: viewModel.selectedMealPlan });
    }
    if (hasMeaningfulFlight(input)) (baggageLabel(flight.baggage) === "Багажът подлежи на потвърждение" || detailNeedsConfirmation(flight.baggage) ? pending : quoted).push({ icon: "info", label: "Багаж", value: baggageLabel(flight.baggage) });
    if (transfer.included || transfer.price > 0 || transfer.type || transfer.status || transfer.route || transfer.description) {
      (transfer.included === true ? included : pending).push({ icon: "location", label: "Трансфер", value: transferSummary(input) });
    }
    const group = (items, state, heading) => items.length ? `<div class="gt63-service-group${items.length === 1 ? " is-single" : items.length === 3 ? " is-three" : ""}" data-service-state="${state}"><h3>${escapeHtml(heading)}</h3><div class="gt63-print-service-grid">${items.map(item => `<article class="gt63-print-service-card">${luxuryIcon(item.icon)}<div><p>${escapeHtml(item.label)}</p><strong>${escapeHtml(localize(item.value))}</strong>${item.detail ? `<small>${escapeHtml(localize(item.detail))}</small>` : ""}<span>${state === "included" ? "Изрично посочено като включено" : state === "pending" ? "За потвърждение преди резервация" : "Данни за избрания вариант"}</span></div></article>`).join("")}</div></div>` : "";
    const images = imageUrls(hotel, 3), photo = images[1] || images[0];
    return editorialSection("gt63-print-included-services gt63-luxury-services", "Вашият избран вариант", "ЦЕНАТА ВКЛЮЧВА", `
      <p class="gt63-service-explanation">Компонентите са данни от предложението. Непотвърдените услуги не са обозначени като включени.</p>
      ${group(quoted, "quoted", "Компоненти на предложението")}
      ${group(included, "included", "Посочено като включено")}
      ${group(pending, "pending", "Условия за потвърждение")}
      ${photo ? imageFrame(photo, `Снимка към ${hotel.name || "избрания хотел"}`, "Снимка към избрания хотел", "gt63-luxury-service-photo") : ""}
    `);
  }

  function canonicalTimelineItems(input = {}) {
    const source = Array.isArray(input.timeline) ? input.timeline
      : Array.isArray(input.program) ? input.program
        : Array.isArray(input.itinerary) ? input.itinerary
          : Array.isArray(input.events) ? input.events
            : [];
    return source.map((item) => ({
      date: nonEmpty(item.date || item.day || item.when || item.time),
      title: nonEmpty(item.title || item.name || item.label),
      description: nonEmpty(item.description || item.details || item.summary || item.text)
    })).filter((item) => item.date || item.title || item.description);
  }

  function timelineBlock(input = {}) {
    const items = canonicalTimelineItems(input);
    if (!items.length) return "";
    return editorialSection("gt63-print-timeline", "Програма", "Хронология на пътуването", `
      <div class="gt63-print-timeline-list">
        ${items.map((item) => `
          <article class="gt63-print-timeline-item">
            ${item.date ? `<span>${escapeHtml(localize(item.date))}</span>` : ""}
            <h3>${escapeHtml(localize(item.title || "Етап от пътуването"))}</h3>
            ${item.description ? `<p>${escapeHtml(localize(item.description))}</p>` : ""}
          </article>
        `).join("")}
      </div>
    `);
  }

  function canonicalExperienceItems(input = {}) {
    const source = Array.isArray(input.optionalExperiences) ? input.optionalExperiences
      : Array.isArray(input.experiences) ? input.experiences
        : Array.isArray(input.excursions) ? input.excursions
          : [];
    return source.map((item) => ({
      title: nonEmpty(item.title || item.name),
      description: nonEmpty(item.description || item.summary || item.details),
      location: nonEmpty(item.location || item.area),
      duration: nonEmpty(item.duration),
      price: nonEmpty(item.priceDisplay || item.price),
      currency: nonEmpty(item.currency),
      image: imageUrl(item)
    })).filter((item) => item.title || item.description || item.location || item.duration || item.price || item.image);
  }

  function optionalExperiencesBlock(input = {}) {
    const experiences = canonicalExperienceItems(input);
    if (!experiences.length) return "";
    return editorialSection("gt63-print-experiences", "По желание", "Допълнителни преживявания", `
      <div class="gt63-print-experience-grid">
        ${experiences.map((experience) => `
          <article class="gt63-print-experience-card">
            ${imageFrame(experience.image, experience.title ? `Снимка към ${experience.title}` : "Снимка към преживяване")}
            <div>
              <p class="gt63-print-kicker">Опционално</p>
              ${experience.title ? `<h3>${escapeHtml(localize(experience.title))}</h3>` : ""}
              ${experience.description ? `<p>${escapeHtml(localize(experience.description))}</p>` : ""}
              ${factGrid([
                { label: "Локация", value: experience.location },
                { label: "Продължителност", value: experience.duration },
                { label: "Цена", value: [experience.price, experience.currency].filter(Boolean).join(" ") || "За потвърждение" }
              ], "is-compact")}
            </div>
          </article>
        `).join("")}
      </div>
    `);
  }

  function recommendationBlock(viewModel) {
    const reasons = viewModel.selectedRecommendationReasons || [];
    if (!reasons.length) return "";
    return editorialSection("gt63-print-recommendation", "Препоръка от GT63", "Защо тази опция", `
      <ul class="gt63-print-reason-list">
        ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
      </ul>
    `);
  }

  function investmentPage(viewModel, input = {}, options = {}) {
    const hotel = viewModel.selectedHotel || {};
    const services = [
      { label: "Избран хотел", value: hotel.name },
      { label: "Стая", value: hotel.room || hotel.roomType },
      { label: "Хотелска заетост", value: viewModelApi.hotelOccupancyLabel(hotel.occupancy) },
      { label: "Изхранване", value: viewModel.selectedMealPlan },
      { label: "Полети", value: input.flight?.airline || input.flight?.route },
      { label: "Багаж", value: baggageLabel(input.flight?.baggage) },
      { label: "Трансфер", value: transferSummary(input) }
    ].filter(item => nonEmpty(item.value));
    services.push(...materialConditions(input, options).map(item=>({
      label:item.level === "info" ? "Информация" : item.level === "blocking" ? "Съществено условие" : "Условие на предложението",
      value:item.text, level:item.level
    })));
    return `<div class="gt63-print-investment-page gt63-luxury-investment-page">
      <section class="gt63-print-investment">
        <div class="gt63-luxury-eyebrow"><p class="gt63-print-kicker">Вашето предложение</p><span class="gt63-luxury-brand">AYA TRAVEL · GT63</span></div>
        <h2>Инвестиция във Вашето пътуване</h2>
        <p class="gt63-investment-period">${escapeHtml(viewModel.travelDates)}${input.client?.travelers ? ` · ${escapeHtml(input.client.travelers)}` : ""}</p>
        <div class="gt63-print-investment-amount">
          ${luxuryIcon("price")}<div><span>Обща цена на пътуването</span><strong>${escapeHtml(printPrice(viewModel.selectedPayload.priceDisplay))}</strong>
          <p>Наличността, финалните условия и статусът на резервацията подлежат на потвърждение преди запазване.</p>
          <p class="gt63-offer-not-booking">Офертата не представлява потвърдена резервация.</p></div>
        </div>
        <div class="gt63-print-investment-list">${services.map(service => `<article${service.level ? ` data-material-condition data-notice-level="${service.level}"` : ""}><span>${escapeHtml(service.label)}</span><strong>${escapeHtml(localize(service.value))}</strong></article>`).join("")}</div>
        ${journeyOverview(input, true) ? `<section class="gt63-print-investment-overview"><h3>Пътуването с един поглед</h3>${journeyOverview(input, true)}</section>` : ""}
      </section>
    </div>`;
  }

  function comparisonTable(viewModel, input = {}, options = {}) {
    if (!viewModel.hotelOptions.length) return "";
    const conditions = materialConditions(input, {...options, mode:"comparison"});
    const conditionList = items => `<ul>${items.map(item=>`<li data-material-condition data-notice-level="${item.level}">${escapeHtml(localize(item.text))}</li>`).join("")}</ul>`;
    const rows = viewModel.hotelOptions.map((hotel, index) => {
      const payload = viewModelApi.selectedOptionPayload(hotel, index, viewModel.currency, viewModel.input);
      const selected = index === viewModel.selectedHotelIndex;
      const hotelConditions = conditions.filter(item=>item.hotelId === viewModelApi.hotelIdentity(hotel,index));
      return `
        <tr${selected ? " class=\"selected\"" : ""}>
          <td>${escapeHtml(payload.label)}${selected ? " · Избран хотел" : ""}</td>
          <td>${escapeHtml(payload.name)}</td>
          <td>${escapeHtml(starsLabel(hotel))}</td>
          <td>${escapeHtml(localize(text(hotel.room || hotel.roomType, "За потвърждение")))}</td>
          <td>${escapeHtml(payload.mealPlan)}</td>
          <td>${escapeHtml(printPrice(payload.priceDisplay))}</td>
        </tr>
        ${hotelConditions.length ? `<tr><td colspan="6"><strong>${escapeHtml(hotel.name || payload.label)}</strong>${conditionList(hotelConditions)}</td></tr>` : ""}
      `;
    }).join("");
    return editorialSection("gt63-print-comparison", "Сравнение", "Варианти за настаняване", `
      <table>
        <thead>
          <tr>
            <th>Опция</th>
            <th>Хотел</th>
            <th>Категория</th>
            <th>Стая</th>
            <th>Изхранване</th>
            <th>Крайна цена</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        ${conditions.some(item=>!item.hotelId) ? `<tfoot><tr><td colspan="6">${conditionList(conditions.filter(item=>!item.hotelId))}</td></tr></tfoot>` : ""}
      </table>
    `);
  }

  function flightBlock(input = {}) {
    const flight = input.flight || {};
    const outbound = Array.isArray(flight.outboundSegments) ? flight.outboundSegments : [];
    const inbound = Array.isArray(flight.inboundSegments) ? flight.inboundSegments : [];
    if (!hasMeaningfulFlight(input)) return "";
    const details = factGrid([
      { label: "Авиокомпания", value: flight.airline || "Авиокомпания за потвърждение" },
      { label: "Маршрут", value: flight.route || "Маршрут за потвърждение" },
      { label: "Багаж", value: baggageLabel(flight.baggage) }
    ], "is-compact");

    return editorialSection("gt63-print-flight", "Полети", localize(text(flight.route || flight.airline, "Полетна информация")), `
      ${details}
      <p class="gt63-print-local-times">Часовете са местни за съответното летище.</p>
      <div class="gt63-print-flight-columns">
        ${technicalSegments("Отиване", outbound)}
        ${technicalSegments("Връщане", inbound)}
        ${!outbound.length && nonEmpty(flight.outbound) ? `<p><strong>Отиване:</strong> ${escapeHtml(localize(flight.outbound))}</p>` : ""}
        ${!inbound.length && nonEmpty(flight.inbound) ? `<p><strong>Връщане:</strong> ${escapeHtml(localize(flight.inbound))}</p>` : ""}
      </div>
    `);
  }

  function luxuryPageWave() {
    return `<svg class="gt63-luxury-page-wave" viewBox="0 0 1000 70" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 22C220-20 600 125 1000 18V70H0Z" fill="currentColor" opacity=".22"/><path d="M0 30C250-10 610 130 1000 27V39C610 142 250 2 0 42Z" fill="currentColor"/><path d="M0 54C290 18 620 150 1000 45V70H0Z" fill="#172a43"/></svg>`;
  }

  // PDF-only typography; never recalculate or mutate a package amount.
  function printPrice(value) {
    return String(value || "").replace(/(\d[\d \u00a0\u202f]*)([, .])(\d{2})(?=\s+[A-Z]{3}\b)/g, (_, integer, separator, cents) =>
      integer.replace(/\s/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + cents);
  }

  function ctaBlock(viewModel, input = {}) {
    const contactPhone = nonEmpty(input.contact?.whatsappPhone || input.contact?.phone);
    const contactEmail = nonEmpty(input.contact?.email);
    const agency = nonEmpty(input.contact?.agency || input.agency?.name || input.brand?.agencyName || "GT63");
    const hotel = viewModel.selectedHotel || {}, image = imageUrl(hotel);
    return `
      ${image ? `<div class="gt63-luxury-closing-background" aria-hidden="true"><img src="${escapeHtml(image)}" alt="" role="presentation"></div>` : ""}
      <section class="gt63-print-closing gt63-luxury-closing">
        <div class="gt63-print-closing-copy">
          <p class="gt63-print-kicker">AYA TRAVEL · ${escapeHtml(agency)}</p>
          <h2>Вашето пътуване започва оттук.</h2>
          <p>Посочете избрания хотел на консултанта. Ще проверим актуалната наличност и непотвърдените условия, преди да продължим към резервация.</p>
          <div class="gt63-luxury-next-step"><span>Следваща стъпка</span><strong>Свържете се с консултанта</strong><p>Изборът на хотел не е потвърдена резервация.</p></div>
        </div>
        <div class="gt63-print-closing-footer">
          <div><span>Избран хотел</span><strong>${escapeHtml(hotel.name || "Хотел за потвърждение")}</strong></div>
          <div><span>Крайна цена на предложението</span><strong>${escapeHtml(printPrice(viewModel.selectedPayload.priceDisplay))}</strong></div>
          <div><span>Период на пътуване</span><strong>${escapeHtml(viewModel.travelDates)}</strong></div>
          <div><span>Подготвено от</span><strong>${escapeHtml(agency)}</strong></div>
          ${contactPhone ? `<div><span>Контакт с консултант</span><strong>${escapeHtml(contactPhone)}</strong></div>` : ""}
          ${contactEmail ? `<div><span>Имейл</span><strong>${escapeHtml(contactEmail)}</strong></div>` : ""}
          ${!contactPhone && !contactEmail ? `<div><span>Контакт</span><strong>Контактите на консултанта са за потвърждение.</strong></div>` : ""}
        </div>
      </section>
      ${luxuryPageWave()}
    `;
  }

  function materialConditions(input = {}, options = {}) {
    const seenMealConditions = new Set();
    const notices = printNotices(input, options).map(item => {
      // Only these complete collection-level messages describe the proven duplicate.
      // Keep added qualifications, hotel-specific notices and other severities separate.
      const message = item.text.replace(/^(?:Важно|Информация):\s*/, "");
      const duplicateMeal = message === viewModelApi.unconfirmedMealNotice;
      return { ...item, duplicateMeal };
    }).filter(item => {
      if (!item.duplicateMeal) return true;
      if (seenMealConditions.has(item.level)) return false;
      seenMealConditions.add(item.level);
      return true;
    }).map(item => item.duplicateMeal ? {
      ...item, text: `${item.level === "info" ? "Информация" : "Важно"}: ${viewModelApi.unconfirmedMealNotice}`
    } : item);
    return notices;
  }

  function renderPrintProposal(input = {}, options = {}) {
    // PDF dates must never fall back to destination.requested (which can be a city).
    // Keep the shared HTML view model contract and the saved input unchanged.
    const printInput = nonEmpty(input.client?.travelDates) ? input : {
      ...input, client: { ...input.client, travelDates: "Датите са за потвърждение" }
    };
    const viewModel = viewModelApi.buildPresentationViewModel(printInput, options);
    if (detailNeedsConfirmation(viewModel.selectedMealPlan)) viewModel.selectedMealPlan = "Хранене за потвърждение";
    const mode = viewModel.contract.mode;
    const seasonal = resolveSeasonalTheme(input);
    const flight = flightBlock(input);
    const selectedPages = [
      contentPage("gt63-print-hotel-page", [
        journeyIntroductionPage(viewModel, input),
        selectedHotelDetails(viewModel)
      ].join("")),
      contentPage(`gt63-print-services-page${flight ? " gt63-print-flight-page" : ""}`, [
        flight,
        includedServicesBlock(viewModel, input)
      ].filter(Boolean).join("")),
      contentPage("gt63-print-investment-content-page", [
        investmentPage(viewModel, input, options),
        luxuryPageWave()
      ].join("")),
      contentPage("gt63-print-timeline-page", timelineBlock(input)),
      contentPage("gt63-print-experiences-page", optionalExperiencesBlock(input))
    ].filter(Boolean).join("");
    const comparisonContent = [
      recommendationBlock(viewModel),
      comparisonTable(viewModel, input, options),
      flightBlock(input),
      transferBlock(input)
    ].filter(Boolean).join("");

    return `
      <article class="gt63-print-proposal" data-print-mode="${escapeHtml(mode)}" data-seasonal-theme="${seasonal.theme}" data-seasonal-region="${seasonal.region}">
        ${mode === "selected" ? `<div class="gt63-print-flow-footer" aria-hidden="true">${luxuryPageWave()}</div>` : ""}
        ${coverPage(viewModel, input, mode)}
        ${mode === "comparison" ? printPage("gt63-print-content-page", comparisonContent) : selectedPages}
        ${printPage("gt63-print-final-page", ctaBlock(viewModel, input))}
      </article>
    `;
  }

  return {
    resolveSeasonalTheme,
    renderPrintProposal
  };
});


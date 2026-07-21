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

  function compactMealLabel(value) {
    const raw = text(value, "");
    if (!raw) return "Хранене според избраната оферта";
    if (/all\s*inclusive|всичко включено/i.test(raw)) return "All Inclusive";
    if (/half\s*board|полупансион/i.test(raw)) return "Полупансион";
    if (/full\s*board|пълен пансион/i.test(raw)) return "Пълен пансион";
    if (/breakfast|закуска/i.test(raw)) return "Закуска";
    if (/room\s*only|без хранене/i.test(raw)) return "Без включено хранене";
    return raw.length > 34 ? "Хранене според избраната оферта" : raw;
  }

  const BG_MONTHS = [
    "януари",
    "февруари",
    "март",
    "април",
    "май",
    "юни",
    "юли",
    "август",
    "септември",
    "октомври",
    "ноември",
    "декември"
  ];

  function localizeClientText(value) {
    const raw = text(value, "");
    if (!raw) return "";
    return raw
      .replace(/\bJanuary\b/gi, "януари")
      .replace(/\bFebruary\b/gi, "февруари")
      .replace(/\bMarch\b/gi, "март")
      .replace(/\bApril\b/gi, "април")
      .replace(/\bMay\b/gi, "май")
      .replace(/\bJune\b/gi, "юни")
      .replace(/\bJuly\b/gi, "юли")
      .replace(/\bAugust\b/gi, "август")
      .replace(/\bSeptember\b/gi, "септември")
      .replace(/\bOctober\b/gi, "октомври")
      .replace(/\bNovember\b/gi, "ноември")
      .replace(/\bDecember\b/gi, "декември")
      .replace(/\bself[-\s]?transfer\b/gi, "Самостоятелно прехвърляне")
      .replace(/\bchecked baggage included\b/gi, "Включен регистриран багаж")
      .replace(/\bcabin baggage included\b/gi, "Включен ръчен багаж")
      .replace(/\bbreakfast included\b/gi, "Включена закуска")
      .replace(/\broom only\b/gi, "Без включено хранене");
  }

  function clientDateTimeLabel(value = "") {
    const raw = text(value, "");
    if (!raw) return "";
    const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}:\d{2}))?/);
    if (iso) {
      const day = Number(iso[3]);
      const month = BG_MONTHS[Number(iso[2]) - 1] || iso[2];
      return [Number.isFinite(day) ? `${day} ${month}` : "", iso[4] || ""].filter(Boolean).join(" · ");
    }
    return localizeClientText(raw);
  }

  function numericStars(hotel = {}) {
    const raw = String(hotel.stars || hotel.category || hotel.rating || "").trim();
    const match = raw.match(/[1-5](?:[.,]\d)?/);
    return match ? match[0].replace(".", ",") : "";
  }

  function optionPositionSummary(hotel = {}, hotelOptions = [], input = {}) {
    const selectedPrice = optionPackageTotal(hotel, input) || amount(hotel.price);
    const optionPrices = hotelOptions
      .map((option) => optionPackageTotal(option, input) || amount(option.price))
      .filter((price) => price > 0);
    if (!selectedPrice || optionPrices.length < 2) return "";
    const lowerCount = optionPrices.filter((price) => selectedPrice < price).length;
    const higherCount = optionPrices.filter((price) => selectedPrice > price).length;
    if (lowerCount > 0) return `Цената е по-ниска от ${lowerCount} от сравняваните варианти.`;
    if (higherCount === 0) return "Това е най-ниската цена сред показаните варианти.";
    return "";
  }

  function supportedRecommendationReasons(input = {}, selectedHotel = {}, hotelOptions = []) {
    const reasons = [];
    const add = (value) => {
      const cleaned = text(value, "");
      if (cleaned && !reasons.includes(cleaned)) reasons.push(cleaned);
    };
    const stars = numericStars(selectedHotel);
    add(optionPositionSummary(selectedHotel, hotelOptions, input));
    if (stars) add(`Хотелът е категория ${stars}.`);
    if (selectedHotel.room || selectedHotel.roomType) add(`Стая: ${localizeClientText(selectedHotel.room || selectedHotel.roomType)}.`);
    if (selectedHotel.meal || selectedHotel.board) add(`Изхранване: ${compactMealLabel(selectedHotel.meal || selectedHotel.board)}.`);
    if (input.client?.travelers) add(`Офертата е подготвена за ${text(input.client.travelers)} пътуващи.`);
    if (input.client?.travelDates || input.destination?.requested) add(`Период: ${localizeClientText(input.client?.travelDates || input.destination?.requested)}.`);
    if (input.transfer?.included || input.transfer?.type || input.transfer?.status || input.transfer?.price > 0) add("Има данни за трансфер в офертата.");
    if (selectedHotel.area || selectedHotel.location || selectedHotel.city) add(`Локация: ${localizeClientText(selectedHotel.area || selectedHotel.location || selectedHotel.city)}.`);
    if (selectedHotel.reviewScore || selectedHotel.ratingText || selectedHotel.reviews) add(`Има подадени данни за оценка/ревю: ${localizeClientText(selectedHotel.reviewScore || selectedHotel.ratingText || selectedHotel.reviews)}.`);
    if (selectedHotel.cancellation || selectedHotel.bookingConditions || selectedHotel.conditions) add(`Условия: ${localizeClientText(selectedHotel.cancellation || selectedHotel.bookingConditions || selectedHotel.conditions)}.`);
    const amenities = [
      ...(Array.isArray(selectedHotel.amenities) ? selectedHotel.amenities : []),
      ...(Array.isArray(selectedHotel.highlights) ? selectedHotel.highlights : [])
    ].map((item) => text(item, "")).filter(Boolean);
    amenities.slice(0, 2).forEach((item) => add(`Посочено удобство: ${localizeClientText(item)}.`));
    return reasons.slice(0, 4);
  }

  function dataAttr(value) {
    return escapeHtml(String(value ?? ""));
  }

  function dateRangeNights(value = "") {
    const matches = String(value || "").match(/\d{4}-\d{2}-\d{2}/g) || [];
    if (matches.length < 2) return "";
    const start = new Date(`${matches[0]}T00:00:00Z`);
    const end = new Date(`${matches[1]}T00:00:00Z`);
    const diff = Math.round((end - start) / 86400000);
    return Number.isFinite(diff) && diff > 0 ? `${diff} нощувки` : "";
  }

  function heroFacts(input = {}, selectedPayload = {}, selectedHotel = {}, travelDates = "") {
    const facts = [];
    const add = (label, value) => {
      const cleaned = text(value, "");
      if (cleaned) facts.push([label, localizeClientText(cleaned)]);
    };
    add("Дестинация", input.destination?.name || input.destination?.requested || input.content?.heroTitle);
    add("Хотел", selectedPayload.name);
    add("Категория", numericStars(selectedHotel) ? `${numericStars(selectedHotel)} звезди` : "");
    add("Дати", travelDates);
    add("Период", dateRangeNights(travelDates));
    add("Пътуващи", input.client?.travelers);
    add("Стая", selectedHotel.room || selectedHotel.roomType);
    add("Хранене", compactMealLabel(selectedHotel.meal || selectedHotel.board));
    add("Локация", selectedHotel.area || selectedHotel.location || selectedHotel.city);
    return facts.slice(0, 9);
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

  function selectedHotelIndex(hotelOptions = [], activeHotel = {}, input = {}) {
    const explicitIndex = Number(
      input.selectedHotelIndex ??
      input.selectedHotel?.index ??
      input.selection?.selectedHotelIndex ??
      input.selection?.hotelIndex
    );
    if (Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < hotelOptions.length) {
      return explicitIndex;
    }
    const selectedIndex = hotelOptions.findIndex((hotel) => hotel?.selected);
    if (selectedIndex >= 0) return selectedIndex;
    const activeName = String(input.selectedHotel?.name || activeHotel?.name || "").trim();
    if (activeName) {
      const matchingIndex = hotelOptions.findIndex((hotel) => String(hotel?.name || "").trim() === activeName);
      if (matchingIndex >= 0) return matchingIndex;
    }
    return 0;
  }

  function selectedOptionPayload(hotel = {}, index, currency, input) {
    const label = `Хотелска опция ${index + 1}`;
    const hotelOnly = amount(hotel.price);
    const total = optionPackageTotal(hotel, input) || hotelOnly;
    const name = text(hotel.name, label);
    const priceDisplay = money(total, currency);
    const hotelPriceDisplay = money(hotelOnly, currency);
    const whatsappPhone = String(input.contact?.whatsappPhone || "359885078980").replace(/[^\d]/g, "");
    const preferMessage = encodeURIComponent(`Предпочитам ${name} - обща пакетна цена ${priceDisplay}`);

    return {
      label,
      name,
      priceDisplay,
      hotelPriceDisplay,
      whatsappUrl: `https://wa.me/${whatsappPhone}?text=${preferMessage}`
    };
  }

  function hotelSubtitle(hotel = {}) {
    return localizeClientText(text(
      hotel.subtitle ||
      hotel.area ||
      hotel.location ||
      hotel.description,
      "Детайли за настаняването за потвърждение"
    ));
  }

  function hotelHighlights(hotel = {}) {
    const candidates = [
      ...(Array.isArray(hotel.amenities) ? hotel.amenities : []),
      ...(Array.isArray(hotel.highlights) ? hotel.highlights : []),
      ...(Array.isArray(hotel.travelHighlights) ? hotel.travelHighlights : []),
      hotel.roomsLeft,
      hotel.availability
    ].filter(Boolean).map((item) => localizeClientText(item).trim()).filter(Boolean);
    return [...new Set(candidates)].slice(0, 8);
  }

  function packageIncludes(input = {}, selectedHotel = {}) {
    const flight = input.flight || {};
    const transfer = input.transfer || {};
    const items = [];
    const add = (label, condition) => {
      if (condition) items.push(label);
    };

    add("Самолетни билети", Boolean(flight.airline || flight.route || flight.outboundSegments?.length || flight.inboundSegments?.length));
    add("Настаняване", Boolean(selectedHotel.name || selectedHotel.room || selectedHotel.area));
    add(`Изхранване: ${compactMealLabel(selectedHotel.meal || selectedHotel.board)}`, Boolean(selectedHotel.meal || selectedHotel.board));
    add("Летищен трансфер", Boolean(transfer.included || transfer.type || transfer.status || transfer.price > 0));
    add("Регистриран багаж", /checked|registr|23kg|30kg|багаж/i.test(String(flight.baggage || "")));
    add("Ръчен багаж", /cabin|carry|personal|ръчен|малка/i.test(String(flight.baggage || "")));
    add("Медицинска застраховка", /insurance|застрах/i.test(String(input.notes || input.content?.notes || "")));
    add("Курортни такси", /tax|taxes|resort/i.test(String(selectedHotel.description || selectedHotel.notes || "")));
    add("Частен трансфер", /private|частен/i.test(String(transfer.type || transfer.status || transfer.note || "")));
    add("Съдействие за виза", /visa|виза/i.test(String(input.notes || input.content?.notes || "")));

    return [...new Set(items)];
  }

  function packageExclusions(input = {}, selectedHotel = {}) {
    const haystack = [
      input.notes,
      input.content?.notes,
      selectedHotel.description,
      selectedHotel.notes,
      input.transfer?.note,
      input.transfer?.status
    ].filter(Boolean).join(" ");
    const items = [];
    const add = (label, pattern) => {
      if (pattern.test(haystack)) items.push(label);
    };

    add("Допълнителни екскурзии", /excursion|екскурз/i);
    add("Застраховка при анулация", /cancellation insurance|cancel.*insurance|анулац/i);
    add("Градска или туристическа такса", /city tax|туристическа такса/i);
    add("Визови такси", /visa fee|такса.*виза/i);
    add("Избор на места в самолета", /seat selection|premium seat|място/i);
    add("Лични разходи", /personal expenses|лични разходи/i);

    return [...new Set(items)];
  }

  function recommendationItems(input = {}, selectedHotel = {}, hotelOptions = []) {
    return supportedRecommendationReasons(input, selectedHotel, hotelOptions);
  }

  function bestForTags(hotel = {}) {
    const tags = [
      ...(Array.isArray(hotel.amenities) ? hotel.amenities : []),
      ...(Array.isArray(hotel.highlights) ? hotel.highlights : [])
    ].map((item) => text(item, "")).filter(Boolean);
    return [...new Set(tags)].slice(0, 6);
  }

  function checkList(items = [], emptyText = "") {
    if (!items.length) return emptyText ? `<p class="v11-muted">${escapeHtml(emptyText)}</p>` : "";
    return `<ul class="v11-check-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }

  function clientWarningText(value) {
    const raw = text(value, "");
    if (!raw) return "";
    if (/review|recommended|routed|engine|operator/i.test(raw)) {
      return "Има бележка за финален консултантски преглед преди потвърждение.";
    }
    return raw;
  }

  function flightStops(flight = {}) {
    const outboundStops = Math.max(0, (flight.outboundSegments || []).length - 1);
    const inboundStops = Math.max(0, (flight.inboundSegments || []).length - 1);
    const total = Math.max(outboundStops, inboundStops);
    if (!total) return "Директен или за потвърждение";
    return `${total} ${total === 1 ? "прекачване" : "прекачвания"}`;
  }

  function flightSummaryCards(flight = {}, travelDates = "") {
    const segments = [
      ...(flight.outboundSegments || []),
      ...(flight.inboundSegments || [])
    ];
    const duration = text(flight.totalDuration || flight.duration || flight.outboundDuration || flight.inboundDuration, "");
    const dates = localizeClientText(text(travelDates || flight.dates || flight.date, "Датите са за потвърждение"));
    const items = [
      ["Авиокомпания", text(flight.airline, "За потвърждение")],
      ["Дати", dates],
      ["Прекачвания", flightStops(flight)],
      ["Багаж", localizeClientText(text(flight.baggage, "За потвърждение"))],
      ["Сегменти", segments.length ? String(segments.length) : "За потвърждение"],
      ["Продължителност", duration || "Вижте детайлите по сегменти"]
    ];

    return `
      <div class="v11-flight-summary-grid">
        ${items.map(([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  function packageIcon(label = "") {
    if (/самолет|билет/i.test(label)) return "✈";
    if (/настаняване|хотел/i.test(label)) return "⌂";
    if (/изхранване|закуска|meal/i.test(label)) return "◌";
    if (/багаж/i.test(label)) return "▣";
    if (/трансфер/i.test(label)) return "→";
    if (/застрах/i.test(label)) return "◇";
    if (/такс/i.test(label)) return "✓";
    return "✓";
  }

  function packageIconCards(items = []) {
    if (!items.length) return '<p class="v11-muted">Включените услуги ще бъдат потвърдени преди резервация.</p>';
    return '<div class="v11-package-grid">' + items.map((item) => '<div class="v11-package-item"><span>' + escapeHtml(packageIcon(item)) + '</span><strong>' + escapeHtml(item) + '</strong></div>').join("") + '</div>';
  }

  function packageSummaryBlock(input = {}, selectedHotel = {}) {
    const included = packageIncludes(input, selectedHotel);
    const excluded = packageExclusions(input, selectedHotel);
    return `
      <div class="v11-package-summary">
        <div>
          <strong>Включено в пакета</strong>
          ${packageIconCards(included)}
        </div>
        ${excluded.length ? `
          <div class="v11-package-exclusions">
            <strong>Не е включено</strong>
            ${checkList(excluded)}
          </div>
        ` : ""}
      </div>
    `;
  }

  function insightBlock(input = {}, selectedHotel = {}, hotelOptions = []) {
    const items = recommendationItems(input, selectedHotel, hotelOptions);
    if (!items.length) return "";
    return `
      <section class="v11-card v11-insight-card">
        <p class="v11-kicker">Препоръка от GT63</p>
        <h4>Защо тази опция</h4>
        <ul class="v11-check-list js-gt63-recommendation-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
    `;
  }

  function destinationExperience(input = {}) {
    const title = text(input.content?.heroTitle || input.destination?.name || input.destination?.requested, "");
    const lines = [];
    if (title) {
      lines.push(`Предложението е подготвено за ${title} и подрежда полет, настаняване и цена в един ясен клиентски изглед.`);
      lines.push("Избраният хотел остава водещ, а останалите варианти са показани за спокойно сравнение преди потвърждение.");
    }
    if (!lines.length) return "";
    return `
      <section class="v11-card v11-destination-card">
        <p class="v11-kicker">Решението накратко</p>
        <h4>Как да прочетете офертата</h4>
        ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      </section>
    `;
  }

  function timelineStopLabel(value) {
    const display = root.GT63FlightDisplayBg;
    const cleaned = text(value, "");
    if (!cleaned) return "";
    return display?.airportName ? display.airportName(cleaned) : cleaned;
  }

  function segmentDateLabel(segment = {}) {
    const raw = text(segment.date || segment.departureDate || segment.departure || segment.departureTime, "");
    if (!raw) return "";
    const datePart = raw.split(/[T,]/)[0].trim();
    return clientDateTimeLabel(datePart || raw);
  }

  function segmentArrivalLabel(segment = {}) {
    const arrival = text(segment.arrival || segment.arrivalTime || segment.arrivalDate, "");
    const date = text(segment.arrivalDate || segment.date || segment.departureDate, "");
    if (/^\d{1,2}:\d{2}$/.test(arrival) && date) {
      return clientDateTimeLabel(`${date}T${arrival.padStart(5, "0")}`);
    }
    return clientDateTimeLabel(arrival || date);
  }

  function segmentRouteLabel(segment = {}) {
    const from = timelineStopLabel(segment.from || segment.departureAirport);
    const to = timelineStopLabel(segment.to || segment.arrivalAirport);
    return [from, to].filter(Boolean).join(" → ");
  }

  function travelTimeline(input = {}, selectedHotel = {}) {
    const flight = input.flight || {};
    const outbound = flight.outboundSegments || [];
    const inbound = flight.inboundSegments || [];
    const transfer = input.transfer || {};
    const destinationName = text(input.destination?.name || input.destination?.requested || input.content?.heroTitle, "");
    const items = [];
    const add = (label, title, detail, className = "") => {
      if (title) items.push({ label, title, detail: localizeClientText(detail), className });
    };

    if (outbound.length) {
      const first = outbound[0] || {};
      const last = outbound[outbound.length - 1] || {};
      add(segmentDateLabel(first) ? `Ден 1 · ${segmentDateLabel(first)}` : "Ден 1", `Полет ${segmentRouteLabel(first) || text(flight.route, "")}`, outbound.length > 1 ? `${outbound.length} сегмента` : "");
      const arrivalTime = segmentArrivalLabel(last);
      const arrivalPlace = timelineStopLabel(last.to || last.arrivalAirport);
      add(
        arrivalTime ? `Пристигане · ${arrivalTime}` : "Пристигане",
        destinationName ? `Пристигане в ${destinationName}` : "Пристигане",
        [arrivalTime, arrivalPlace].filter(Boolean).join(" · ")
      );
      if (transfer.included || transfer.type || transfer.status || transfer.price > 0) {
        add("Трансфер", "Трансфер след пристигане", transfer.route || transfer.description || transfer.status || transfer.type);
      }
    } else if (flight.route) {
      add("Полет", `Маршрут ${text(flight.route)}`, text(flight.airline, ""));
    }

    if (selectedHotel.name) add("Настаняване", `Настаняване в ${text(selectedHotel.name)}`, compactMealLabel(selectedHotel.meal || selectedHotel.board), "js-selected-itinerary-hotel");

    if (inbound.length) {
      const firstInbound = inbound[0] || {};
      const lastInbound = inbound[inbound.length - 1] || {};
      add(segmentDateLabel(firstInbound) ? `Последен ден · ${segmentDateLabel(firstInbound)}` : "Последен ден", `Обратен полет ${segmentRouteLabel(firstInbound) || segmentRouteLabel(lastInbound)}`, inbound.length > 1 ? `${inbound.length} сегмента` : "");
    }

    if (items.length < 2) return "";
    return `
      <section class="v11-card v11-timeline-card">
        <p class="v11-kicker">Пътуването накратко</p>
        <h4>Ясен ход на пътуването</h4>
        <ol class="v11-travel-timeline">
          ${items.map((item) => `<li${item.className ? ` class="${escapeHtml(item.className)}"` : ""}><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.title)}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</li>`).join("")}
        </ol>
      </section>
    `;
  }

  function finalCtaBlock(input = {}, selectedPayload = {}) {
    const agent = input.agent || input.consultant || input.agency || {};
    const phone = text(agent.phone || input.contact?.phone || "+359 885 07 89 80", "");
    const email = text(agent.email || input.contact?.email || "", "");
    return `
      <section class="v11-final-cta">
        <div>
          <p class="v11-kicker">Вашата оферта е готова.</p>
          <h4>Потвърдете избрания хотел, за да проверим актуалната наличност и да финализираме пътуването.</h4>
          <p>Наличността, цената и финалните условия се потвърждават преди резервация.</p>
        </div>
        <div class="v11-final-actions">
          <a class="v11-final-primary js-selected-option-whatsapp" href="${escapeHtml(selectedPayload.whatsappUrl)}" target="_blank" rel="noreferrer">Потвърди избрания хотел</a>
          ${email ? `<a href="mailto:${escapeHtml(email)}">Попитай консултант</a>` : `<a href="${escapeHtml(selectedPayload.whatsappUrl)}" target="_blank" rel="noreferrer">Попитай консултант</a>`}
          ${phone ? `<span>${escapeHtml(phone)}</span>` : ""}
        </div>
      </section>
    `;
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
      description: localizeClientText(text(hotel.description, "Описание на хотела за потвърждение.")),
      room: localizeClientText(text(hotel.room || hotel.roomType, "Стая за потвърждение")),
      meal: localizeClientText(text(hotel.meal || hotel.board, "Изхранване за потвърждение")),
      mealCompact: compactMealLabel(hotel.meal || hotel.board),
      area: localizeClientText(text(hotel.area || hotel.location || hotel.city, "Локация за потвърждение")),
      stars: numericStars(hotel),
      transfer: transferSummary(input, hotel),
      highlights: hotelHighlights(hotel),
      reasons: supportedRecommendationReasons(input, hotel, Array.isArray(input.hotelOptions) ? input.hotelOptions : [])
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
          <span>${escapeHtml(localizeClientText(view.date))}</span>
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
        <span>${escapeHtml(clientDateTimeLabel(segment.departure))} &rarr; ${escapeHtml(clientDateTimeLabel(segment.arrival))}</span>
        <small>Продължителност: ${escapeHtml(localizeClientText(text(segment.duration)))}</small>
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
          <h4>${escapeHtml(localizeClientText(text(route, "За потвърждение")))}</h4>
        </div>
        <div class="v11-segment-list">
          ${segments.length ? segments.map(segmentCard).join("") : "<p class=\"v11-muted\">Няма данни за сегмент</p>"}
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
          ${payload.images.map((image, imageIndex) => `<img src="${escapeHtml(image)}" alt="${imageIndex === 0 ? escapeHtml(`${payload.label} снимка`) : ""}">`).join("")}
        </div>
        <div>
          <div class="v11-option-heading">
            <span>${escapeHtml(payload.label)}</span>
            <strong class="v11-selected-badge" data-selected-badge ${selected ? "" : "hidden"}>${selected ? "Избрана опция" : ""}</strong>
          </div>
          <strong>${escapeHtml(payload.name)}</strong>
          <small>${escapeHtml(text(hotel.room))}</small>
          <small>${escapeHtml(payload.mealCompact)}</small>
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
              data-option-transfer="${escapeHtml(payload.transfer)}"
              data-option-description="${dataAttr(payload.description)}"
              data-option-room="${dataAttr(payload.room)}"
              data-option-meal="${dataAttr(payload.meal)}"
              data-option-meal-compact="${dataAttr(payload.mealCompact)}"
              data-option-area="${dataAttr(payload.area)}"
              data-option-stars="${dataAttr(payload.stars)}"
              data-option-images="${dataAttr(JSON.stringify(payload.images))}"
              data-option-reasons="${dataAttr(payload.reasons.join("\n"))}">
              ${selected ? "Избран хотел" : "Предпочитам този хотел"}
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
        <strong>Бележка за преглед</strong>
        <ul>${items.map((item) => `<li>${escapeHtml(clientWarningText(item))}</li>`).join("")}</ul>
      </section>
    `;
  }

  function transferSummary(input = {}, selectedHotel = {}) {
    const transfer = input.transfer || {};
    const destinationText = [
      input.destination?.name,
      input.destination?.requested,
      selectedHotel.area,
      selectedHotel.name,
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
    return `${localizeClientText(route)}. ${localizeClientText(status)}`;
  }

  function transferBlock(input = {}, selectedHotel = {}) {
    const summary = transferSummary(input, selectedHotel);
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
    const tags = bestForTags(hotel);
    return `
      <article class="v11-selected-hotel-detail ${index === activeIndex ? "active" : ""}" data-selected-detail-index="${escapeHtml(index)}">
        <div class="v11-selected-hotel-gallery">
          ${payload.images.map((image, imageIndex) => `<button type="button" class="v11-gallery-thumb" data-gallery-src="${escapeHtml(image)}" data-gallery-index="${escapeHtml(imageIndex)}"><img src="${escapeHtml(image)}" alt="${imageIndex === 0 ? "Снимка на избрания хотел" : ""}"></button>`).join("")}
        </div>
        <div class="v11-selected-hotel-copy">
          <p class="v11-kicker js-selected-detail-label">${escapeHtml(payload.label)}</p>
          <h4 class="js-selected-detail-name">${escapeHtml(payload.name)}</h4>
          <p class="js-selected-detail-description">${escapeHtml(payload.description)}</p>
          ${tags.length ? `
            <div>
              <p class="v11-kicker">Подадени удобства</p>
              <ul class="v11-hotel-highlights">${tags.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </div>
          ` : ""}
          <div class="v11-detail-grid">
            <div><span>Стая</span><strong class="js-selected-detail-room">${escapeHtml(payload.room)}</strong></div>
            <div><span>Изхранване</span><strong class="js-selected-detail-meal">${escapeHtml(payload.meal)}</strong></div>
            <div><span>Локация</span><strong class="js-selected-detail-area">${escapeHtml(payload.area)}</strong></div>
            <div><span>Крайна цена</span><strong class="js-selected-detail-price">${escapeHtml(payload.priceDisplay)}</strong></div>
          </div>
          ${payload.highlights.length ? `<ul class="v11-hotel-highlights">${payload.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
          <div class="v11-detail-row">
            <span>Трансфер</span>
            <strong class="js-selected-detail-transfer">${escapeHtml(payload.transfer)}</strong>
          </div>
          <div class="v11-option-actions">
            <a class="js-selected-detail-website" href="${escapeHtml(payload.url)}" target="_blank" rel="noreferrer" ${payload.url ? "" : "hidden"}>&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;</a>
            <a class="js-selected-option-whatsapp" href="${escapeHtml(payload.whatsappUrl)}" target="_blank" rel="noreferrer">&#1048;&#1079;&#1087;&#1088;&#1072;&#1090;&#1080; &#1080;&#1079;&#1073;&#1086;&#1088;&#1072; &#1074; WhatsApp</a>
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
          var selectedStars = root.querySelector(".js-selected-option-stars");
          var selectedMeal = root.querySelector(".js-selected-option-meal");
          var selectedTransfer = root.querySelector(".js-selected-option-transfer");
          var selectedImage = root.querySelector(".js-selected-option-image");
          var selectedWebsite = root.querySelector(".js-selected-option-website");
          var whatsappLinks = root.querySelectorAll(".js-selected-option-whatsapp");
          var detail = root.querySelector(".v11-selected-hotel-detail");
          var detailGallery = root.querySelector(".v11-selected-hotel-gallery");
          var detailLabel = root.querySelector(".js-selected-detail-label");
          var detailName = root.querySelector(".js-selected-detail-name");
          var detailDescription = root.querySelector(".js-selected-detail-description");
          var detailRoom = root.querySelector(".js-selected-detail-room");
          var detailMeal = root.querySelector(".js-selected-detail-meal");
          var detailArea = root.querySelector(".js-selected-detail-area");
          var detailPrice = root.querySelector(".js-selected-detail-price");
          var detailTransfer = root.querySelector(".js-selected-detail-transfer");
          var detailWebsite = root.querySelector(".js-selected-detail-website");
          var recommendationList = root.querySelector(".js-gt63-recommendation-list");
          var itineraryHotel = root.querySelector(".js-selected-itinerary-hotel strong");
          var itineraryMeal = root.querySelector(".js-selected-itinerary-hotel small");
          var galleryDialog = root.querySelector(".v11-gallery-dialog");
          var galleryImage = root.querySelector(".v11-gallery-dialog img");
          var galleryImages = [];
          var galleryIndex = 0;
          var galleryStartX = 0;
          function openGallery(images, index) {
            galleryImages = images;
            galleryIndex = index || 0;
            if (!galleryDialog || !galleryImage || !galleryImages.length) return;
            galleryImage.src = galleryImages[galleryIndex];
            galleryDialog.hidden = false;
          }
          function closeGallery() {
            if (galleryDialog) galleryDialog.hidden = true;
          }
          function moveGallery(direction) {
            if (!galleryImage || !galleryImages.length) return;
            galleryIndex = (galleryIndex + direction + galleryImages.length) % galleryImages.length;
            galleryImage.src = galleryImages[galleryIndex];
          }
          function escapeText(value) {
            return String(value || "").replace(/[&<>"']/g, function (char) {
              return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
            });
          }
          function bindGalleryButtons(container) {
            if (!container) return;
            var images = Array.from(container.querySelectorAll(".v11-gallery-thumb")).map(function (button) {
              return button.dataset.gallerySrc;
            }).filter(Boolean);
            container.querySelectorAll(".v11-gallery-thumb").forEach(function (button, index) {
              button.addEventListener("click", function () {
                openGallery(images, index);
              });
            });
          }
          function updateDetailGallery(images) {
            if (!detailGallery) return;
            detailGallery.innerHTML = images.map(function (image, index) {
              var safeImage = escapeText(image);
              return '<button type="button" class="v11-gallery-thumb" data-gallery-src="' + safeImage + '" data-gallery-index="' + index + '"><img src="' + safeImage + '" alt="' + (index === 0 ? "Снимка на избрания хотел" : "") + '"></button>';
            }).join("");
            bindGalleryButtons(detailGallery);
          }
          function parseImages(value) {
            try {
              var parsed = JSON.parse(value || "[]");
              return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 3) : [];
            } catch (error) {
              return [];
            }
          }
          function updateRecommendation(value) {
            if (!recommendationList) return;
            var reasons = String(value || "").split("\\n").map(function (item) {
              return item.trim();
            }).filter(Boolean).slice(0, 4);
            recommendationList.innerHTML = reasons.map(function (item) {
              return "<li>" + escapeText(item) + "</li>";
            }).join("");
            var card = recommendationList.closest(".v11-insight-card");
            if (card) card.hidden = !reasons.length;
          }
          root.querySelectorAll(".v11-prefer-option").forEach(function (button) {
            button.addEventListener("click", function () {
              root.querySelectorAll(".v11-hotel-option").forEach(function (card) {
                card.classList.remove("selected");
                var badge = card.querySelector("[data-selected-badge]");
                var preferButton = card.querySelector(".v11-prefer-option");
                if (badge) {
                  badge.textContent = "";
                  badge.hidden = true;
                }
                if (preferButton) preferButton.textContent = "Предпочитам този хотел";
              });
              var card = button.closest(".v11-hotel-option");
              if (card) {
                card.classList.add("selected");
                var selectedBadge = card.querySelector("[data-selected-badge]");
                if (selectedBadge) {
                  selectedBadge.textContent = "Избрана опция";
                  selectedBadge.hidden = false;
                }
                button.textContent = "Избран хотел";
              }
              if (selectedName) selectedName.textContent = button.dataset.optionName || "Хотелска опция";
              if (selectedPrice) selectedPrice.textContent = button.dataset.optionPrice || "-";
              if (selectedSubtitle) selectedSubtitle.textContent = button.dataset.optionSubtitle || "";
              if (selectedStars) {
                if (button.dataset.optionStars) {
                  selectedStars.textContent = "Категория: " + button.dataset.optionStars + " звезди";
                  selectedStars.hidden = false;
                } else {
                  selectedStars.hidden = true;
                }
              }
              if (selectedMeal) selectedMeal.textContent = "Хранене: " + (button.dataset.optionMealCompact || "Хранене според избраната оферта");
              if (selectedTransfer) selectedTransfer.textContent = button.dataset.optionTransfer || "";
              if (selectedImage && button.dataset.optionImage) selectedImage.src = button.dataset.optionImage;
              if (selectedImage) selectedImage.alt = button.dataset.optionName || "";
              if (selectedWebsite) {
                if (button.dataset.optionUrl) {
                  selectedWebsite.href = button.dataset.optionUrl;
                  selectedWebsite.hidden = false;
                } else {
                  selectedWebsite.hidden = true;
                }
              }
              whatsappLinks.forEach(function (link) {
                if (button.dataset.optionWhatsapp) link.href = button.dataset.optionWhatsapp;
              });
              if (detail) {
                detail.dataset.selectedDetailIndex = button.dataset.optionIndex || "";
                detail.classList.add("active");
              }
              if (detailLabel) detailLabel.textContent = "Хотелска опция " + (Number(button.dataset.optionIndex || 0) + 1);
              if (detailName) detailName.textContent = button.dataset.optionName || "Хотелска опция";
              if (detailDescription) detailDescription.textContent = button.dataset.optionDescription || "Описание на хотела за потвърждение.";
              if (detailRoom) detailRoom.textContent = button.dataset.optionRoom || "Стая за потвърждение";
              if (detailMeal) detailMeal.textContent = button.dataset.optionMeal || "Изхранване за потвърждение";
              if (detailArea) detailArea.textContent = button.dataset.optionArea || "Локация за потвърждение";
              if (detailPrice) detailPrice.textContent = button.dataset.optionPrice || "-";
              if (detailTransfer) detailTransfer.textContent = button.dataset.optionTransfer || "";
              if (itineraryHotel) itineraryHotel.textContent = "Настаняване в " + (button.dataset.optionName || "избрания хотел");
              if (itineraryMeal) itineraryMeal.textContent = button.dataset.optionMealCompact || "Хранене според избраната оферта";
              if (detailWebsite) {
                if (button.dataset.optionUrl) {
                  detailWebsite.href = button.dataset.optionUrl;
                  detailWebsite.hidden = false;
                } else {
                  detailWebsite.hidden = true;
                }
              }
              updateDetailGallery(parseImages(button.dataset.optionImages));
              updateRecommendation(button.dataset.optionReasons || "");
            });
          });
          bindGalleryButtons(detailGallery);
          root.querySelectorAll("[data-gallery-action]").forEach(function (button) {
            button.addEventListener("click", function () {
              var action = button.dataset.galleryAction;
              if (action === "close") closeGallery();
              if (action === "prev") moveGallery(-1);
              if (action === "next") moveGallery(1);
            });
          });
          if (galleryDialog) {
            galleryDialog.addEventListener("click", function (event) {
              if (event.target === galleryDialog) closeGallery();
            });
            galleryDialog.addEventListener("pointerdown", function (event) {
              galleryStartX = event.clientX;
            });
            galleryDialog.addEventListener("pointerup", function (event) {
              var delta = event.clientX - galleryStartX;
              if (Math.abs(delta) > 40) moveGallery(delta > 0 ? -1 : 1);
            });
          }
          document.addEventListener("keydown", function (event) {
            if (!galleryDialog || galleryDialog.hidden) return;
            if (event.key === "Escape") closeGallery();
            if (event.key === "ArrowLeft") moveGallery(-1);
            if (event.key === "ArrowRight") moveGallery(1);
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
    const activeHotel = input.selectedHotel || hotelOptions.find((hotel) => hotel?.selected) || input.hotel || hotelOptions[0] || {};
    const currency = input.pricing?.currency || "EUR";
    const activeIndex = selectedHotelIndex(hotelOptions, activeHotel, input);
    const selectedPayload = selectedOptionPayload(hotelOptions[activeIndex] || activeHotel, activeIndex, currency, input);
    const selectedFullPayload = hotelPayload(hotelOptions[activeIndex] || activeHotel, activeIndex, currency, input);
    const selectedHotel = hotelOptions[activeIndex] || activeHotel;
    const title = input.destination?.name || input.destination?.requested || input.content?.heroTitle || "Персонално предложение";
    const travelDates = localizeClientText(input.client?.travelDates || input.destination?.requested || "");
    const rawHeroSubtitle = localizeClientText(input.content?.heroSubtitle || "");
    const heroSubtitle = rawHeroSubtitle && !/curated private travel proposal|multi-hotel brief|ready|review/i.test(rawHeroSubtitle)
      ? rawHeroSubtitle
      : `Подбрана персонална оферта за Вашето пътуване${title ? ` до ${title}` : ""}.`;
    const heroImage = firstHotelImage(selectedHotel, input);
    const facts = heroFacts(input, selectedPayload, selectedHotel, travelDates);

    return `
      <article class="v11-proposal multi-hotel-proposal" aria-label="Клиентска оферта с избор на хотел">
        <section class="v11-hero">
          <div>
            <p class="v11-eyebrow">AYA TRAVEL &middot; ПЕРСОНАЛНА ОФЕРТА</p>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(heroSubtitle)}</p>
            <div class="v11-chip-row">
              ${facts.map(([label, value]) => `<span><small>${escapeHtml(label)}</small>${escapeHtml(value)}</span>`).join("")}
            </div>
          </div>
          <div class="v11-hero-visual">
            <img class="js-selected-option-image" src="${escapeHtml(heroImage)}" alt="${escapeHtml(selectedPayload.name)}">
          </div>
          <div class="v11-price-card">
            <span>&#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1093;&#1086;&#1090;&#1077;&#1083;</span>
            <strong class="js-selected-option-name">${escapeHtml(selectedPayload.name)}</strong>
            <small class="js-selected-option-subtitle">${escapeHtml(selectedFullPayload.subtitle)}</small>
            ${selectedFullPayload.stars ? `<small class="js-selected-option-stars">Категория: ${escapeHtml(selectedFullPayload.stars)} звезди</small>` : `<small class="js-selected-option-stars" hidden></small>`}
            <small class="js-selected-option-meal">Хранене: ${escapeHtml(selectedFullPayload.mealCompact)}</small>
            <small>Крайна цена за избрания хотел</small>
            <strong class="js-selected-option-price">${escapeHtml(selectedPayload.priceDisplay)}</strong>
            <small>${escapeHtml(String(hotelOptions.length))} варианта за настаняване</small>
            <small class="js-selected-option-transfer">${escapeHtml(selectedFullPayload.transfer)}</small>
            <a class="js-selected-option-website v11-selected-option-website" href="${escapeHtml(selectedFullPayload.url)}" target="_blank" rel="noreferrer" ${selectedFullPayload.url ? "" : "hidden"}>&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;</a>
            <a class="js-selected-option-whatsapp v11-selected-option-whatsapp" href="${escapeHtml(selectedPayload.whatsappUrl)}" target="_blank" rel="noreferrer">&#1048;&#1079;&#1087;&#1088;&#1072;&#1090;&#1080; &#1080;&#1079;&#1073;&#1086;&#1088;&#1072; &#1074; WhatsApp</a>
            ${packageSummaryBlock(input, selectedHotel)}
          </div>
        </section>

        ${warningList(input.warnings)}

        ${insightBlock(input, selectedHotel, hotelOptions)}

        ${destinationExperience(input)}

        ${travelTimeline(input, selectedHotel)}

        <section class="v11-card v11-flight-card">
          <p class="v11-kicker">&#1054;&#1073;&#1086;&#1073;&#1097;&#1077;&#1085;&#1080;&#1077; &#1085;&#1072; &#1087;&#1086;&#1083;&#1077;&#1090;&#1072;</p>
          <h4>${escapeHtml(text(flight.airline, "Авиокомпания за потвърждение"))}</h4>
          <p>${escapeHtml(localizeClientText(text(flight.route, "Маршрут за потвърждение")))}</p>
          ${flightSummaryCards(flight, travelDates)}
        </section>

        <section class="v11-card v11-hotel-card">
            <p class="v11-kicker">&#1042;&#1072;&#1088;&#1080;&#1072;&#1085;&#1090;&#1080; &#1079;&#1072; &#1085;&#1072;&#1089;&#1090;&#1072;&#1085;&#1103;&#1074;&#1072;&#1085;&#1077;</p>
            <h4>&#1057;&#1088;&#1072;&#1074;&#1085;&#1077;&#1090;&#1077; &#1087;&#1088;&#1077;&#1076;&#1083;&#1086;&#1078;&#1077;&#1085;&#1080;&#1090;&#1077; &#1074;&#1072;&#1088;&#1080;&#1072;&#1085;&#1090;&#1080;</h4>
            <p>&#1061;&#1086;&#1090;&#1077;&#1083;&#1089;&#1082;&#1080;&#1090;&#1077; &#1086;&#1087;&#1094;&#1080;&#1080; &#1089;&#1072; &#1087;&#1086;&#1076;&#1088;&#1077;&#1076;&#1077;&#1085;&#1080; &#1079;&#1072; &#1103;&#1089;&#1085;&#1086; &#1089;&#1088;&#1072;&#1074;&#1085;&#1077;&#1085;&#1080;&#1077;. &#1062;&#1077;&#1085;&#1080;&#1090;&#1077; &#1089;&#1072; &#1086;&#1073;&#1097;&#1080; &#1082;&#1083;&#1080;&#1077;&#1085;&#1090;&#1089;&#1082;&#1080; &#1094;&#1077;&#1085;&#1080; &#1079;&#1072; &#1089;&#1098;&#1086;&#1090;&#1074;&#1077;&#1090;&#1085;&#1080;&#1103; &#1080;&#1079;&#1073;&#1086;&#1088;.</p>
            <div class="v11-hotel-options">
              ${hotelOptions.length
                ? hotelOptions.map((hotel, index) => hotelOptionCard(hotel, index, currency, input, activeIndex)).join("")
                : "<p class=\"v11-muted\">Няма данни за хотелски опции</p>"}
            </div>
        </section>

        <section class="v11-card v11-selected-hotel-card">
          <p class="v11-kicker">&#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1074;&#1072;&#1088;&#1080;&#1072;&#1085;&#1090;</p>
          <h4>&#1044;&#1077;&#1090;&#1072;&#1081;&#1083;&#1080; &#1079;&#1072; &#1080;&#1079;&#1073;&#1088;&#1072;&#1085;&#1080;&#1103; &#1093;&#1086;&#1090;&#1077;&#1083;</h4>
          ${selectedHotel
            ? selectedHotelDetails(selectedHotel, activeIndex, currency, input, activeIndex)
            : "<p class=\"v11-muted\">Няма детайли за избрания хотел</p>"}
        </section>

        ${transferBlock(input, selectedHotel)}

        <section class="v11-card v11-detailed-flight-card">
          <p class="v11-kicker">&#1055;&#1086;&#1076;&#1088;&#1086;&#1073;&#1085;&#1072; &#1080;&#1085;&#1092;&#1086;&#1088;&#1084;&#1072;&#1094;&#1080;&#1103; &#1079;&#1072; &#1087;&#1086;&#1083;&#1077;&#1090;&#1072;</p>
          <h4>${escapeHtml(text(flight.airline, "Авиокомпания за потвърждение"))}</h4>
          ${segmentGroup("Отиване", flight.outboundSegments || [], flight.outbound)}
          ${segmentGroup("Връщане", flight.inboundSegments || [], flight.inbound)}
          <div class="v11-detail-row">
            <span>Багаж</span>
            <strong>${escapeHtml(localizeClientText(text(flight.baggage, "За потвърждение")))}</strong>
          </div>
        </section>

        ${finalCtaBlock(input, selectedPayload)}

        <div class="v11-gallery-dialog" hidden>
          <button type="button" class="v11-gallery-close" data-gallery-action="close">Затвори</button>
          <button type="button" class="v11-gallery-nav v11-gallery-prev" data-gallery-action="prev">Назад</button>
          <img src="" alt="">
          <button type="button" class="v11-gallery-nav v11-gallery-next" data-gallery-action="next">Напред</button>
        </div>
        ${selectedHotelScript()}
      </article>
    `;
  }

  return {
    renderMultiHotelProposal
  };
});

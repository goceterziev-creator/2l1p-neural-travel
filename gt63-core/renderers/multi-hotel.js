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
    const label = `Хотелска опция ${index + 1}`;
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

  function packageIncludes(input = {}, selectedHotel = {}) {
    const flight = input.flight || {};
    const transfer = input.transfer || {};
    const items = [];
    const add = (label, condition) => {
      if (condition) items.push(label);
    };

    add("Самолетни билети", Boolean(flight.airline || flight.route || flight.outboundSegments?.length || flight.inboundSegments?.length));
    add("Настаняване", Boolean(selectedHotel.name || selectedHotel.room || selectedHotel.area));
    add(`Изхранване: ${text(selectedHotel.meal)}`, Boolean(selectedHotel.meal && selectedHotel.meal !== "-"));
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

  function recommendationItems(input = {}, selectedHotel = {}) {
    const haystack = [
      selectedHotel.name,
      selectedHotel.area,
      selectedHotel.location,
      selectedHotel.room,
      selectedHotel.meal,
      selectedHotel.description,
      ...(Array.isArray(selectedHotel.amenities) ? selectedHotel.amenities : []),
      ...(Array.isArray(selectedHotel.highlights) ? selectedHotel.highlights : [])
    ].filter(Boolean).join(" ").toLowerCase();
    const items = [];
    const add = (label, pattern) => {
      if (pattern.test(haystack)) items.push(label);
    };

    add("Локацията е подкрепена от видимите данни за района.", /center|central|location|downtown|beach|airport|летище|цент|плаж/i);
    add("Има добър баланс между комфорт и включени удобства.", /breakfast|wifi|parking|pool|restaurant|закуска|паркинг|басейн/i);
    add("Подходящо е за по-спокоен престой.", /spa|wellness|quiet|relax|resort|спа|релакс/i);
    add("Практичен избор за градско разглеждане.", /metro|station|subway|city|shopping|museum|метро|гара|град/i);
    add("Удобно е спрямо летищната логистика.", /airport|terminal|shuttle|летище|трансфер/i);

    if (!items.length && (input.destination?.name || input.content?.heroTitle)) {
      items.push("Вариантите са подбрани според видимите данни за дестинация, дати и настаняване.");
    }
    return [...new Set(items)].slice(0, 3);
  }

  function bestForTags(hotel = {}) {
    const haystack = [
      hotel.name,
      hotel.area,
      hotel.location,
      hotel.room,
      hotel.meal,
      hotel.description,
      ...(Array.isArray(hotel.amenities) ? hotel.amenities : []),
      ...(Array.isArray(hotel.highlights) ? hotel.highlights : [])
    ].filter(Boolean).join(" ").toLowerCase();
    const tags = [];
    const add = (label, pattern) => {
      if (pattern.test(haystack)) tags.push(label);
    };

    add("Семейства", /family|children|kids|apartment|house|семей|деца|апартамент|къща/i);
    add("Двойки", /couple|double|romantic|adults|двойна|роман/i);
    add("Луксозен престой", /luxury|villa|suite|5|five|лукс|вила|суит/i);
    add("Бизнес пътуване", /business|airport|terminal|conference|летище|конфер/i);
    add("Релакс", /spa|wellness|pool|quiet|relax|спа|басейн|релакс/i);
    add("Плаж", /beach|lagoon|sea|ocean|плаж|лагуна|море/i);
    add("Градски престой", /city|central|metro|downtown|град|цент|метро/i);
    add("Кулинарно преживяване", /breakfast|restaurant|dining|закуска|ресторант/i);
    add("Шопинг", /shopping|mall|shops|магаз/i);
    add("Култура", /museum|temple|historic|culture|музей|храм|култур/i);

    return [...new Set(tags)].slice(0, 6);
  }

  function checkList(items = [], emptyText = "") {
    if (!items.length) return emptyText ? `<p class="v11-muted">${escapeHtml(emptyText)}</p>` : "";
    return `<ul class="v11-check-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
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
    const dates = text(travelDates || flight.dates || flight.date, "Датите са за потвърждение");
    const items = [
      ["Авиокомпания", text(flight.airline, "За потвърждение")],
      ["Дати", dates],
      ["Прекачвания", flightStops(flight)],
      ["Багаж", text(flight.baggage, "За потвърждение")],
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

  function insightBlock(input = {}, selectedHotel = {}) {
    const items = recommendationItems(input, selectedHotel);
    return `
      <section class="v11-card v11-insight-card">
        <p class="v11-kicker">Защо избрахме тези варианти</p>
        <h4>Подбор, базиран на видимите данни</h4>
        ${checkList(items, "Изборът е базиран на видимите данни за полет, хотел, цена и период.")}
      </section>
    `;
  }

  function destinationExperience(input = {}) {
    const title = text(input.content?.heroTitle || input.destination?.name || input.destination?.requested, "");
    const haystack = [title, input.destination?.requested, input.hotel?.area, input.content?.heroSubtitle].filter(Boolean).join(" ").toLowerCase();
    const lines = [];
    if (/maldives|maldive|малдив/i.test(haystack)) {
      lines.push("Предложението е подготвено около островно усещане, спокойствие и време близо до океана.");
      lines.push("Фокусът е върху плавен престой, ясно избрано настаняване и лесно сравнение между хотелските варианти.");
    } else if (/tokyo|japan|токио|япония/i.test(haystack)) {
      lines.push("Това е градско пътуване с фокус върху удобна локация, динамичен ритъм и лесен достъп до различни части на града.");
      lines.push("Предложението събира полет, хотел и финална цена в ясен формат за спокойно решение.");
    } else if (/santiago|chile|сантяго|чили/i.test(haystack)) {
      lines.push("Предложението е структурирано за удобен престой в Сантяго с ясен полетен маршрут и сравними варианти за настаняване.");
      lines.push("Фокусът е върху практична логистика, контрол на бюджета и лесен избор между хотелските опции.");
    } else if (/barcelona|барселона/i.test(haystack)) {
      lines.push("Предложението е подходящо за градски престой с разходки, храна и свободно време в ритъма на Барселона.");
      lines.push("Фокусът е върху удобно пътуване, ясна цена и лесно сравнение на настаняването.");
    } else if (title) {
      lines.push(`Предложението е подготвено за ${title} с фокус върху ясно сравнение, удобна логистика и финална клиентска цена.`);
    }
    if (!lines.length) return "";
    return `
      <section class="v11-card v11-destination-card">
        <p class="v11-kicker">Дестинацията</p>
        <h4>Какво усещане носи това пътуване</h4>
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

  function travelTimeline(input = {}, selectedHotel = {}) {
    const flight = input.flight || {};
    const outbound = flight.outboundSegments || [];
    const inbound = flight.inboundSegments || [];
    const stops = [];
    const push = (value) => {
      const label = timelineStopLabel(value);
      if (label && stops[stops.length - 1] !== label) stops.push(label);
    };
    if (outbound.length) {
      push(outbound[0]?.from || outbound[0]?.departureAirport);
      outbound.forEach((segment) => push(segment?.to || segment?.arrivalAirport));
    } else if (flight.route) {
      String(flight.route).split(/->|→|\//).map((part) => part.trim()).filter(Boolean).slice(0, 4).forEach(push);
    }
    if (selectedHotel.name) push(selectedHotel.name);
    if (inbound.length) {
      inbound.forEach((segment) => push(segment?.to || segment?.arrivalAirport));
    } else if (stops.length > 1) {
      push(stops[0]);
    }
    const uniqueStops = stops.slice(0, 8);
    if (uniqueStops.length < 2) return "";
    return `
      <section class="v11-card v11-timeline-card">
        <p class="v11-kicker">Маршрут накратко</p>
        <div class="v11-travel-timeline">
          ${uniqueStops.map((stop, index) => `<div><strong>${escapeHtml(stop)}</strong>${index < uniqueStops.length - 1 ? "<span>↓</span>" : ""}</div>`).join("")}
        </div>
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
          <p class="v11-kicker">Вашето пътуване е подготвено</p>
          <h4>Когато решите да продължите, ще подготвим следващите стъпки за резервация.</h4>
          <p>Цените и наличностите подлежат на финално потвърждение към момента на резервация.</p>
        </div>
        <div class="v11-final-actions">
          <a href="${escapeHtml(selectedPayload.whatsappUrl)}" target="_blank" rel="noreferrer">WhatsApp</a>
          ${email ? `<a href="mailto:${escapeHtml(email)}">Email</a>` : ""}
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
      description: text(hotel.description, "Описание на хотела за потвърждение."),
      room: text(hotel.room || hotel.roomType, "Стая за потвърждение"),
      meal: text(hotel.meal || hotel.board, "Изхранване за потвърждение"),
      area: text(hotel.area || hotel.location || hotel.city, "Локация за потвърждение"),
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
    const route = segments.length
      ? [segments[0]?.from, ...segments.map((segment) => segment?.to)].filter(Boolean).join(" -> ")
      : fallback;

    return `
      <section class="v11-itinerary-block">
        <div>
          <p class="v11-kicker">${escapeHtml(label)}</p>
          <h4>${escapeHtml(text(route, "За потвърждение"))}</h4>
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
        <strong>Бележка за преглед</strong>
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
    const tags = bestForTags(hotel);
    return `
      <article class="v11-selected-hotel-detail ${index === activeIndex ? "active" : ""}" data-selected-detail-index="${escapeHtml(index)}">
        <div class="v11-selected-hotel-gallery">
          ${payload.images.map((image, imageIndex) => `<button type="button" class="v11-gallery-thumb" data-gallery-src="${escapeHtml(image)}" data-gallery-index="${escapeHtml(imageIndex)}"><img src="${escapeHtml(image)}" alt=""></button>`).join("")}
        </div>
        <div class="v11-selected-hotel-copy">
          <p class="v11-kicker">${escapeHtml(payload.label)}</p>
          <h4>${escapeHtml(payload.name)}</h4>
          <p>${escapeHtml(payload.description)}</p>
          ${tags.length ? `
            <div>
              <p class="v11-kicker">Подходящо за</p>
              <ul class="v11-hotel-highlights">${tags.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </div>
          ` : ""}
          <div class="v11-detail-grid">
            <div><span>Стая</span><strong>${escapeHtml(payload.room)}</strong></div>
            <div><span>Изхранване</span><strong>${escapeHtml(payload.meal)}</strong></div>
            <div><span>Локация</span><strong>${escapeHtml(payload.area)}</strong></div>
            <div><span>Крайна цена</span><strong>${escapeHtml(payload.priceDisplay)}</strong></div>
          </div>
          ${payload.highlights.length ? `<ul class="v11-hotel-highlights">${payload.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
          <div class="v11-detail-row">
            <span>Трансфер</span>
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
              if (selectedName) selectedName.textContent = button.dataset.optionName || "Хотелска опция";
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
          root.querySelectorAll(".v11-selected-hotel-detail").forEach(function (detail) {
            var images = Array.from(detail.querySelectorAll(".v11-gallery-thumb")).map(function (button) {
              return button.dataset.gallerySrc;
            }).filter(Boolean);
            detail.querySelectorAll(".v11-gallery-thumb").forEach(function (button, index) {
              button.addEventListener("click", function () {
                openGallery(images, index);
              });
            });
          });
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
    const activeHotel = hotelOptions.find((hotel) => hotel?.selected) || input.hotel || hotelOptions[0] || {};
    const currency = input.pricing?.currency || "EUR";
    const activeIndex = selectedHotelIndex(hotelOptions, activeHotel);
    const selectedPayload = selectedOptionPayload(hotelOptions[activeIndex] || activeHotel, activeIndex, currency, input);
    const selectedFullPayload = hotelPayload(hotelOptions[activeIndex] || activeHotel, activeIndex, currency, input);
    const selectedHotel = hotelOptions[activeIndex] || activeHotel;
    const title = input.content?.heroTitle || input.destination?.name || "Персонално предложение";
    const travelDates = input.client?.travelDates || input.destination?.requested || "";
    const heroImage = firstHotelImage(activeHotel, input);

    return `
      <article class="v11-proposal multi-hotel-proposal" aria-label="Multi-hotel proposal preview">
        <section class="v11-hero">
          <div>
            <p class="v11-eyebrow">AYA TRAVEL &middot; MULTI-HOTEL BRIEF</p>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(input.content?.heroSubtitle || "Персонално подготвено предложение с варианти за настаняване.")}</p>
            <div class="v11-chip-row">
              <span>${escapeHtml(text(input.client?.name, "Клиент за потвърждение"))}</span>
              <span>${escapeHtml(text(travelDates, "Датите са за потвърждение"))}</span>
              <span>${escapeHtml(text(input.client?.travelers, "Пътуващи за потвърждение"))}</span>
            </div>
          </div>
          <div class="v11-hero-visual">
            <img class="js-selected-option-image" src="${escapeHtml(heroImage)}" alt="">
          </div>
          <div class="v11-price-card">
            <span>&#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1093;&#1086;&#1090;&#1077;&#1083;</span>
            <strong class="js-selected-option-name">${escapeHtml(selectedPayload.name)}</strong>
            <small class="js-selected-option-subtitle">${escapeHtml(selectedFullPayload.subtitle)}</small>
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

        ${insightBlock(input, selectedHotel)}

        ${destinationExperience(input)}

        ${travelTimeline(input, selectedHotel)}

        <section class="v11-card v11-flight-card">
          <p class="v11-kicker">&#1054;&#1073;&#1086;&#1073;&#1097;&#1077;&#1085;&#1080;&#1077; &#1085;&#1072; &#1087;&#1086;&#1083;&#1077;&#1090;&#1072;</p>
          <h4>${escapeHtml(text(flight.airline, "Авиокомпания за потвърждение"))}</h4>
          <p>${escapeHtml(text(flight.route, "Маршрут за потвърждение"))}</p>
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
          ${hotelOptions.length
            ? hotelOptions.map((hotel, index) => selectedHotelDetails(hotel, index, currency, input, activeIndex)).join("")
            : "<p class=\"v11-muted\">Няма детайли за избрания хотел</p>"}
        </section>

        ${transferBlock(input)}

        <section class="v11-card v11-detailed-flight-card">
          <p class="v11-kicker">&#1055;&#1086;&#1076;&#1088;&#1086;&#1073;&#1085;&#1072; &#1080;&#1085;&#1092;&#1086;&#1088;&#1084;&#1072;&#1094;&#1080;&#1103; &#1079;&#1072; &#1087;&#1086;&#1083;&#1077;&#1090;&#1072;</p>
          <h4>${escapeHtml(text(flight.airline, "Авиокомпания за потвърждение"))}</h4>
          ${segmentGroup("Отиване", flight.outboundSegments || [], flight.outbound)}
          ${segmentGroup("Връщане", flight.inboundSegments || [], flight.inbound)}
          <div class="v11-detail-row">
            <span>Багаж</span>
            <strong>${escapeHtml(text(flight.baggage, "За потвърждение"))}</strong>
          </div>
        </section>

        ${finalCtaBlock(input, selectedPayload)}

        <section class="v11-closing">
          <div>
            <p class="v11-kicker">Готово за следваща стъпка</p>
            <h4>${escapeHtml(text(input.content?.primaryCta, "Прегледайте предложението"))}</h4>
          </div>
          <span>${input.readiness === "ready" ? "READY" : "REVIEW"}</span>
        </section>
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

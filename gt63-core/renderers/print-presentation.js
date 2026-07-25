"use strict";

(function exposePrintPresentationRenderer(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63PrintPresentationRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPrintPresentationRenderer(root) {
  const viewModelApi = root.GT63PresentationViewModel || (typeof require === "function" ? require("../presentation-view-model") : null);

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
          ${kicker ? `<p class="gt63-print-kicker">${escapeHtml(kicker)}</p>` : ""}
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
      { label: "Изхранване", value: viewModel.selectedMealPlan }
    ], "is-compact");
    const reasons = (viewModel.selectedRecommendationReasons || []).slice(0, 3);
    const reasonList = reasons.length ? `
      <ul class="gt63-print-reason-list gt63-print-intro-reasons">
        ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
      </ul>
    ` : "";
    return contentPage("gt63-print-intro-page", `
      <section class="gt63-print-intro">
        <p class="gt63-print-kicker">Въведение към пътуването</p>
        <h2>${escapeHtml(destination || "Вашето пътуване")}</h2>
        <p class="gt63-print-editorial-lead">Тази книга на пътуването събира избрания хотел, ритъма на пътуването и инвестицията в една ясна клиентска презентация.</p>
        ${facts}
        ${reasonList}
      </section>
    `);
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

  function technicalSegments(title, segments = []) {
    if (!segments.length) return "";
    return `
      <section class="gt63-print-technical-group">
        <h3>${escapeHtml(title)}</h3>
        <div class="gt63-print-segment-list">
          ${segments.map((segment) => `
            <article class="gt63-print-segment">
              <strong>${escapeHtml(localize([segment.airline, segment.flightNumber].filter(Boolean).join(" ") || "Полетен сегмент"))}</strong>
              <span>${escapeHtml(text(segment.from || segment.departureAirport, ""))} → ${escapeHtml(text(segment.to || segment.arrivalAirport, ""))}</span>
              <span>${escapeHtml(formatPrintDateTime(segment.departure || segment.date))}${segment.arrival ? ` → ${escapeHtml(formatPrintDateTime(segment.arrival))}` : ""}</span>
              ${segment.duration ? `<small>${escapeHtml(localize(segment.duration))}</small>` : ""}
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function selectedHotelDetails(viewModel) {
    const hotel = viewModel.selectedHotel || {};
    const images = imageUrls(hotel, 3);
    const image = images[0] || "";
    const url = hotelUrl(hotel);
    const description = localize(text(hotel.description, "Описание на хотела за потвърждение."));
    const facts = factGrid([
      { label: "Категория", value: starsLabel(hotel) },
      { label: "Стая", value: hotel.room || hotel.roomType || "Стая за потвърждение" },
      { label: "Изхранване", value: viewModel.selectedMealPlan },
      { label: "Локация", value: hotel.area || hotel.location || hotel.city || "Локация за потвърждение" },
      { label: "Крайна цена", value: viewModel.selectedPayload.priceDisplay }
    ]);

    return editorialSection("gt63-print-selected-details", "Избран хотел", text(hotel.name, "Избран хотел за потвърждение"), `
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
    const hotel = viewModel.selectedHotel || {};
    const flight = input.flight || {};
    const transfer = input.transfer || {};
    const services = [];
    const add = (label, value, status = "Данни в офертата") => {
      const cleaned = nonEmpty(value);
      if (cleaned) services.push({ label, value: cleaned, status });
    };

    add("Настаняване", hotel.name);
    add("Стая", hotel.room || hotel.roomType);
    add("Изхранване", viewModel.selectedMealPlan);
    add("Багаж", flight.baggage);
    if (transfer.included || transfer.price > 0 || transfer.type || transfer.status || transfer.route || transfer.description) {
      add("Трансфер", transfer.status || transfer.type || transfer.route || transfer.description, transfer.included ? "Посочен като включен" : "За потвърждение");
    }
    add("Контакт", input.contact?.whatsappPhone || input.contact?.phone, "За съдействие");

    if (!services.length) return "";
    return editorialSection("gt63-print-included-services", "Включено и за потвърждение", "Какво съдържа офертата", `
      <div class="gt63-print-service-grid">
        ${services.map((service) => `
          <article class="gt63-print-service-card">
            <p>${escapeHtml(service.label)}</p>
            <strong>${escapeHtml(localize(service.value))}</strong>
            <span>${escapeHtml(service.status)}</span>
          </article>
        `).join("")}
      </div>
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

  function investmentPage(viewModel, input = {}) {
    const hotel = viewModel.selectedHotel || {};
    const services = [
      { label: "Избран хотел", value: hotel.name },
      { label: "Стая", value: hotel.room || hotel.roomType },
      { label: "Изхранване", value: viewModel.selectedMealPlan },
      { label: "Полети", value: input.flight?.airline || input.flight?.route },
      { label: "Багаж", value: input.flight?.baggage },
      { label: "Трансфер", value: input.transfer?.status || input.transfer?.type || input.transfer?.route || input.transfer?.description }
    ].filter((item) => nonEmpty(item.value));
    return contentPage("gt63-print-investment-page", `
      <section class="gt63-print-investment">
        <p class="gt63-print-kicker">Инвестиция в пътуването</p>
        <h2>Инвестиция във Вашето пътуване</h2>
        <div class="gt63-print-investment-amount">
          <span>Обща цена на пътуването</span>
          <strong>${escapeHtml(viewModel.selectedPayload.priceDisplay)}</strong>
          <p>Наличността, финалните условия и статусът на резервацията подлежат на потвърждение преди запазване.</p>
        </div>
        ${services.length ? `
          <div class="gt63-print-investment-list">
            ${services.map((service) => `
              <article>
                <span>${escapeHtml(service.label)}</span>
                <strong>${escapeHtml(localize(service.value))}</strong>
              </article>
            `).join("")}
          </div>
        ` : ""}
      </section>
    `);
  }

  function comparisonTable(viewModel) {
    if (!viewModel.hotelOptions.length) return "";
    const rows = viewModel.hotelOptions.map((hotel, index) => {
      const payload = viewModelApi.selectedOptionPayload(hotel, index, viewModel.currency, viewModel.input);
      const selected = index === viewModel.selectedHotelIndex;
      return `
        <tr${selected ? " class=\"selected\"" : ""}>
          <td>${escapeHtml(payload.label)}${selected ? " · Избран хотел" : ""}</td>
          <td>${escapeHtml(payload.name)}</td>
          <td>${escapeHtml(starsLabel(hotel))}</td>
          <td>${escapeHtml(localize(text(hotel.room || hotel.roomType, "За потвърждение")))}</td>
          <td>${escapeHtml(payload.mealPlan)}</td>
          <td>${escapeHtml(payload.priceDisplay)}</td>
        </tr>
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
      { label: "Багаж", value: flight.baggage || "За потвърждение" }
    ], "is-compact");

    return editorialSection("gt63-print-flight", "Полети", localize(text(flight.route || flight.airline, "Полетна информация")), `
      ${details}
      <div class="gt63-print-flight-columns">
        ${technicalSegments("Отиване", outbound)}
        ${technicalSegments("Връщане", inbound)}
      </div>
    `);
  }

  function ctaBlock(viewModel, input = {}) {
    const contactPhone = nonEmpty(input.contact?.whatsappPhone || input.contact?.phone);
    const contactEmail = nonEmpty(input.contact?.email);
    const agency = nonEmpty(input.contact?.agency || input.agency?.name || input.brand?.agencyName || "GT63");
    return `
      <section class="gt63-print-closing">
        <div class="gt63-print-closing-mark" aria-hidden="true">GT63</div>
        <div class="gt63-print-closing-copy">
          <p class="gt63-print-kicker">Вашето следващо пътуване започва тук</p>
          <h2>Вашето пътуване започва оттук.</h2>
          <p>Потвърдете избрания хотел, за да проверим актуалната наличност и финалните условия преди резервация.</p>
        </div>
        <div class="gt63-print-closing-footer">
          <div>
            <span>Подготвено от</span>
            <strong>${escapeHtml(agency)}</strong>
          </div>
          <div>
            <span>Инвестиция в пътуването</span>
            <strong>${escapeHtml(viewModel.selectedPayload.priceDisplay)}</strong>
          </div>
          ${contactPhone ? `<div><span>Контакт с консултант</span><strong>${escapeHtml(contactPhone)}</strong></div>` : ""}
          ${contactEmail ? `<div><span>Имейл</span><strong>${escapeHtml(contactEmail)}</strong></div>` : ""}
        </div>
      </section>
    `;
  }

  function renderPrintProposal(input = {}, options = {}) {
    const viewModel = viewModelApi.buildPresentationViewModel(input, options);
    const mode = viewModel.contract.mode;
    const selectedPages = [
      journeyIntroductionPage(viewModel, input),
      contentPage("gt63-print-hotel-page", [
        recommendationBlock(viewModel),
        selectedHotelDetails(viewModel)
      ].filter(Boolean).join("")),
      contentPage("gt63-print-flight-page", flightBlock(input)),
      contentPage("gt63-print-services-page", [
        includedServicesBlock(viewModel, input),
        transferBlock(input)
      ].filter(Boolean).join("")),
      contentPage("gt63-print-timeline-page", timelineBlock(input)),
      contentPage("gt63-print-experiences-page", optionalExperiencesBlock(input)),
      investmentPage(viewModel, input)
    ].filter(Boolean).join("");
    const comparisonContent = [
      recommendationBlock(viewModel),
      comparisonTable(viewModel),
      flightBlock(input)
    ].filter(Boolean).join("");

    return `
      <article class="gt63-print-proposal" data-print-mode="${escapeHtml(mode)}">
        ${coverPage(viewModel, input, mode)}
        ${mode === "comparison" ? printPage("gt63-print-content-page", comparisonContent) : selectedPages}
        ${printPage("gt63-print-final-page", ctaBlock(viewModel, input))}
      </article>
    `;
  }

  return {
    renderPrintProposal
  };
});

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

  function imageFrame(image, alt, label = "") {
    if (!image) {
      return `
        <div class="gt63-print-image-frame is-placeholder" aria-label="Снимка за потвърждение">
          <span>Снимка за потвърждение</span>
        </div>
      `;
    }
    return `
      <figure class="gt63-print-image-frame">
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
    const summary = factGrid([
      { label: "Хотел", value: hotelName },
      { label: "Период", value: viewModel.travelDates },
      { label: "Пътуващи", value: input.client?.travelers },
      { label: "Изхранване", value: viewModel.selectedMealPlan },
      { label: "Режим", value: mode === "comparison" ? "Сравнение на варианти" : "Избран хотел" }
    ], "is-cover");

    return printPage("gt63-print-cover", `
      <header class="gt63-print-cover-copy">
        <p class="gt63-print-brand">AYA Travel · GT63</p>
        <p class="gt63-print-kicker">Луксозна PDF презентация</p>
        <h1>${escapeHtml(destination)}</h1>
        <p class="gt63-print-subtitle">${escapeHtml(hotelName)}</p>
      </header>
      <div class="gt63-print-cover-layout">
        ${imageFrame(heroImage, `Снимка на ${hotelName}`, hotelName)}
        <aside class="gt63-print-price-panel">
          <p>Обща пакетна цена</p>
          <strong>${escapeHtml(viewModel.selectedPayload.priceDisplay)}</strong>
          <span>Офертата подлежи на финално потвърждение на наличност и условия.</span>
        </aside>
      </div>
      ${summary}
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
              <span>${escapeHtml(localize(text(segment.departure || segment.date, "")))}${segment.arrival ? ` → ${escapeHtml(localize(segment.arrival))}` : ""}</span>
              ${segment.duration ? `<small>${escapeHtml(localize(segment.duration))}</small>` : ""}
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function selectedHotelDetails(viewModel) {
    const hotel = viewModel.selectedHotel || {};
    const image = imageUrl(hotel);
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
        <div>
          <p>${escapeHtml(description)}</p>
          ${facts}
          ${url ? `<p class="gt63-print-link">Хотел: ${escapeHtml(url)}</p>` : ""}
        </div>
        ${imageFrame(image, "Снимка на избрания хотел", text(hotel.name, ""))}
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
    return `
      <section class="gt63-print-cta">
        <p class="gt63-print-kicker">Следваща стъпка</p>
        <h2>Вашата оферта е готова.</h2>
        <p>Потвърдете избрания хотел, за да проверим актуалната наличност и финалните условия преди резервация.</p>
        <div class="gt63-print-cta-row">
          <strong>${escapeHtml(viewModel.selectedPayload.priceDisplay)}</strong>
          ${contactPhone ? `<span>Контакт с консултант: ${escapeHtml(contactPhone)}</span>` : ""}
        </div>
      </section>
    `;
  }

  function renderPrintProposal(input = {}, options = {}) {
    const viewModel = viewModelApi.buildPresentationViewModel(input, options);
    const mode = viewModel.contract.mode;
    const selectedPages = [
      contentPage("gt63-print-flight-page", flightBlock(input)),
      contentPage("gt63-print-hotel-page", [
        recommendationBlock(viewModel),
        selectedHotelDetails(viewModel)
      ].filter(Boolean).join("")),
      contentPage("gt63-print-services-page", [
        includedServicesBlock(viewModel, input),
        transferBlock(input)
      ].filter(Boolean).join("")),
      contentPage("gt63-print-timeline-page", timelineBlock(input)),
      contentPage("gt63-print-experiences-page", optionalExperiencesBlock(input))
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

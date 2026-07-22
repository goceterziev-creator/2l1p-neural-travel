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

  function transferSummary(input = {}) {
    const transfer = input.transfer || {};
    const route = text(transfer.route || transfer.description, "Летище → място за настаняване → летище");
    const status = transfer.included || transfer.price > 0 || transfer.type || transfer.status
      ? text(transfer.status || transfer.type || "За потвърждение")
      : "За потвърждение";
    return `${localize(route)}. ${localize(status)}`;
  }

  function technicalSegments(title, segments = []) {
    if (!segments.length) return "";
    return `
      <section class="gt63-print-technical-group">
        <h3>${escapeHtml(title)}</h3>
        ${segments.map((segment) => `
          <article class="gt63-print-segment">
            <strong>${escapeHtml(localize([segment.airline, segment.flightNumber].filter(Boolean).join(" ") || "Полетен сегмент"))}</strong>
            <span>${escapeHtml(text(segment.from || segment.departureAirport, ""))} → ${escapeHtml(text(segment.to || segment.arrivalAirport, ""))}</span>
            <span>${escapeHtml(localize(text(segment.departure || segment.date, "")))}${segment.arrival ? ` → ${escapeHtml(localize(segment.arrival))}` : ""}</span>
            ${segment.duration ? `<small>${escapeHtml(localize(segment.duration))}</small>` : ""}
          </article>
        `).join("")}
      </section>
    `;
  }

  function selectedHotelDetails(viewModel) {
    const hotel = viewModel.selectedHotel || {};
    const image = imageUrl(hotel);
    const url = hotelUrl(hotel);
    return `
      <section class="gt63-print-section gt63-print-selected-details">
        <div>
          <p class="gt63-print-kicker">Избран хотел</p>
          <h2>${escapeHtml(text(hotel.name, "Избран хотел за потвърждение"))}</h2>
          <p>${escapeHtml(localize(text(hotel.description, "Описание на хотела за потвърждение.")))}</p>
          <dl class="gt63-print-details">
            <div><dt>Категория</dt><dd>${escapeHtml(starsLabel(hotel))}</dd></div>
            <div><dt>Стая</dt><dd>${escapeHtml(localize(text(hotel.room || hotel.roomType, "Стая за потвърждение")))}</dd></div>
            <div><dt>Изхранване</dt><dd>${escapeHtml(viewModel.selectedMealPlan)}</dd></div>
            <div><dt>Локация</dt><dd>${escapeHtml(localize(text(hotel.area || hotel.location || hotel.city, "Локация за потвърждение")))}</dd></div>
            <div><dt>Крайна цена</dt><dd>${escapeHtml(viewModel.selectedPayload.priceDisplay)}</dd></div>
          </dl>
          ${url ? `<p class="gt63-print-link">Хотел: ${escapeHtml(url)}</p>` : ""}
        </div>
        ${image ? `<img src="${escapeHtml(image)}" alt="Снимка на избрания хотел">` : ""}
      </section>
    `;
  }

  function recommendationBlock(viewModel) {
    const reasons = viewModel.selectedRecommendationReasons || [];
    if (!reasons.length) return "";
    return `
      <section class="gt63-print-section gt63-print-recommendation">
        <p class="gt63-print-kicker">Препоръка от GT63</p>
        <h2>Защо тази опция</h2>
        <ul>
          ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  function comparisonTable(viewModel) {
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
    return `
      <section class="gt63-print-section gt63-print-comparison">
        <p class="gt63-print-kicker">Сравнение</p>
        <h2>Варианти за настаняване</h2>
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
      </section>
    `;
  }

  function flightBlock(input = {}) {
    const flight = input.flight || {};
    const outbound = Array.isArray(flight.outboundSegments) ? flight.outboundSegments : [];
    const inbound = Array.isArray(flight.inboundSegments) ? flight.inboundSegments : [];
    return `
      <section class="gt63-print-section gt63-print-flight">
        <p class="gt63-print-kicker">Полет</p>
        <h2>${escapeHtml(localize(text(flight.airline, "Авиокомпания за потвърждение")))}</h2>
        <p>${escapeHtml(localize(text(flight.route, "Маршрут за потвърждение")))}</p>
        ${technicalSegments("Отиване", outbound)}
        ${technicalSegments("Връщане", inbound)}
        <dl class="gt63-print-details">
          <div><dt>Багаж</dt><dd>${escapeHtml(localize(text(flight.baggage, "За потвърждение")))}</dd></div>
        </dl>
      </section>
    `;
  }

  function renderPrintProposal(input = {}, options = {}) {
    const viewModel = viewModelApi.buildPresentationViewModel(input, options);
    const mode = viewModel.contract.mode;
    const title = text(input.destination?.name || input.destination?.requested || input.content?.heroTitle, "Персонална оферта");
    const hotelName = text(viewModel.selectedHotel?.name, "Избран хотел");
    const contactPhone = text(input.contact?.whatsappPhone || input.contact?.phone, "");

    return `
      <article class="gt63-print-proposal" data-print-mode="${escapeHtml(mode)}">
        <header class="gt63-print-hero">
          <p class="gt63-print-kicker">AYA TRAVEL · ПРИНТ ОФЕРТА</p>
          <h1>${escapeHtml(title)}</h1>
          <p>Подбрана персонална оферта за Вашето пътуване.</p>
          <dl class="gt63-print-summary">
            <div><dt>Избран хотел</dt><dd>${escapeHtml(hotelName)}</dd></div>
            <div><dt>Крайна цена</dt><dd>${escapeHtml(viewModel.selectedPayload.priceDisplay)}</dd></div>
            <div><dt>Дати</dt><dd>${escapeHtml(text(viewModel.travelDates, "За потвърждение"))}</dd></div>
            <div><dt>Пътуващи</dt><dd>${escapeHtml(text(input.client?.travelers, "За потвърждение"))}</dd></div>
            <div><dt>Изхранване</dt><dd>${escapeHtml(viewModel.selectedMealPlan)}</dd></div>
            <div><dt>Режим</dt><dd>${mode === "comparison" ? "Сравнение" : "Избран хотел"}</dd></div>
          </dl>
        </header>
        ${recommendationBlock(viewModel)}
        ${mode === "comparison" ? comparisonTable(viewModel) : selectedHotelDetails(viewModel)}
        ${mode === "comparison" ? "" : comparisonTable(viewModel)}
        <section class="gt63-print-section">
          <p class="gt63-print-kicker">Трансфер</p>
          <h2>${escapeHtml(transferSummary(input).split(". ")[0])}</h2>
          <p>${escapeHtml(transferSummary(input).split(". ").slice(1).join(". ") || "За потвърждение")}</p>
        </section>
        ${flightBlock(input)}
        <section class="gt63-print-section gt63-print-cta">
          <h2>Вашата оферта е готова.</h2>
          <p>Потвърдете избрания хотел, за да проверим актуалната наличност и финалните условия преди резервация.</p>
          ${contactPhone ? `<p>Контакт с консултант: ${escapeHtml(contactPhone)}</p>` : ""}
        </section>
      </article>
    `;
  }

  return {
    renderPrintProposal
  };
});

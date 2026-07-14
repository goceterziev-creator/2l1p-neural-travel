"use strict";

(function exposeFlightDisplayBg(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63FlightDisplayBg = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFlightDisplayBg() {
  const AIRPORTS = {
    SOF: "Летище София",
    DXB: "Международно летище Дубай",
    MLE: "Международно летище Велана",
    AUH: "Международно летище Абу Даби",
    ATH: "Международно летище Атина",
    STN: "Летище Лондон Станстед",
    LTN: "Летище Лондон Лутън",
    BCN: "Летище Барселона Ел Прат",
    LPA: "Летище Гран Канария",
    PRG: "Летище Прага Вацлав Хавел",
    NUE: "Летище Нюрнберг",
    HND: "Летище Токио Ханеда",
    NRT: "Летище Токио Нарита",
    MUC: "Летище Мюнхен",
    KIX: "Международно летище Кансай",
    ITM: "Летище Осака Итами",
    SSH: "Летище Шарм ел-Шейх",
    HRG: "Летище Хургада",
    TIA: "Летище Тирана",
    BGY: "Летище Милано Бергамо",
    ZRH: "Летище Цюрих",
    JFK: "Летище Ню Йорк JFK",
    VIE: "Летище Виена",
    PTY: "Международно летище Токумен",
    SCL: "Международно летище Артуро Мерино Бенитес",
    IST: "Летище Истанбул"
  };

  const MONTHS = {
    jan: "януари",
    january: "януари",
    feb: "февруари",
    february: "февруари",
    mar: "март",
    march: "март",
    apr: "април",
    april: "април",
    may: "май",
    jun: "юни",
    june: "юни",
    jul: "юли",
    july: "юли",
    aug: "август",
    august: "август",
    sep: "септември",
    sept: "септември",
    september: "септември",
    oct: "октомври",
    october: "октомври",
    nov: "ноември",
    november: "ноември",
    dec: "декември",
    december: "декември"
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function firstText(...values) {
    return values.map(clean).find(Boolean) || "";
  }

  function normalizeIata(value) {
    const text = clean(value).toUpperCase();
    const match = text.match(/\b[A-Z]{3}\b/);
    return match ? match[0] : "";
  }

  function airportName(value, fallback) {
    const code = normalizeIata(value);
    return AIRPORTS[code] || clean(fallback) || clean(value) || "за проверка";
  }

  function segmentAirport(segment = {}, side = "from") {
    if (side === "from") {
      return airportName(
        firstText(segment.from, segment.departureAirport, segment.origin),
        firstText(segment.fromAirport, segment.departureAirportName, segment.departureCity, segment.fromCity)
      );
    }
    return airportName(
      firstText(segment.to, segment.arrivalAirport, segment.destination),
      firstText(segment.toAirport, segment.arrivalAirportName, segment.arrivalCity, segment.toCity)
    );
  }

  function extractTime(value) {
    const match = clean(value).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
  }

  function formatDate(value) {
    const text = clean(value);
    if (!text) return "";

    const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?\b/);
    if (iso) {
      const monthsBg = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
      return `${Number(iso[3])} ${monthsBg[Number(iso[2]) - 1]} ${iso[1]}`;
    }

    const monthName = text.match(/\b(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/);
    if (monthName) {
      const month = MONTHS[monthName[2].toLowerCase()];
      if (month) return [Number(monthName[1]), month, monthName[3]].filter(Boolean).join(" ");
    }

    const bgMonth = text.match(/\b(\d{1,2})\s+(януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)(?:\s+(\d{4}))?/i);
    if (bgMonth) return [Number(bgMonth[1]), bgMonth[2].toLowerCase(), bgMonth[3]].filter(Boolean).join(" ");

    return text.replace(/\b\d{1,2}:\d{2}\b/g, "").trim();
  }

  function segmentDate(segment = {}, side = "departure") {
    const value = side === "arrival"
      ? firstText(segment.arrivalDate, segment.arrival)
      : firstText(segment.departureDate, segment.date, segment.departure);
    return formatDate(value);
  }

  function segmentTime(segment = {}, side = "departure") {
    const value = side === "arrival"
      ? firstText(segment.arrivalTime, segment.arrival)
      : firstText(segment.departureTime, segment.departure);
    return extractTime(value);
  }

  function formatDuration(duration) {
    const text = clean(duration);
    if (!text) return "за проверка";
    const hours = text.match(/(\d+)\s*(?:h|hr|hrs|hour|hours|ч)/i);
    const minutes = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes|мин)/i);
    const parts = [];
    if (hours) parts.push(`${Number(hours[1])} ч.`);
    if (minutes) parts.push(`${Number(minutes[1])} мин.`);
    return parts.length ? parts.join(" ") : text;
  }

  function segmentTitle(segment = {}) {
    return [clean(segment.airline), clean(segment.flightNumber)].filter(Boolean).join(" ") || "Полет за проверка";
  }

  function segmentView(segment = {}) {
    const departureDate = segmentDate(segment, "departure");
    const arrivalDate = segmentDate(segment, "arrival");
    return {
      title: segmentTitle(segment),
      route: `${segmentAirport(segment, "from")} → ${segmentAirport(segment, "to")}`,
      date: departureDate && arrivalDate && departureDate !== arrivalDate
        ? `${departureDate} / ${arrivalDate}`
        : departureDate || arrivalDate || "за проверка",
      time: `${segmentTime(segment, "departure") || "за проверка"} → ${segmentTime(segment, "arrival") || "за проверка"}`,
      duration: `Продължителност: ${formatDuration(segment.duration)}`
    };
  }

  function renderSegmentHtml(segment = {}) {
    const view = segmentView(segment);
    return `
      <div class="segment">
        <div class="segment-title">${escapeHtml(view.title)}</div>
        <div>${escapeHtml(view.route)}</div>
        <div>${escapeHtml(view.date)}</div>
        <div>${escapeHtml(view.time)}</div>
        <div class="muted">${escapeHtml(view.duration)}</div>
      </div>
    `;
  }

  function routeFromSegments(segments = []) {
    if (!Array.isArray(segments) || !segments.length) return "";
    const names = [segmentAirport(segments[0], "from"), ...segments.map((segment) => segmentAirport(segment, "to"))];
    return names.filter(Boolean).join(" → ");
  }

  return {
    airportName,
    formatDate,
    formatDuration,
    renderSegmentHtml,
    routeFromSegments,
    segmentView
  };
});

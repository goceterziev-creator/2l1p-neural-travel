const fs = require("fs");
const path = require("path");

const AIRPORT_BG_FILE = path.join(__dirname, "..", "data", "reference", "airport-bg.json");

let airportReference = {};
try {
  airportReference = JSON.parse(fs.readFileSync(AIRPORT_BG_FILE, "utf8"));
} catch (error) {
  console.warn("GT63 Bulgarian airport display reference unavailable:", error.message);
}

const MONTHS_BG = [
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

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractIata(value = "") {
  const match = clean(value).toUpperCase().match(/\b[A-Z]{3}\b/);
  return match ? match[0] : "";
}

function fallbackText(...values) {
  return values.map(clean).find(Boolean) || "за проверка";
}

function formatDay(value) {
  const day = Number(value || 0);
  return day ? String(day).padStart(2, "0") : "";
}

function formatAirportBg(airport = {}) {
  const code = extractIata(
    typeof airport === "string"
      ? airport
      : airport.code || airport.iata || airport.airportCode || airport.value || ""
  );
  const original = typeof airport === "string"
    ? airport
    : airport.airportBg || airport.airport || airport.name || airport.cityBg || airport.city || airport.label || "";
  const reference = code ? airportReference[code] : null;

  if (reference?.airportBg) return reference.airportBg;
  return fallbackText(original, code);
}

function formatDateBg(date = "") {
  const value = clean(date);
  if (!value) return "за проверка";

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (isoMatch) {
    const day = formatDay(isoMatch[3]);
    const month = MONTHS_BG[Number(isoMatch[2]) - 1] || isoMatch[2];
    return `${day} ${month}`;
  }

  const bgNumericMatch = value.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (bgNumericMatch) {
    const day = formatDay(bgNumericMatch[1]);
    const month = MONTHS_BG[Number(bgNumericMatch[2]) - 1] || bgNumericMatch[2];
    return `${day} ${month}`;
  }

  const enMonthMatch = value.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?[,]?\s*(\d{1,2})?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s*(\d{1,2})?/i);
  if (enMonthMatch) {
    const monthKey = enMonthMatch[2].slice(0, 3).toLowerCase();
    const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(monthKey);
    const day = formatDay(enMonthMatch[1] || enMonthMatch[3] || 0);
    if (day && monthIndex >= 0) return `${day} ${MONTHS_BG[monthIndex]}`;
  }

  const bgMonthMatch = value.match(/\b(\d{1,2})\s+(януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)\b/i);
  if (bgMonthMatch) return `${formatDay(bgMonthMatch[1])} ${bgMonthMatch[2].toLowerCase()}`;

  return value;
}

function formatTime(value = "") {
  const text = clean(value);
  const isoMatch = text.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`;
  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);
  if (!timeMatch) return "за проверка";
  let hour = Number(timeMatch[1]);
  const minute = timeMatch[2];
  const meridiem = String(timeMatch[3] || "").toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function formatDurationBg(duration = "") {
  const value = clean(duration);
  if (!value) return "за проверка";

  const hoursMatch = value.match(/(\d+)\s*(?:h|hr|hrs|hour|hours|ч)/i);
  const minutesMatch = value.match(/(\d+)\s*(?:m|min|mins|minute|minutes|м)/i);
  const parts = [];
  if (hoursMatch) parts.push(`${Number(hoursMatch[1])} ч.`);
  if (minutesMatch) parts.push(`${Number(minutesMatch[1])} мин.`);
  return parts.length ? parts.join(" ") : value;
}

function formatFlightSegmentBg(segment = {}) {
  const airline = fallbackText(segment.airline, "");
  const flightNumber = clean(segment.flightNumber);
  const header = [airline === "за проверка" ? "" : airline, flightNumber].filter(Boolean).join(" ") || "Полет за проверка";
  const from = formatAirportBg({ code: segment.from, airport: segment.fromAirport || segment.fromName || segment.fromCity });
  const to = formatAirportBg({ code: segment.to, airport: segment.toAirport || segment.toName || segment.toCity });
  const departureDate = formatDateBg(segment.departureDate || segment.date || segment.departure);
  const arrivalDate = formatDateBg(segment.arrivalDate || segment.arrival || segment.departureDate || segment.date || segment.departure);
  const dateLine = departureDate === arrivalDate ? departureDate : `${departureDate} / ${arrivalDate}`;
  const departureTime = formatTime(segment.departureTime || segment.departure);
  const arrivalTime = formatTime(segment.arrivalTime || segment.arrival);
  const duration = formatDurationBg(segment.duration);

  return [
    header,
    `${from} → ${to}`,
    dateLine,
    `${departureTime} → ${arrivalTime}`,
    `Продължителност: ${duration}`
  ].join("\n");
}

function formatDirectionBg(label, segments = []) {
  const rows = Array.isArray(segments)
    ? segments.map(formatFlightSegmentBg).filter(Boolean)
    : [];
  if (!rows.length) return "";
  return [label, "", rows.join("\n\n")].join("\n");
}

function formatFlightItineraryBg(flight = {}) {
  const outbound = formatDirectionBg("Отиване", flight.outboundSegments || flight.outbound?.segments || []);
  const inbound = formatDirectionBg("Връщане", flight.inboundSegments || flight.inbound?.segments || []);
  return [outbound, inbound].filter(Boolean).join("\n\n");
}

module.exports = {
  formatFlightItineraryBg,
  formatFlightSegmentBg,
  formatAirportBg,
  formatDateBg,
  formatDurationBg
};

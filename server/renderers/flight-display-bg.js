const {
  formatAirportBg,
  formatRouteBg,
  normalizeIataCode,
  CHECK_VALUE
} = require("../travel-normalizers/airport-normalizer");
const {
  formatDateBg,
  extractTime
} = require("../travel-normalizers/date-normalizer");

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function field(...values) {
  return values.map(clean).find(Boolean) || "";
}

function formatDurationBg(duration = "") {
  const value = clean(duration);
  if (!value) return CHECK_VALUE;
  const hoursMatch = value.match(/(\d+)\s*(?:h|hr|hrs|hour|hours|ч)/i);
  const minutesMatch = value.match(/(\d+)\s*(?:m|min|mins|minute|minutes|м)/i);
  const parts = [];
  if (hoursMatch) parts.push(`${Number(hoursMatch[1])} ч.`);
  if (minutesMatch) parts.push(`${Number(minutesMatch[1])} мин.`);
  return parts.length ? parts.join(" ") : value;
}

function segmentAirport(segment = {}, side = "from", mode = "client") {
  const code = side === "from"
    ? field(segment.from, segment.departureAirport, segment.origin)
    : field(segment.to, segment.arrivalAirport, segment.destination);
  const city = side === "from"
    ? field(segment.fromCity, segment.departureCity)
    : field(segment.toCity, segment.arrivalCity);
  const airport = side === "from"
    ? field(segment.fromAirport, segment.departureAirportName, segment.departureName)
    : field(segment.toAirport, segment.arrivalAirportName, segment.arrivalName);

  if (mode === "agent") {
    const resolvedCode = normalizeIataCode(code);
    const cityLabel = city || resolvedCode || airport;
    return resolvedCode && cityLabel ? `${cityLabel} (${resolvedCode})` : formatAirportBg({ code, city, airport });
  }

  return formatAirportBg({ code, city, airport, value: code || airport || city });
}

function segmentDate(segment = {}, side = "departure") {
  const value = side === "arrival"
    ? field(segment.arrivalDate, segment.arrival)
    : field(segment.departureDate, segment.date, segment.departure);
  return formatDateBg(value);
}

function segmentTime(segment = {}, side = "departure") {
  const value = side === "arrival"
    ? field(segment.arrivalTime, segment.arrival)
    : field(segment.departureTime, segment.departure);
  return extractTime(value) || CHECK_VALUE;
}

function renderFlightSegment(segment = {}, { mode = "client" } = {}) {
  const airline = field(segment.airline);
  const flightNumber = field(segment.flightNumber);
  const header = [airline, flightNumber].filter(Boolean).join(" ") || "Полет за проверка";
  const from = segmentAirport(segment, "from", mode);
  const to = segmentAirport(segment, "to", mode);
  const departureDate = segmentDate(segment, "departure");
  const arrivalDate = segmentDate(segment, "arrival");
  const dateLine = departureDate && arrivalDate && departureDate !== arrivalDate
    ? `${departureDate} / ${arrivalDate}`
    : departureDate || arrivalDate || CHECK_VALUE;
  const departureTime = segmentTime(segment, "departure");
  const arrivalTime = segmentTime(segment, "arrival");

  return [
    header,
    `${from} → ${to}`,
    dateLine,
    `${departureTime} → ${arrivalTime}`,
    `Продължителност: ${formatDurationBg(segment.duration)}`
  ].filter(Boolean).join("\n");
}

function renderDirection(label, segments = [], options = {}) {
  const rows = Array.isArray(segments)
    ? segments.map((segment) => renderFlightSegment(segment, options)).filter(Boolean)
    : [];
  if (!rows.length) return "";
  return [label, "", rows.join("\n\n")].join("\n");
}

function renderClientFlightItineraryBg(flight = {}) {
  const outbound = renderDirection("Отиване", flight.outboundSegments || flight.outbound?.segments || [], { mode: "client" });
  const inbound = renderDirection("Връщане", flight.inboundSegments || flight.inbound?.segments || [], { mode: "client" });
  return [outbound, inbound].filter(Boolean).join("\n\n");
}

function renderAgentFlightItineraryBg(flight = {}) {
  const outbound = renderDirection("Отиване", flight.outboundSegments || flight.outbound?.segments || [], { mode: "agent" });
  const inbound = renderDirection("Връщане", flight.inboundSegments || flight.inbound?.segments || [], { mode: "agent" });
  return [outbound, inbound].filter(Boolean).join("\n\n");
}

module.exports = {
  renderClientFlightItineraryBg,
  renderClientFlightSegmentBg: (segment = {}) => renderFlightSegment(segment, { mode: "client" }),
  renderAgentFlightItineraryBg,
  formatFlightItineraryBg: renderClientFlightItineraryBg,
  formatFlightSegmentBg: (segment = {}) => renderFlightSegment(segment, { mode: "client" }),
  formatAirportBg,
  formatRouteBg,
  formatDateBg,
  formatDurationBg
};

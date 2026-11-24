"use strict";

const { randomUUID } = require("node:crypto");
const { tokens, summary } = require("../public/flight-data-consistency");
const { extractTime } = require("./travel-normalizers/date-normalizer");
const { currencyFromText, moneyFromText } = require("./smart-import-hotel-review");

function flightText(value) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return /^(?:null|undefined|unknown|n\/?a|не е посочено|[-–—])$/iu.test(text) ? "" : text;
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 100 ? value : null;
}

function passengerScope(value = {}) {
  const adults = count(value?.adults), children = count(value?.children), infants = count(value?.infants);
  const categories = [adults, children, infants];
  const total = count(value?.count);
  return { count: total > 0 && categories.reduce((sum, n) => sum + (n ?? 0), 0) <= total &&
    (!categories.every(n => n !== null) || categories.reduce((sum, n) => sum + n, 0) === total) ? total : null,
  adults, children, infants };
}

function normalizePriceObservations(observations) {
  const allowed = (value, entries) => entries.includes(value) ? value : "unknown";
  return (Array.isArray(observations) ? observations : []).slice(0, 30).map(item => ({
    sourceId: /^SRC-[1-8]$/.test(item?.sourceId || "") ? item.sourceId : "",
    label: flightText(item?.label).slice(0, 160),
    text: flightText(item?.text).slice(0, 160),
    amount: typeof item?.amount === "number" && Number.isFinite(item.amount) && item.amount > 0 ? item.amount : null,
    currency: /^[A-Z]{3}$/.test(flightText(item?.currency).toUpperCase()) ? flightText(item.currency).toUpperCase() : "",
    priceUnit: allowed(item?.priceUnit, ["per-person", "party-total"]),
    routeScope: allowed(item?.routeScope, ["segment", "one-way", "round-trip"]),
    componentRole: allowed(item?.componentRole, ["fare-total", "tax", "add-on"]),
    passengerScope: passengerScope(item?.passengerScope)
  }));
}

function routeIdentity(flight) {
  const normalize = list => (Array.isArray(list) ? list : []).map(segment => [
    flightText(segment?.from).toUpperCase(), flightText(segment?.to).toUpperCase()
  ]);
  const outbound = normalize(flight.outboundSegments), inbound = normalize(flight.inboundSegments);
  if (!outbound.length || [...outbound, ...inbound].some(pair => pair.some(code => !/^[A-Z]{3}$/.test(code)))) return null;
  const route = flightText(flight.route).toUpperCase().replace(/\s+/g, "").replace(/→|->/g, ">");
  const expected = [outbound, inbound].filter(leg => leg.length)
    .map(leg => leg[0][0] + ">" + leg.at(-1)[1]).join("/");
  return route === expected ? [outbound, inbound] : null;
}

function segmentFacts(segment) {
  const moment = side => {
    const raw = flightText(segment?.[side]);
    const dates = tokens(raw);
    return { date: dates.length === 0 ? null : dates.length === 1 && dates[0].key || false, clock: extractTime(raw) };
  };
  return {
    airline: flightText(segment?.airline).toUpperCase(),
    flightNumber: flightText(segment?.flightNumber).replace(/\s/g, "").toUpperCase(),
    departure: moment("departure"), arrival: moment("arrival")
  };
}

function itineraryFacts(flight) {
  return {
    airline: flightText(flight.airline).toUpperCase(),
    outbound: (flight.outboundSegments || []).map(segmentFacts),
    inbound: (flight.inboundSegments || []).map(segmentFacts)
  };
}

function sameEvidenceDate(expected, actual) {
  if (expected === false || actual === false) return false;
  if (typeof expected === "string" && expected.startsWith("????-")) {
    return typeof actual === "string" && expected.slice(4) === actual.slice(4);
  }
  return expected === actual;
}

function matchesItinerary(flight, evidence) {
  const current = itineraryFacts(flight);
  if (current.airline !== evidence.airline) return false;
  const matches = (list, expected) => list.length === expected.length && list.every((item, index) => {
    const original = expected[index];
    return item.airline === original.airline && item.flightNumber === original.flightNumber &&
      ["departure", "arrival"].every(side => sameEvidenceDate(original[side].date, item[side].date) &&
        original[side].clock === item[side].clock);
  });
  const clocks = raw => [...flightText(raw).matchAll(/(?<!\d)\d{1,2}:\d{2}(?:\s*[AP]M)?\b/gi)]
    .map(match => extractTime(match[0]));
  for (const [leg, field] of [["outbound", "departure"], ["inbound", "arrival"]]) {
    if (!matches(current[leg], evidence[leg])) return false;
    const nested = flight[leg]?.segments;
    if (Array.isArray(nested) && nested.length && !matches(nested.map(segmentFacts), evidence[leg])) return false;
    const expectedSummary = summary(flight[leg + "Segments"]);
    if (expectedSummary && flightText(flight[field]) &&
        JSON.stringify(clocks(flight[field])) !== JSON.stringify(clocks(expectedSummary))) return false;
  }
  return !Array.isArray(flight.segments) || !flight.segments.length ||
    matches(flight.segments.map(segmentFacts), [...evidence.outbound, ...evidence.inbound]);
}

function journeyKey(flight) {
  if (!flight) return "";
  const legs = [flight.outboundSegments, flight.inboundSegments].filter(leg => Array.isArray(leg) && leg.length);
  if (legs.length) {
    const endpoints = legs.map(leg => [flightText(leg[0]?.from).toUpperCase(), flightText(leg.at(-1)?.to).toUpperCase()]);
    if (endpoints.every(pair => pair.every(code => /^[A-Z]{3}$/.test(code)))) return endpoints.map(pair => pair.join(">")).join("/");
  }
  return flightText(flight.route).toUpperCase().split("/").map(leg => {
    const airports = leg.match(/\b[A-Z]{3}\b/g);
    return airports?.length >= 2 ? airports[0] + ">" + airports.at(-1) : "";
  }).filter(Boolean).join("/");
}

function reviewFlightPrice(flight, observations, sourceIds, advertisedPassengerCount) {
  const route = routeIdentity(flight);
  const scope = route?.[1].length ? "round-trip" : "one-way";
  const candidates = observations.filter(item => sourceIds.includes(item.sourceId) &&
    item.priceUnit === "party-total" && item.routeScope === scope && item.componentRole === "fare-total" &&
    /^(?:общо(?: за всички (?:пътници|пасажери))?|обща цена(?: за всички (?:пътници|пасажери))?|крайна цена|(?:grand )?total(?: price)?(?: for all (?:passengers|travelers|travellers))?)[:.]?$/iu.test(item.label));
  if (!route || !candidates.length) return { warning: "FLIGHT_PRICE_SCOPE_UNKNOWN" };
  // Match a single transcribed monetary amount, not a combined tax/fee line.
  const valid = item => item.passengerScope.count !== null &&
    (!advertisedPassengerCount || item.passengerScope.count === advertisedPassengerCount) &&
    /^(?:(?:[A-Z]{3}|[€£])\s*\d[\d.,\s]*|\d[\d.,\s]*\s*(?:[A-Z]{3}|[€£]))$/iu.test(item.text) &&
    item.currency && currencyFromText(item.text) === item.currency && moneyFromText(item.text) === item.amount;
  if (candidates.some(item => !valid(item))) return { warning: "FLIGHT_PRICE_EVIDENCE_INCOMPLETE" };
  const first = candidates[0];
  if (candidates.some(item => item.amount !== first.amount || item.currency !== first.currency ||
    JSON.stringify(item.passengerScope) !== JSON.stringify(first.passengerScope))) return { warning: "FLIGHT_PRICE_TOTAL_CONFLICT" };
  return { total: first, route };
}

function sourceFlightRecord({ intakeId, agencyId, candidate, quote }) {
  const { total, route } = candidate.priceReview;
  if (!total || !candidate.provider) return null;
  const rate = total.currency === "EUR" ? 1 : quote?.rates?.[total.currency];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const eurPrice = Math.round(total.amount / rate * 100) / 100;
  if (!Number.isFinite(eurPrice) || eurPrice <= 0) return null;
  return { version: 2, referenceId: randomUUID(), intakeId, agencyId, provider: candidate.provider,
    candidateId: candidate.candidateId, sourceIds: candidate.sourceIds, total, route, eurPrice,
    itinerary: itineraryFacts(candidate.flight),
    rate, rateOrigin: total.currency === "EUR" ? "EUR" : quote.provider,
    rateDate: total.currency === "EUR" ? null : quote.updatedAt };
}

function matchesGuests(value, evidence) {
  const input = flightText(value).toLowerCase();
  const generic = input.match(/^(\d+)\s*(?:пътници|пътник|души|passengers?|travell?ers?)$/iu);
  if (generic) return Number(generic[1]) === evidence.count &&
    [evidence.adults, evidence.children, evidence.infants].every(n => n === null);
  const categories = { adults: 0, children: 0, infants: 0 };
  const matches = [...input.matchAll(/(\d+)\s*(възрастни|възрастен|adults?|деца|дете|children|child|kids?|бебета|бебе|infants?)/giu)];
  const rest = input.replace(/(\d+)\s*(възрастни|възрастен|adults?|деца|дете|children|child|kids?|бебета|бебе|infants?)/giu, "")
    .replace(/(?:\band\b|и|[,+&\s])/gu, "");
  if (!matches.length || rest) return false;
  for (const [, amount, label] of matches) {
    const category = /^(възраст|adult)/u.test(label) ? "adults" : /^(беб|infant)/u.test(label) ? "infants" : "children";
    categories[category] += Number(amount);
  }
  return Object.values(categories).reduce((a, b) => a + b, 0) === evidence.count &&
    Object.keys(categories).every(key => evidence[key] === null ? categories[key] === 0 : categories[key] === evidence[key]);
}

function bindFlightPrices({ body, agencyId, intakes, previous, invalid }) {
  const oldFlights = Array.isArray(previous?.flights) ? previous.flights : [];
  const wasSourceBound = oldFlights.some(flight => flight.importedFlightPrice?.kind === "source-total");
  const flights = Array.isArray(body.flights) ? body.flights : [];
  if (!flights.length) {
    if (wasSourceBound && Number(body.flightPrice) > 0) throw invalid(0, "FLIGHT_PRICE_PROVENANCE_REQUIRED");
    return body;
  }
  const selectedIntakes = new Set();
  const selectedRoutes = new Set();
  const hasReplacement = flights.some(flight => flight?.importedFlightPrice);
  for (const [index, flight] of flights.entries()) {
    const route = journeyKey(flight);
    if (!route || !(Number(flight?.price) > 0)) continue;
    if (flights.some((other, otherIndex) => otherIndex !== index && Number(other?.price) > 0 && journeyKey(other) === route &&
        (!flight.importedFlightPrice ? other.importedFlightPrice : otherIndex < index && other.importedFlightPrice))) {
      throw invalid(index, "FLIGHT_PRICE_MULTIPLE_CANDIDATES");
    }
  }
  return { ...body, flights: body.flights.map((flight, index) => {
    const claim = flight?.importedFlightPrice;
    const selection = flight?.importSelection;
    if (!claim) {
      const oldSourceForRoute = oldFlights.some(old => old.importedFlightPrice?.kind === "source-total" &&
        journeyKey(old) && journeyKey(old) === journeyKey(flight));
      const unchangedManual = oldFlights.some(old => !old.importedFlightPrice && old.route === flight?.route &&
        old.price === flight?.price && old.departure === flight?.departure && old.arrival === flight?.arrival);
      if (Number(flight?.price) > 0 && (oldSourceForRoute || (wasSourceBound && !hasReplacement && !unchangedManual))) {
        throw invalid(index, "FLIGHT_PRICE_PROVENANCE_REQUIRED");
      }
      if (!selection || previous?.flights?.some(old => !old.importedFlightPrice && old.price === flight.price &&
        old.route === flight.route && JSON.stringify(old.importSelection) === JSON.stringify(selection))) return flight;
      throw invalid(index, "FLIGHT_PRICE_PROVENANCE_REQUIRED");
    }
    const route = routeIdentity(flight);
    const routeKey = route && JSON.stringify(route);
    if (routeKey && selectedRoutes.has(routeKey)) throw invalid(index, "FLIGHT_PRICE_MULTIPLE_CANDIDATES");
    if (routeKey) selectedRoutes.add(routeKey);
    if (claim.kind === "operator") {
      if (typeof flight.price !== "number" || !Number.isFinite(flight.price) || !(flight.price > 0) || body.currency !== "EUR") {
        throw invalid(index, "FLIGHT_OPERATOR_PRICE_INVALID");
      }
      return { ...flight, importedFlightPrice: { kind: "operator" } };
    }
    const intake = /^SMART-\d+-[a-f0-9]{6}$/.test(claim.intakeId || "") ? intakes?.[claim.intakeId] : null;
    const record = intake?.agencyId === agencyId && claim.kind === "source-total" && claim.version === 2
      ? intake.flightRecords?.find(item => item.referenceId === claim.referenceId && item.agencyId === agencyId &&
        item.intakeId === claim.intakeId && item.version === claim.version) : null;
    if (!record || record.candidateId !== claim.candidateId || record.provider !== selection?.provider ||
        JSON.stringify(record.sourceIds) !== JSON.stringify(selection?.sourceIds)) throw invalid(index, "FLIGHT_PRICE_REFERENCE_INVALID");
    if (JSON.stringify(record.route) !== JSON.stringify(route)) throw invalid(index, "FLIGHT_PRICE_ROUTE_MISMATCH");
    if (!record.itinerary || !matchesItinerary(flight, record.itinerary)) throw invalid(index, "FLIGHT_PRICE_ITINERARY_MISMATCH");
    if (!matchesGuests(body.guests, record.total.passengerScope)) throw invalid(index, "FLIGHT_PRICE_PASSENGERS_MISMATCH");
    const price = Math.round(record.total.amount / record.rate * 100) / 100;
    if (selection.amount !== record.total.amount || selection.currency !== record.total.currency ||
        claim.rate !== record.rate || flight.price !== price || body.currency !== "EUR") throw invalid(index, "FLIGHT_PRICE_AMOUNT_OR_FX_MISMATCH");
    if (selectedIntakes.has(record.intakeId)) throw invalid(index, "FLIGHT_PRICE_MULTIPLE_CANDIDATES");
    selectedIntakes.add(record.intakeId);
    return { ...flight, price, importedFlightPrice: { kind: "source-total", version: record.version,
      intakeId: record.intakeId, referenceId: record.referenceId, candidateId: record.candidateId, rate: record.rate } };
  }) };
}

module.exports = { flightText, normalizePriceObservations, reviewFlightPrice, sourceFlightRecord, bindFlightPrices };

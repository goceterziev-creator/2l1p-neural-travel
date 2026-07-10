const fs = require("fs");
const path = require("path");

const AIRPORT_DICTIONARY_FILE = path.join(__dirname, "..", "..", "data", "reference", "iata-airports-bg.json");
const CHECK_VALUE = "за проверка";

let airportDictionary = {};
let aliasIndex = new Map();

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeSearch(value = "") {
  return clean(value).toLocaleLowerCase("bg-BG");
}

function normalizeIataCode(value = "") {
  const match = clean(value).toUpperCase().match(/\b[A-Z]{3}\b/);
  return match ? match[0] : "";
}

function indexAirports(dictionary = {}) {
  const nextIndex = new Map();
  Object.entries(dictionary).forEach(([code, airport]) => {
    const iata = normalizeIataCode(airport?.iata || code);
    if (!iata) return;
    [iata, airport.cityBg, airport.airportBg, airport.countryBg, ...(Array.isArray(airport.aliases) ? airport.aliases : [])]
      .map(normalizeSearch)
      .filter(Boolean)
      .forEach((alias) => nextIndex.set(alias, iata));
  });
  return nextIndex;
}

try {
  airportDictionary = JSON.parse(fs.readFileSync(AIRPORT_DICTIONARY_FILE, "utf8"));
  aliasIndex = indexAirports(airportDictionary);
} catch (error) {
  console.warn("GT63 IATA airport BG dictionary unavailable:", error.message);
}

function resolveAirport(input = {}, fallback = {}) {
  const raw = typeof input === "string" ? input : input.raw || input.value || input.code || input.iata || "";
  const existingAirport = typeof input === "object" ? clean(input.airportBg || input.airport || input.name || input.label) : "";
  const existingCity = typeof input === "object" ? clean(input.cityBg || input.city) : "";
  const explicitCode = normalizeIataCode(raw || existingAirport || existingCity);
  const exactAlias = aliasIndex.get(clean(raw)) || aliasIndex.get(clean(existingAirport)) || aliasIndex.get(clean(existingCity));
  const insensitiveAlias = aliasIndex.get(normalizeSearch(raw)) ||
    aliasIndex.get(normalizeSearch(existingAirport)) ||
    aliasIndex.get(normalizeSearch(existingCity));
  const code = explicitCode || exactAlias || insensitiveAlias || normalizeIataCode(fallback.code || fallback.iata || "");
  const reference = code ? airportDictionary[code] : null;

  if (reference) {
    return {
      ...reference,
      iata: reference.iata || code,
      source: explicitCode ? "iata" : "alias"
    };
  }

  const rawFallback = clean(existingAirport || existingCity || raw || fallback.airport || fallback.city || fallback.value);
  return {
    iata: code || "",
    cityBg: existingCity || "",
    airportBg: existingAirport || rawFallback || CHECK_VALUE,
    countryBg: "",
    aliases: [],
    source: rawFallback ? "raw" : "missing"
  };
}

function formatAirportBg(airport = {}) {
  const resolved = resolveAirport(airport);
  return clean(resolved.airportBg || resolved.cityBg || resolved.iata) || CHECK_VALUE;
}

function formatRouteBg(route = {}) {
  if (typeof route === "string") {
    const codes = route.match(/\b[A-Z]{3}\b/g) || [];
    if (codes.length >= 2) return `${formatAirportBg(codes[0])} → ${formatAirportBg(codes[codes.length - 1])}`;
    return clean(route) || CHECK_VALUE;
  }

  const from = formatAirportBg(route.from || route.departureAirport || route.departure || route.origin || "");
  const to = formatAirportBg(route.to || route.arrivalAirport || route.arrival || route.destination || "");
  return `${from} → ${to}`;
}

module.exports = {
  normalizeIataCode,
  resolveAirport,
  formatAirportBg,
  formatRouteBg,
  CHECK_VALUE
};

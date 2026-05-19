const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DB_FILE = path.join(ROOT, "DATABASE", "database.json");
const BACKUP_DIR = path.join(ROOT, "backups");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseAdultCount(value = "") {
  const text = normalizeText(value);
  const patterns = [
    /(\d+)\s*(?:възрастен|възрастни|adult|adults)/i,
    /(?:adults?|възрастни?)\D{0,12}(\d+)/i,
    /(?:group_adults|req_adults)=([0-9]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return toNumber(match[1], 0);
  }

  return 0;
}

function inferYearFromText(value = "") {
  const years = String(value || "").match(/\b20\d{2}\b/g) || [];
  return years.length ? years[years.length - 1] : "";
}

function parseDateTokens(value = "", fallbackYear = "") {
  const text = String(value || "");
  const dates = [];
  const re = /\b(\d{1,2})[./-](\d{1,2})(?:[./-](20\d{2}|\d{2}))?\b/g;
  let match;

  while ((match = re.exec(text))) {
    let year = match[3] || fallbackYear;
    if (!year) continue;
    if (year.length === 2) year = `20${year}`;
    dates.push(`${year}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`);
  }

  return dates;
}

function getFlights(offer) {
  return safeArray(offer.flights).length ? safeArray(offer.flights) : safeArray(offer.flightOptions);
}

function getHotels(offer) {
  return safeArray(offer.hotels).length ? safeArray(offer.hotels) : safeArray(offer.hotelOptions);
}

function isLikelyImageUrl(value = "") {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  if (/\.(?:jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i.test(text)) return true;
  return /\/images?\//i.test(text) && !/\/hotel\/[^/]+\/[^/?#]+\.html/i.test(text);
}

function uniqueWarnings(warnings = []) {
  return [...new Set(safeArray(warnings).map((item) => String(item || "").trim()).filter(Boolean))];
}

function buildWarnings(offer = {}) {
  const warnings = [];
  const flights = getFlights(offer);
  const hotels = getHotels(offer);
  const flightText = flights.map((flight) => [
    flight.airline,
    flight.route,
    flight.departure,
    flight.arrival,
    flight.baggage,
    flight.notes
  ].join(" ")).join(" ");
  const hotelText = hotels.map((hotel) => [
    hotel.name,
    hotel.area,
    hotel.distance,
    hotel.room,
    hotel.meal,
    hotel.roomsLeft,
    hotel.description,
    safeArray(hotel.images).join(" ")
  ].join(" ")).join(" ");

  const offerAdults = parseAdultCount(offer.guests);
  const flightAdults = parseAdultCount(flightText);
  const hotelAdults = parseAdultCount(hotelText);

  if (offerAdults && flightAdults && offerAdults !== flightAdults) {
    warnings.push(`Flight guests mismatch: offer Guests is "${offer.guests || "-"}", but flight details indicate ${flightAdults} adult(s).`);
  }

  if (offerAdults && hotelAdults && offerAdults !== hotelAdults) {
    warnings.push(`Hotel guests mismatch: offer Guests is "${offer.guests || "-"}", but hotel room/description indicates ${hotelAdults} adult(s).`);
  }

  const offerYear = inferYearFromText(offer.travelDates) || inferYearFromText(flightText);
  const offerDates = parseDateTokens(offer.travelDates, offerYear);
  const flightDates = parseDateTokens(flightText, offerYear);

  if (offerDates.length >= 2 && flightDates.length >= 2) {
    if (offerDates[0] !== flightDates[0] || offerDates[1] !== flightDates[1]) {
      warnings.push(`Flight dates mismatch: offer period is "${offer.travelDates || "-"}", but flight details show ${flightDates[0]} - ${flightDates[1]}.`);
    }
  }

  for (const hotel of hotels) {
    if (/няма налич|няма свобод|not available|no availability|sold out|unavailable/.test(normalizeText(hotel.roomsLeft))) {
      warnings.push(`Hotel availability warning: "${hotel.name || "Hotel"}" shows "${hotel.roomsLeft}".`);
    }

    const images = safeArray(hotel.images);
    const validImages = images.filter(isLikelyImageUrl);
    if (validImages.length !== images.length) {
      hotel.images = validImages;
      warnings.push(`Hotel image URL warning: ${images.length - validImages.length} hotel image URL(s) are not direct image links and were ignored.`);
    }
  }

  return uniqueWarnings([...safeArray(offer.validationWarnings), ...warnings]);
}

function main() {
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (!Array.isArray(db.offers)) db.offers = [];
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `database-v8.3.3-qa-validation-${stamp}.json`);
  fs.copyFileSync(DB_FILE, backupFile);

  let updated = 0;
  for (const offer of db.offers) {
    const before = JSON.stringify({
      warnings: offer.validationWarnings || [],
      hotels: getHotels(offer).map((hotel) => hotel.images || [])
    });
    offer.validationWarnings = buildWarnings(offer);
    if (offer.validationWarnings.length) offer.warningsDismissed = false;
    const after = JSON.stringify({
      warnings: offer.validationWarnings || [],
      hotels: getHotels(offer).map((hotel) => hotel.images || [])
    });
    if (before !== after) updated += 1;
  }

  db.schemaVersion = "8.3.3";
  db.updatedAt = new Date().toISOString();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");

  console.log(JSON.stringify({ ok: true, backupFile, offers: db.offers.length, updated }, null, 2));
}

main();

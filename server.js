require("dotenv").config({ path: ".env.local" });

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3001;
const LIVE_BASE_URL = process.env.LIVE_BASE_URL || `http://localhost:${PORT}`;

const DB_DIR = path.join(__dirname, "DATABASE");
const DB_FILE = path.join(DB_DIR, "database.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.static(PUBLIC_DIR));

ensureDb();

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ offers: [] }, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const data = JSON.parse(raw || "{}");
    if (!Array.isArray(data.offers)) data.offers = [];
    return data;
  } catch (err) {
    console.error("DB read error:", err);
    return { offers: [] };
  }
}

function writeDb(data) {
  ensureDb();
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

function uid() {
  return `OFF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function fixKnownMojibake(value = "") {
  return String(value)
    .replace(/тЖТ/g, "→")
    .replace(/тАФ/g, "—")
    .replace(/тАУ/g, "–")
    .replace(/тАЮ/g, "„")
    .replace(/тАЬ/g, "“")
    .replace(/┬╖/g, "·")
    .replace(/тШЕ/g, "★")
    .replace(/тЬи/g, "★")
    .replace(/тЬ│/g, "★");
}

function cleanClientText(value = "") {
  return fixKnownMojibake(value).trim();
}

function formatMoney(value, currency = "EUR") {
  return `${toNumber(value, 0).toFixed(2)} ${currency || "EUR"}`;
}

function formatDateTime(input) {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleString("bg-BG");
}

function cleanSlug(value = "") {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.html?$/i, "")
    .trim();
}

function extractHotelNameFromUrl(input = "") {
  try {
    const url = new URL(input);
    const decodedPath = decodeURIComponent(url.pathname);

    const bookingMatch = decodedPath.match(/\/hotel\/[^/]+\/([^/]+?)(?:\.html)?$/i);
    if (bookingMatch && bookingMatch[1]) return cleanSlug(bookingMatch[1]);

    const parts = decodedPath.split("/").filter(Boolean);
    const last = parts[parts.length - 1];

    if (last) return cleanSlug(last);

    return "Selected hotel";
  } catch {
    return "Selected hotel";
  }
}

function extractDatesFromUrl(input = "") {
  try {
    const url = new URL(input);
    const p = url.searchParams;

    const checkin =
      p.get("checkin") ||
      p.get("checkIn") ||
      p.get("depart") ||
      p.get("departureDate") ||
      p.get("outboundDate");

    const checkout =
      p.get("checkout") ||
      p.get("checkOut") ||
      p.get("return") ||
      p.get("returnDate") ||
      p.get("inboundDate");

    if (checkin && checkout) return `${checkin} - ${checkout}`;
    return "";
  } catch {
    return "";
  }
}

function extractRouteFromUrl(input = "") {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();

    if (host.includes("flights.booking.com")) return "Flight selected via Booking.com";
    if (host.includes("ryanair")) return "Ryanair flight";
    if (host.includes("wizzair")) return "Wizz Air flight";
    if (host.includes("google")) return "Google Flights route";

    const p = url.searchParams;
    const from = p.get("from") || p.get("origin") || p.get("departure") || p.get("src");
    const to = p.get("to") || p.get("destination") || p.get("arrival") || p.get("dst");

    if (from && to) return `${cleanSlug(from).toUpperCase()} → ${cleanSlug(to).toUpperCase()}`;
    return "Imported flight route";
  } catch {
    return "Imported flight route";
  }
}

function createValidity(validForDays, customValidUntil) {
  if (customValidUntil) {
    const d = new Date(customValidUntil);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const days = Math.max(1, toNumber(validForDays, 1));
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function getFlights(offer) {
  return safeArray(offer.flights).length ? safeArray(offer.flights) : safeArray(offer.flightOptions);
}

function getHotels(offer) {
  return safeArray(offer.hotels).length ? safeArray(offer.hotels) : safeArray(offer.hotelOptions);
}

function getFlightPriceFromOffer(offer) {
  if (toNumber(offer.flightPrice, 0) > 0) return toNumber(offer.flightPrice, 0);
  return getFlights(offer).reduce((sum, f) => sum + toNumber(f.price, 0), 0);
}

function getHotelPriceFromOffer(offer) {
  if (toNumber(offer.hotelPrice, 0) > 0) return toNumber(offer.hotelPrice, 0);
  return getHotels(offer).reduce((sum, h) => sum + toNumber(h.price, 0), 0);
}

function normalizeOffer(body = {}) {
  const flightPrice = toNumber(body.flightPrice, 0);
  const hotelPrice = toNumber(body.hotelPrice, 0);
  const transferPrice = toNumber(body.transferPrice, 0);

  const basePrice = flightPrice + hotelPrice + transferPrice;
  const markupPercent = toNumber(body.markupPercent, 0);

  const finalOverride = body.finalPrice === "" || body.finalPrice == null
    ? 0
    : toNumber(body.finalPrice, 0);

  const finalPrice = finalOverride > 0
    ? finalOverride
    : basePrice + basePrice * (markupPercent / 100);

  const margin = finalPrice - basePrice;

  const hotelImages = safeArray(body.hotelImages)
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => x.trim())
    .filter((x) => x.startsWith("http"))
    .slice(0, 6);

  const flights = [
    {
      airline: body.flightAirline || "",
      route: body.flightRoute || "",
      departure: body.flightDeparture || "",
      arrival: body.flightArrival || "",
      baggage: body.flightBaggage || "",
      notes: body.flightNotes || "",
      price: flightPrice
    }
  ].filter((f) =>
    f.airline ||
    f.route ||
    f.departure ||
    f.arrival ||
    f.baggage ||
    f.notes ||
    toNumber(f.price, 0) > 0
  );

  const hotels = [
    {
      name: body.hotelName || "",
      stars: body.hotelStars || "",
      area: body.hotelArea || "",
      distance: body.hotelDistance || "",
      room: body.hotelRoom || "",
      meal: body.hotelMeal || "",
      price: hotelPrice,
      roomsLeft: body.hotelRoomsLeft || "",
      description: body.hotelDescription || "",
      images: hotelImages
    }
  ].filter((h) =>
    h.name ||
    h.stars ||
    h.area ||
    h.distance ||
    h.room ||
    h.meal ||
    toNumber(h.price, 0) > 0 ||
    h.roomsLeft ||
    h.description ||
    h.images.length
  );

  return {
    id: body.id || uid(),
    clientName: body.clientName || "",
    clientPhone: body.clientPhone || "",
    destination: body.destination || "",
    travelDates: body.travelDates || "",
    guests: body.guests || "",
    status: String(body.status || "draft").toLowerCase(),
    currency: body.currency || "EUR",
    notes: body.notes || "",
    destinationDescription: body.destinationDescription || "",
    flightRoute: body.flightRoute || "",
    hotel: body.hotelName || "",
    flightPrice: Number(flightPrice.toFixed(2)),
    hotelPrice: Number(hotelPrice.toFixed(2)),
    transferPrice: Number(transferPrice.toFixed(2)),
    basePrice: Number(basePrice.toFixed(2)),
    markupPercent: Number(markupPercent.toFixed(2)),
    finalPrice: Number(finalPrice.toFixed(2)),
    margin: Number(margin.toFixed(2)),
    validUntil: createValidity(body.validForDays, body.customValidUntil),
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientViewed: Boolean(body.clientViewed),
    bookedAt: body.bookedAt || null,
    clicks: toNumber(body.clicks, 0),
    flights,
    hotels
  };
}

function summarizeStats(offers) {
  const totalOffers = offers.length;
  const activeOffers = offers.filter((o) =>
    ["draft", "sent", "viewed"].includes(String(o.status || "").toLowerCase())
  ).length;

  const revenuePotential = offers.reduce((sum, o) => sum + toNumber(o.finalPrice || o.price, 0), 0);
  const marginPotential = offers.reduce((sum, o) => sum + toNumber(o.margin || o.marginAmount, 0), 0);

  const bookedRevenue = offers
    .filter((o) => String(o.status || "").toLowerCase() === "booked")
    .reduce((sum, o) => sum + toNumber(o.finalPrice || o.price, 0), 0);

  const lostRevenue = offers
    .filter((o) => ["cancelled", "lost", "expired"].includes(String(o.status || "").toLowerCase()))
    .reduce((sum, o) => sum + toNumber(o.finalPrice || o.price, 0), 0);

  return {
    totalOffers,
    activeOffers,
    revenuePotential: Number(revenuePotential.toFixed(2)),
    marginPotential: Number(marginPotential.toFixed(2)),
    bookedRevenue: Number(bookedRevenue.toFixed(2)),
    lostRevenue: Number(lostRevenue.toFixed(2))
  };
}

function extractJsonObject(text = "") {
  let cleaned = String(text || "").trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first !== -1 && last !== -1) cleaned = cleaned.slice(first, last + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    return {};
  }
}

async function callVisionJson({ imageBuffer, mimeType, prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing OPENAI_API_KEY in .env.local");
    err.status = 500;
    throw err;
  }

  const base64Image = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: base64Image }
          ]
        }
      ]
    })
  });

  const raw = await response.json();

  if (!response.ok) {
    const err = new Error(raw?.error?.message || "Vision API request failed");
    err.status = response.status;
    err.details = raw;
    throw err;
  }

  const outputText =
    raw?.output?.[0]?.content?.find((c) => c.type === "output_text")?.text ||
    raw?.output?.flatMap((o) => o.content || [])?.find((c) => c.type === "output_text")?.text ||
    "{}";

  return extractJsonObject(outputText);
}

function renderOfferHtml(offer, { forPdf = false } = {}) {
  const clientLink = `${LIVE_BASE_URL}/api/offers/view/${offer.id}`;
  const pdfLink = `${LIVE_BASE_URL}/api/offers/${offer.id}/pdf`;
  const whatsappLink = `https://wa.me/${offer.clientPhone || ""}?text=Вашата оферта:%0A${clientLink}`;

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function clean(t) {
    return String(t || "")
      .replace(/Genius.*?\./gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const autoImages = {
    tokyo: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
    paris: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34",
    bali: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
    bari: "https://images.unsplash.com/photo-1533105079780-92b9be482077"
  };

  const destinationKey = String(offer.destination || "")
    .toLowerCase()
    .split(",")[0]
    .trim();

  const heroImage =
    offer.destinationImage ||
    autoImages[destinationKey] ||
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee";

  const flights = arr(offer.flights);
  const hotels = arr(offer.hotels);

  const includedHtml = `
    ${flights.length ? `<div>✈ Полет включен</div>` : ""}
    ${hotels.length ? `<div>🏨 Хотел включен</div>` : ""}
  `;

  const flightCards = flights.map(f => {
  const routeText = clean(f.route || "");
  const segments = routeText
    .split("/")
    .map(x => x.trim())
    .filter(Boolean);

  const segmentHtml = segments.length
    ? segments.map((segment, index) => `
        <div class="route-segment">
          <div class="segment-number">${index + 1}</div>
          <div>
            <strong>${escapeHtml(segment)}</strong>
            <div class="segment-note">
              ${index === 0 ? "Outbound route" : "Return route"}
            </div>
          </div>
        </div>
      `).join("")
    : `<p><strong>Маршрут:</strong> ${escapeHtml(f.route || "-")}</p>`;

  return `
    <div class="card">
      <h3>${escapeHtml(f.airline || "Полет")}</h3>

      <div class="route-box">
        ${segmentHtml}
      </div>

      <p><strong>Отпътуване:</strong> ${escapeHtml(f.departure || "-")}</p>
      <p><strong>Пристигане:</strong> ${escapeHtml(f.arrival || "-")}</p>
      <p><strong>Багаж:</strong> ${escapeHtml(f.baggage || "-")}</p>
      <p><strong>Бележки:</strong> ${escapeHtml(f.notes || "-")}</p>

      <div class="airport-warning">
        <strong>Важно:</strong> Препоръчваме да бъдете на летището минимум
        <strong>2 часа преди излитане</strong>. За международни полети и периоди с натоварен трафик е добре да предвидите допълнително време.
      </div>
    </div>
  `;
}).join("");

  const hotelCards = hotels.map(h => {
    const images = arr(h.images)
      .filter(Boolean)
      .slice(0, 3)
      .map(src => `<img src="${escapeAttr(src)}" />`)
      .join("");

    return `
      <div class="card hotel-card">
        ${images ? `<div class="hotel-images">${images}</div>` : ""}

        <h3>${escapeHtml(clean(h.name || "Хотел"))}</h3>

        <div class="hotel-grid">
          <div><strong>Стая:</strong><br>${escapeHtml(clean(h.room || "-"))}</div>
          <div><strong>Изхранване:</strong><br>${escapeHtml(clean(h.meal || "-"))}</div>
          <div><strong>Локация:</strong><br>${escapeHtml(clean(h.area || offer.destination || "-"))}</div>
          <div><strong>Наличност:</strong><br>${escapeHtml(clean(h.roomsLeft || "-"))}</div>
        </div>

        <p class="hotel-description">
          ${escapeHtml(clean(h.description || `Стилен хотел в ${offer.destination} с отлична локация и удобства.`))}
        </p>

        <p class="hotel-benefits">
          ✔ Отлична локация<br>
          ✔ Удобен достъп до транспорт<br>
          ✔ Подходящ за комфортен престой
        </p>
      </div>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(offer.destination || "Travel Offer")}</title>

<style>
* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #f4f5f7;
  color: #111827;
}

.wrap {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px;
}

/* COVER */
.hero {
  position: relative;
  min-height: 760px;
  border-radius: 24px;
  overflow: hidden;
  color: white;
  padding: 56px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background: #111827;
}

.hero-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0,0,0,0.15) 0%,
    rgba(0,0,0,0.55) 55%,
    rgba(0,0,0,0.78) 100%
  );
}

.hero-content {
  position: relative;
  z-index: 2;
  max-width: 720px;
}

.eyebrow {
  font-size: 13px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  opacity: 0.9;
  margin-bottom: 10px;
}

.hero h1 {
  font-size: 64px;
  line-height: 1;
  margin: 0 0 18px;
}

.destination-text {
  font-size: 18px;
  line-height: 1.55;
  max-width: 650px;
  margin: 0 0 22px;
}

.hero-info {
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
  font-size: 16px;
  margin-bottom: 18px;
}

.price {
  font-size: 58px;
  font-weight: 800;
  margin: 18px 0 12px;
}

.included {
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 16px;
}

.badges {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.badges span {
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.22);
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 13px;
}

.actions {
  margin-top: 22px;
}

.actions a {
  display: inline-block;
  background: #111827;
  color: white;
  padding: 12px 16px;
  border-radius: 10px;
  text-decoration: none;
  margin-right: 10px;
}

/* SECTIONS */
.section-page {
  margin-top: 34px;
}

h2 {
  font-size: 34px;
  margin: 0 0 22px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 22px;
}

.card {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 26px rgba(0,0,0,0.08);
  break-inside: avoid;
  page-break-inside: avoid;
}

.card h3 {
  font-size: 26px;
  margin: 0 0 16px;
}

.card p {
  font-size: 17px;
  line-height: 1.45;
}

.route-box {
  margin: 18px 0;
  display: grid;
  gap: 12px;
}

.route-segment {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 14px;
}

.segment-number {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: #111827;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex: 0 0 auto;
}

.segment-note {
  color: #6b7280;
  font-size: 14px;
  margin-top: 4px;
}

.airport-warning {
  margin-top: 20px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  border-radius: 14px;
  padding: 16px;
  line-height: 1.5;
  font-size: 15px;
}

.hotel-card {
  grid-column: 1 / -1;
}

.hotel-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}

.hotel-images img {
  width: 100%;
  height: 210px;
  object-fit: cover;
  border-radius: 16px;
}

.hotel-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
  margin-top: 16px;
  font-size: 17px;
}

.hotel-description {
  margin-top: 20px;
  color: #374151;
}

.hotel-benefits {
  font-weight: 700;
  color: #111827;
}

/* PRINT MODE */
@media print {
  body {
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .wrap {
    max-width: none;
    padding: 0;
  }

  .actions {
    display: none !important;
  }

  .hero {
    min-height: 96vh;
    border-radius: 0;
    page-break-after: always;
    break-after: page;
  }

  .section-page {
    page-break-before: always;
    break-before: page;
    margin-top: 0;
    padding: 12mm 0 0;
  }

  .card {
    box-shadow: none;
    border: 1px solid #e5e7eb;
  }

  .grid {
    grid-template-columns: 1fr;
  }

  .hotel-images img {
    height: 170px;
  }
}

@page {
  size: A4;
  margin: 12mm;
}
</style>
</head>

<body>
<div class="wrap">

  <div class="hero">
    <img class="hero-bg" src="${escapeAttr(heroImage)}" />
    <div class="hero-overlay"></div>

    <div class="hero-content">
      <div class="eyebrow">AYA - Travel Offer Sales System · Premium Offer</div>

      <h1>${escapeHtml(offer.destination || "Travel Offer")}</h1>

      <p class="destination-text">
        ${escapeHtml(
          clean(
            offer.destinationDescription ||
            `Открийте магията на ${offer.destination} – премиум пътуване с внимателно подбран хотел, удобен полет и ясна крайна цена.`
          )
        )}
      </p>

      <div class="hero-info">
        <div><strong>Период:</strong> ${escapeHtml(offer.travelDates || "-")}</div>
        <div><strong>Гости:</strong> ${escapeHtml(offer.guests || "-")}</div>
      </div>

      <div class="price">${formatMoney(offer.finalPrice, offer.currency)}</div>

      <div class="included">${includedHtml}</div>

      <div class="badges">
        ${flights.length ? `<span>✈ Полет</span>` : ""}
        ${hotels.length ? `<span>🏨 Подбран хотел</span>` : ""}
        <span>⏱ Валидна оферта</span>
        <span>💎 Премиум подбор</span>
      </div>

      ${
        forPdf
          ? ""
          : `
          <div class="actions">
            <a href="${pdfLink}" target="_blank">PDF</a>
            <a href="${whatsappLink}" target="_blank">WhatsApp</a>
          </div>
        `
      }
    </div>
  </div>

  <div class="section-page">
  <h2>Преживявания в Токио</h2>

  <div class="card">

    <ul>
      <li>Shibuya Crossing – най-известното кръстовище в света</li>
      <li>Tokyo Skytree – панорамни гледки над града </li>
      <li>Asakusa – традиционни храмове и култура</li>
      <li>Ginza – луксозен shopping район</li>
      <li>Японска кухня – sushi, ramen и fine dining</li>
    </ul>
  </div>
</div>

    <h2>Полети</h2>
    <div class="grid">
      ${flightCards || `<div class="card">Няма добавени полети.</div>`}
    </div>
  </div>

  <div class="section-page">
    <h2>Хотели</h2>
    <div class="grid">
      ${hotelCards || `<div class="card">Няма добавени хотели.</div>`}
    </div>
  </div>

<h2>Готови ли сте да резервирате това пътуване?</h2>

    <p>
      Тази оферта е подбрана специално за Вас и е с ограничена наличност.
    </p>

    <p><strong>Местата са ограничени и цените подлежат на промяна!</strong></p>
 
<p><strong>За резервация свържете се с нас:</strong></p>

    <p>Биляна Билбилова-Терзиева</p>
<p><strong>+359 885 07 89 80</strong></p>

  </div>
</div>

</div>
</body>
</html>
`;
}
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "2L1P Neural Travel", port: PORT, liveBaseUrl: LIVE_BASE_URL });
});

app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));

app.get("/offer/:id", (req, res) => {
  res.redirect(`/api/offers/view/${req.params.id}`);
});

app.get("/api/offers", (req, res) => {
  const db = readDb();
  const offers = [...db.offers].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ offers });
});

app.get("/api/offers/stats/summary", (req, res) => {
  const db = readDb();
  res.json(summarizeStats(db.offers));
});

app.get("/api/offers/:id", (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  res.json({ offer });
});

app.post("/api/offers", (req, res) => {
  const db = readDb();
  const offer = normalizeOffer(req.body);
  db.offers.unshift(offer);
  writeDb(db);

  res.json({
    success: true,
    offer,
    clientLink: `${LIVE_BASE_URL}/api/offers/view/${offer.id}`,
    publicLink: `${LIVE_BASE_URL}/offer/${offer.id}`,
    pdfLink: `${LIVE_BASE_URL}/api/offers/${offer.id}/pdf`
  });
});

app.patch("/api/offers/:id/status", (req, res) => {
  const db = readDb();
  const index = db.offers.findIndex((o) => o.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Offer not found" });

  db.offers[index].status = String(req.body.status || "draft").toLowerCase();
  db.offers[index].updatedAt = new Date().toISOString();

  if (db.offers[index].status === "booked") db.offers[index].bookedAt = new Date().toISOString();

  writeDb(db);
  res.json({ success: true, offer: db.offers[index] });
});

app.post("/api/offers/:id/click", (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  offer.clicks = toNumber(offer.clicks, 0) + 1;
  offer.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json({ success: true, clicks: offer.clicks });
});

app.post("/api/offers/:id/book", (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  offer.status = "booked";
  offer.bookedAt = new Date().toISOString();
  offer.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json({ success: true, offer });
});

app.post("/api/import", (req, res) => {
  const { flightUrl = "", hotelUrl = "" } = req.body || {};

  const flight = flightUrl
    ? {
        route: extractRouteFromUrl(flightUrl),
        dates: extractDatesFromUrl(flightUrl),
        airline: flightUrl.includes("ryanair")
          ? "Ryanair"
          : flightUrl.includes("wizzair")
          ? "Wizz Air"
          : flightUrl.includes("flights.booking.com")
          ? "Booking.com Flights"
          : flightUrl.includes("google")
          ? "Google Flights"
          : "Imported airline"
      }
    : null;

  const hotel = hotelUrl
    ? { name: extractHotelNameFromUrl(hotelUrl) }
    : null;

  res.json({ success: true, flight, hotel });
});

app.get("/api/offers/view/:id", (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).send("Offer not found");

  offer.clientViewed = true;
  offer.updatedAt = new Date().toISOString();
  if (offer.status === "sent") offer.status = "viewed";
  writeDb(db);

  res.setHeader("Content-Type", "text/html; charset=UTF-8");
  res.send(renderOfferHtml(offer));
});

app.get("/api/offers/:id/pdf", async (req, res) => {
  const db = readDb();
  const offer = db.offers.find((o) => o.id === req.params.id);
  if (!offer) return res.status(404).send("Offer not found");

  const html = renderOfferHtml(offer, { forPdf: true });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1800 });

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${offer.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "PDF generation failed", details: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.post("/api/import-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const parsed = await callVisionJson({
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype || "image/png",
      prompt: `
You are reading a flight booking screenshot.
Return ONLY strict JSON:
{
  "airline": "",
  "route": "",
  "departure": "",
  "arrival": "",
  "price": 0,
  "currency": "EUR",
  "baggage": "",
  "notes": ""
}
Rules:
- price must be numeric only
- route should be like "SOF → BRI / BRI → SOF"
- if not visible, use empty string or 0
`
    });

    res.json({
      success: true,
      flight: {
        airline: String(parsed.airline || "").trim(),
        route: String(parsed.route || "").trim(),
        departure: String(parsed.departure || "").trim(),
        arrival: String(parsed.arrival || "").trim(),
        price: toNumber(parsed.price, 0),
        currency: String(parsed.currency || "EUR").trim() || "EUR",
        baggage: String(parsed.baggage || "").trim(),
        notes: String(parsed.notes || "Imported via AI").trim()
      }
    });
  } catch (err) {
    console.error("IMPORT FLIGHT IMAGE ERROR:", err);
    res.status(err.status || 500).json({
      error: "Flight import failed",
      details: err.details || err.message
    });
  }
});

app.post("/api/import-hotel-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const parsed = await callVisionJson({
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype || "image/png",
      prompt: `
You are reading a hotel booking screenshot.
Return ONLY strict JSON:
{
  "name": "",
  "stars": "",
  "area": "",
  "distance": "",
  "room": "",
  "meal": "",
  "price": 0,
  "currency": "EUR",
  "roomsLeft": "",
  "description": ""
}
Rules:
- price must be numeric only
- description should be short and client-friendly, based only on visible info
- if not visible, use empty string or 0
`
    });

    res.json({
      success: true,
      hotel: {
        name: String(parsed.name || "").trim(),
        stars: String(parsed.stars || "").trim(),
        area: String(parsed.area || "").trim(),
        distance: String(parsed.distance || "").trim(),
        room: String(parsed.room || "").trim(),
        meal: String(parsed.meal || "").trim(),
        price: toNumber(parsed.price, 0),
        currency: String(parsed.currency || "EUR").trim() || "EUR",
        roomsLeft: String(parsed.roomsLeft || "").trim(),
        description: String(parsed.description || "").trim()
      }
    });
  } catch (err) {
    console.error("IMPORT HOTEL IMAGE ERROR:", err);
    res.status(err.status || 500).json({
      error: "Hotel import failed",
      details: err.details || err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 2L1P Neural Travel running on http://localhost:${PORT}`);
  console.log(`🏠 Admin: http://localhost:${PORT}/admin`);
});
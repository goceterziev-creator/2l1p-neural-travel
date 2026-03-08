const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const DB_PATH = path.join(__dirname, "../DATABASE/database.json");

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    return { offers: [] };
  }

  const raw = fs.readFileSync(DB_PATH, "utf8").trim();
  if (!raw) return { offers: [] };

  const db = JSON.parse(raw);
  if (!Array.isArray(db.offers)) db.offers = [];
  return db;
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function generateId() {
  return "OFF-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getEffectiveStatus(offer) {
  if (!offer.validUntil) return offer.status || "draft";

  const now = Date.now();
  const validUntil = new Date(offer.validUntil).getTime();

  if (
    Number.isFinite(validUntil) &&
    validUntil < now &&
    !["booked", "cancelled", "lost"].includes(offer.status)
  ) {
    return "expired";
  }

  return offer.status || "draft";
}
function scoreOffer(offer) {
  const now = Date.now();
  const validUntilTs = offer.validUntil ? new Date(offer.validUntil).getTime() : null;
  const hoursLeft =
    Number.isFinite(validUntilTs) ? (validUntilTs - now) / (1000 * 60 * 60) : null;

  let dealScore = 0;
  let urgencyScore = 0;
  let profitScore = 0;

  const price = toNumber(offer.price);
  const basePrice = toNumber(offer.basePrice);
  const margin = price - basePrice;

  if (offer.clientViewed) dealScore += 30;
  if (offer.status === "viewed") dealScore += 20;
  if (offer.status === "sent") dealScore += 10;
  if (offer.status === "draft") dealScore += 5;

  if (margin >= 500) profitScore += 95;
  else if (margin >= 200) profitScore += 75;
  else if (margin >= 100) profitScore += 55;
  else if (margin >= 30) profitScore += 35;
  else profitScore += 15;

  if (price >= 5000) dealScore += 20;
  else if (price >= 1500) dealScore += 10;

  if (hoursLeft !== null) {
    if (hoursLeft <= 6) urgencyScore += 95;
    else if (hoursLeft <= 24) urgencyScore += 80;
    else if (hoursLeft <= 48) urgencyScore += 60;
    else if (hoursLeft <= 96) urgencyScore += 35;
    else urgencyScore += 10;
  }

  if (offer.followUpDate) {
    const followUpTs = new Date(offer.followUpDate).getTime();
    if (Number.isFinite(followUpTs) && followUpTs <= now) urgencyScore += 25;
  }

  if (["booked", "cancelled", "lost"].includes(offer.status)) {
    dealScore = 0;
    urgencyScore = 0;
  }

  dealScore = Math.min(100, dealScore);
  urgencyScore = Math.min(100, urgencyScore);
  profitScore = Math.min(100, profitScore);

  let clientTemperature = "cold";
  if (dealScore >= 70) clientTemperature = "hot";
  else if (dealScore >= 40) clientTemperature = "warm";

  let nextAction = "Monitor";
  if (offer.status === "draft") nextAction = "Send offer";
  if (offer.status === "sent") nextAction = "Follow up";
  if (offer.status === "viewed") nextAction = "Call client";
  if (urgencyScore >= 80) nextAction = "Urgent follow-up";
  if (offer.followUpDate && new Date(offer.followUpDate).getTime() <= now) {
    nextAction = "Follow-up due now";
  }

  return {
    dealScore,
    urgencyScore,
    profitScore,
    clientTemperature,
    nextAction
  };
}


router.get("/", (req, res) => {
  const db = readDB();
  const offers = db.offers
  .map((offer) => ({
    ...offer,
    effectiveStatus: getEffectiveStatus(offer),
    ...scoreOffer(offer)
  }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ offers });
});

router.get("/hot-deals", (req, res) => {
  const db = readDB();

  const enriched = db.offers
    .map((offer) => ({
      ...offer,
      effectiveStatus: getEffectiveStatus(offer),
      ...scoreOffer(offer)
    }))
    .filter((offer) => !["booked", "cancelled", "lost"].includes(offer.status));

  const hotDeals = [...enriched]
    .sort((a, b) => (b.dealScore + b.urgencyScore + b.profitScore) - (a.dealScore + a.urgencyScore + a.profitScore))
    .slice(0, 5);

  const expiringSoon = [...enriched]
    .filter((o) => o.validUntil)
    .sort((a, b) => new Date(a.validUntil) - new Date(b.validUntil))
    .slice(0, 5);

  const highMargin = [...enriched]
    .sort((a, b) => (toNumber(b.price) - toNumber(b.basePrice)) - (toNumber(a.price) - toNumber(a.basePrice)))
    .slice(0, 5);

  const followUpRequired = [...enriched]
    .filter((o) => o.followUpDate || o.status === "viewed" || o.status === "sent")
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, 5);

  res.json({
    hotDeals,
    expiringSoon,
    highMargin,
    followUpRequired
  });
});
router.get("/:id/pdf", (req, res) => {
  const db = readDB();
  const offer = db.offers.find((o) => o.id === req.params.id);

  if (!offer) {
    return res.status(404).send("Offer not found");
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>${offer.id}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
        h1 { margin-bottom: 24px; }
        .price { font-size: 28px; font-weight: bold; margin: 20px 0; }
        .row { margin: 8px 0; }
      </style>
    </head>
    <body>
      <h1>2L1P Neural Travel</h1>
      <div class="row"><b>Client:</b> ${offer.clientName || "TBA"}</div>
      <div class="row"><b>Destination:</b> ${offer.destination || "TBA"}</div>
      <div class="row"><b>Flights:</b> ${offer.flightRoute || "TBA"}</div>
      <div class="row"><b>Hotel:</b> ${offer.hotel || "TBA"}</div>
      <div class="row"><b>Guests:</b> ${offer.guests || "TBA"}</div>
      <div class="row"><b>Dates:</b> ${offer.travelDates || "TBA"}</div>
      <div class="price">${toNumber(offer.price).toFixed(2)} ${offer.currency || "EUR"}</div>
      <div class="row"><b>Status:</b> ${offer.status || "draft"}</div>
      <div class="row"><b>Valid until:</b> ${offer.validUntil || "-"}</div>
      <div class="row"><b>Offer ID:</b> ${offer.id}</div>
      <div class="row"><b>Notes:</b> ${offer.notes || "-"}</div>
      <div class="row"><b>Follow-up:</b> ${offer.followUpDate || "-"}</div>
    </body>
    </html>
  `);
});

router.get("/:id", (req, res) => {
  const db = readDB();
  const offer = db.offers.find((o) => o.id === req.params.id);

  if (!offer) {
    return res.status(404).json({ error: "Offer not found" });
  }

  if (!offer.clientViewed) {
    offer.clientViewed = true;
    if (!["booked", "cancelled", "lost"].includes(offer.status)) {
      offer.status = "viewed";
    }
    offer.updatedAt = new Date().toISOString();
    writeDB(db);
  }

  res.json({
    ...offer,
    effectiveStatus: getEffectiveStatus(offer)
  });
});

router.post("/", (req, res) => {
  const db = readDB();
  const body = req.body || {};

  if (!body.destination || String(body.destination).trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Destination is required"
    });
  }

  const basePrice = toNumber(body.basePrice);
  const markupPercent = toNumber(body.markupPercent);
  const customFinalPrice =
    body.price !== "" && body.price != null ? toNumber(body.price) : null;

  const finalPrice =
    customFinalPrice !== null
      ? customFinalPrice
      : +(basePrice * (1 + markupPercent / 100)).toFixed(2);

  const marginAmount = +(finalPrice - basePrice).toFixed(2);

  const now = new Date();
  let validUntil;

  if (body.customValidUntil && String(body.customValidUntil).trim() !== "") {
    validUntil = new Date(body.customValidUntil).toISOString();
  } else {
    const validForDays = Math.max(1, parseInt(body.validForDays || "1", 10));
    validUntil = new Date(
      now.getTime() + validForDays * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  const offer = {
    id: generateId(),
    clientName: body.clientName || "",
    clientPhone: body.clientPhone || "",
    destination: body.destination || "",
    flightRoute: body.flightRoute || "",
    hotel: body.hotel || "",
    travelDates: body.travelDates || "",
    guests: body.guests || "",
    basePrice,
    markupPercent,
    price: finalPrice,
    marginAmount,
    currency: body.currency || "EUR",
    status: body.status || "draft",
    createdAt: now.toISOString(),
    validUntil,
    notes: body.notes || "",
    followUpDate: body.followUpDate || null,
    bookedAt: null,
    lostAt: null,
    clientViewed: false
  };

  db.offers.unshift(offer);
  writeDB(db);

  res.status(201).json({
    success: true,
    offer
  });
});

router.patch("/:id/status", (req, res) => {
  const db = readDB();
  const offer = db.offers.find((o) => o.id === req.params.id);

  if (!offer) {
    return res.status(404).json({
      success: false,
      message: "Offer not found"
    });
  }

  offer.status = req.body.status || offer.status;
  offer.updatedAt = new Date().toISOString();

  if (offer.status === "booked" && !offer.bookedAt) {
    offer.bookedAt = new Date().toISOString();
  }

  if (offer.status === "lost" && !offer.lostAt) {
    offer.lostAt = new Date().toISOString();
  }

  writeDB(db);

  res.json({
    success: true,
    offer
  });
});

module.exports = router;
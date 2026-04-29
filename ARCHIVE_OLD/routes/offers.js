const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const DB_PATH = path.join(__dirname, "..", "DATABASE", "database.json");

// ================= LOAD =================
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return { offers: [] };
  }
}

// ================= SAVE =================
function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// ================= CLEAN =================
function cleanText(str) {
  if (!str) return "";
  return str.replace(/[^\x00-\x7Fа-яА-Я0-9 .,:\-]/g, "").trim();
}

// ================= CREATE OFFER =================
router.post("/", (req, res) => {
  const db = loadDB();
  const body = req.body;

  const flightPrice = Number(body.flightPrice || 0);
  const hotelPrice = Number(body.hotelPrice || 0);
  const transferPrice = Number(body.transferPrice || 0);

  const basePrice = flightPrice + hotelPrice + transferPrice;
  const markup = Number(body.markupPercent || 0);

  const finalPrice =
    body.finalPrice && Number(body.finalPrice) > 0
      ? Number(body.finalPrice)
      : basePrice * (1 + markup / 100);

  const offer = {
    id: "OFF-" + Date.now(),
    clientName: cleanText(body.clientName),
    clientPhone: body.clientPhone,
    destination: cleanText(body.destination),
    travelDates: body.travelDates,
    guests: body.guests,
    status: body.status || "draft",
    currency: body.currency || "EUR",

    // PRICING
    flightPrice,
    hotelPrice,
    transferPrice,
    basePrice,
    markupPercent: markup,
    finalPrice: Number(finalPrice.toFixed(2)),

    notes: body.notes || "",
    createdAt: new Date().toISOString(),
    validUntil: body.validUntil || null,

    // SUPPORT BOTH FORMATS
    flights: body.flights || [],
    hotels: body.hotels || [],
  };

  db.offers.unshift(offer);
  saveDB(db);

  res.json({ success: true, offer });
});

// ================= GET ALL =================
router.get("/", (req, res) => {
  const db = loadDB();
  res.json(db);
});

// ================= GET SINGLE =================
router.get("/:id", (req, res) => {
  const db = loadDB();
  const offer = db.offers.find((o) => o.id === req.params.id);
  res.json(offer || null);
});

module.exports = router;
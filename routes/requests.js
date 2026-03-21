const express = require("express");
const router = express.Router();
const path = require("path");

const { readJson, writeJson } = require("../utils/jsonDb");
const { buildTravelPlan } = require("../services/travelBrain");
const { searchFlights } = require("../services/flights");
const { searchHotel } = require("../services/hotels");
const { calculatePrice } = require("../services/pricing");

const REQUEST_DB = path.join(__dirname, "..", "DATABASE", "requests.json");
const OFFER_DB = path.join(__dirname, "..", "DATABASE", "database.json");

router.get("/", (req, res) => {
  const db = readJson(REQUEST_DB, { requests: [] });
  res.json(db);
});

router.post("/", (req, res) => {
  const db = readJson(REQUEST_DB, { requests: [] });

  const r = {
    id: "REQ-" + Date.now(),
    name: req.body.name || "Unknown Client",
    phone: req.body.phone || "",
    destination: req.body.destination || "",
    from: req.body.from || "Sofia",
    dates: req.body.dates || "",
    guests: req.body.guests || 2,
    budget: Number(req.body.budget || 0),
    status: "new",
    createdAt: new Date().toISOString()
  };

  db.requests.unshift(r);
  writeJson(REQUEST_DB, db);

  res.json({ success: true, request: r });
});

router.post("/:id/generate-offer", (req, res) => {
  const requestsDb = readJson(REQUEST_DB, { requests: [] });
  const offersDb = readJson(OFFER_DB, { offers: [] });

  const r = requestsDb.requests.find((x) => x.id === req.params.id);

  if (!r) {
    return res.status(404).json({
      success: false,
      error: "Request not found"
    });
  }

  const plan = buildTravelPlan(r);
  const flight = searchFlights(plan);
  const hotel = searchHotel(plan);
  const pricing = calculatePrice(flight, hotel);

  const offer = {
    id: "OFF-" + Date.now(),
    clientName: r.name,
    clientPhone: r.phone,
    destination: r.destination,
    flightRoute: flight.route,
    hotel: hotel.hotel,
    travelDates: r.dates,
    guests: r.guests + " adults",
    basePrice: pricing.base,
    markupPercent: 5,
    markupPct: 5,
    price: pricing.final,
    finalPrice: pricing.final,
    marginAmount: pricing.margin,
    margin: pricing.margin,
    currency: "EUR",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    notes: "Generated from request " + r.id,
    followUpDate: null,
    bookedAt: null,
    lostAt: null,
    cancelledAt: null,
    clientViewed: false,
    viewedAt: null,
    clicks: 0
  };

  offersDb.offers = offersDb.offers || [];
  offersDb.offers.unshift(offer);
  writeJson(OFFER_DB, offersDb);

  r.status = "generated";
  r.generatedOfferId = offer.id;
  r.generatedAt = new Date().toISOString();
  r.generatedOfferId = offer.id;
  writeJson(REQUEST_DB, requestsDb);

  res.json({ success: true, offer });
});

module.exports = router;
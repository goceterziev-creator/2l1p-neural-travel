const fs = require("fs");
const path = require("path");
const express = require("express");
const router = express.Router();

const { generateOffer, saveGeneratedOffer } = require("../generateOffer");
const { readJson, writeJson } = require("../utils/jsonDb");

const OFFER_DB = path.join(__dirname, "..", "DATABASE", "database.json");
const GENERATED_OFFERS_DIR = path.join(__dirname, "..", "generated-offers");

function getOfferById(id) {
  const db = readJson(OFFER_DB, { offers: [] });
  const offers = Array.isArray(db.offers) ? db.offers : [];
  const offer = offers.find((x) => x.id === id);
  return { db, offers, offer };
}

router.post("/generate", async (req, res) => {
  try {
    const result = generateOffer(req.body, {
      clientBaseUrl: "https://https://twol1p-neural-travel-1.onrender.com/api/offers/view"
    });

    const saved = await saveGeneratedOffer(result, GENERATED_OFFERS_DIR);

    const db = readJson(OFFER_DB, { offers: [] });
    const offers = Array.isArray(db.offers) ? db.offers : [];

    const premiumPrice = result.offer.packages?.[0]?.price || 0;
    const luxuryPrice = result.offer.packages?.[1]?.price || premiumPrice || 0;

    const offerRecord = {
      id: result.offer.id,
      clientName: req.body.clientName || "Generated Client",
      clientPhone: req.body.contactPhone || req.body.clientPhone || "",
      destination: result.offer.destination,
      flightRoute:
        req.body.flightRoute ||
        `${result.offer.departureAirport} → ${result.offer.destination}`,
      hotel: req.body.hotel || result.offer.hotelZones?.[0] || "-",
      travelDates: result.offer.datesLabel,
      guests: result.offer.travelersLabel,
      status: "draft",
      basePrice: premiumPrice,
      finalPrice: luxuryPrice,
      price: luxuryPrice,
      currency: result.offer.currency || "EUR",
      margin: luxuryPrice - premiumPrice,
      validUntil: result.offer.validUntil,
      notes:
        req.body.notes ||
        `Generated via Offer Engine for ${result.offer.destination}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const existingIndex = offers.findIndex((x) => x.id === offerRecord.id);
    if (existingIndex >= 0) {
      offers[existingIndex] = offerRecord;
    } else {
      offers.unshift(offerRecord);
    }

    db.offers = offers;
    writeJson(OFFER_DB, db);

    res.json({
      success: true,
      offer: result.offer,
      clientUrl: result.clientUrl,
      whatsappText: result.whatsappText,
      files: saved
    });
  } catch (error) {
    console.error("Generate offer error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get("/view/:id", (req, res) => {
  try {
    const filePath = path.join(GENERATED_OFFERS_DIR, `${req.params.id}.html`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Offer not found");
    }

    const html = fs.readFileSync(filePath, "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    console.error("View offer error:", error);
    res.status(500).send("Server error");
  }
});

router.get("/", (req, res) => {
  const db = readJson(OFFER_DB, { offers: [] });
  res.json({ offers: Array.isArray(db.offers) ? db.offers : [] });
});

router.get("/:id", (req, res) => {
  const { offer } = getOfferById(req.params.id);

  if (!offer) {
    return res.status(404).json({
      success: false,
      error: "Offer not found"
    });
  }

  res.json({
    success: true,
    offer
  });
});

router.get("/:id/pdf", (req, res) => {
  try {
    const filePath = path.join(GENERATED_OFFERS_DIR, `${req.params.id}.pdf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: "PDF not found"
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${req.params.id}.pdf"`
    );

    res.sendFile(filePath);
  } catch (error) {
    console.error("PDF serve error:", error);
    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

router.patch("/:id/status", (req, res) => {
  const { db, offer } = getOfferById(req.params.id);

  if (!offer) {
    return res.status(404).json({
      success: false,
      error: "Offer not found"
    });
  }

  const newStatus = String(req.body.status || "").trim().toLowerCase();

  if (!newStatus) {
    return res.status(400).json({
      success: false,
      error: "Status is required"
    });
  }

  offer.status = newStatus;
  offer.updatedAt = new Date().toISOString();

  if (newStatus === "booked") {
    offer.bookedAt = new Date().toISOString();
  }

  if (newStatus === "cancelled") {
    offer.cancelledAt = new Date().toISOString();
  }

  writeJson(OFFER_DB, db);

  res.json({
    success: true,
    offer
  });
});

module.exports = router;
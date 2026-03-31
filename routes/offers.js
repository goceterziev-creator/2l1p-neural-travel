const fs = require("fs");
const path = require("path");
const express = require("express");
const puppeteer = require("puppeteer");

const router = express.Router();

const {
  generateOffer,
  saveGeneratedOffer,
  renderHtml
} = require("../generateOffer");

const { readJson, writeJson } = require("../utils/jsonDb");

const OFFER_DB = path.join(__dirname, "..", "DATABASE", "database.json");
const GENERATED_OFFERS_DIR = path.join(__dirname, "..", "generated-offers");
const LIVE_BASE_URL = "https://twol1p-neural-travel-1.onrender.com/api/offers/view";

function getOfferById(id) {
  const db = readJson(OFFER_DB, { offers: [] });
  const offers = Array.isArray(db.offers) ? db.offers : [];
  const offer = offers.find((x) => x.id === id);
  return { db, offers, offer };
}

function parseTravelDates(travelDates = "") {
  const parts = String(travelDates).split("–").map((x) => x.trim());

  if (parts.length === 2) {
    return {
      startDate: parts[0],
      endDate: parts[1]
    };
  }

  return {
    startDate: "",
    endDate: ""
  };
}

function normalizeOfferForEngine(offer) {
  const parsedDates = parseTravelDates(offer.travelDates || "");

  return {
    id: offer.id,
    destination: offer.destination || "",
    startDate: offer.startDate || parsedDates.startDate || "",
    endDate: offer.endDate || parsedDates.endDate || "",
    departureAirport: offer.departureAirport || "Sofia",
    adults: Number(offer.adults || 2),
    children: Array.isArray(offer.children) ? offer.children : [],
    contactPhone: offer.clientPhone || offer.contactPhone || "+359894842882",
    contactWhatsApp:
      offer.clientPhone ||
      offer.contactWhatsApp ||
      offer.contactPhone ||
      "+359894842882",
    brandName: offer.brandName || "AYA Offer Engine",
    validHours: Number(offer.validHours || 24),
    currency: offer.currency || "EUR"
  };
}

router.post("/generate", async (req, res) => {
  try {
    const result = generateOffer(req.body, {
      clientBaseUrl: LIVE_BASE_URL
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
      contactPhone: req.body.contactPhone || req.body.clientPhone || "",
      destination: result.offer.destination,
      startDate: result.offer.startDate,
      endDate: result.offer.endDate,
      departureAirport: result.offer.departureAirport,
      adults: result.offer.adults,
      children: result.offer.children,
      validHours: result.offer.validHours,
      brandName: result.offer.brandName,
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

    return res.json({
      success: true,
      offer: result.offer,
      clientUrl: result.clientUrl,
      whatsappText: result.whatsappText,
      files: saved
    });
  } catch (error) {
    console.error("Generate offer error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get("/view/:id", (req, res) => {
  try {
    const { offer } = getOfferById(req.params.id);

    if (!offer) {
      return res.status(404).send("Offer not found");
    }

    const generated = generateOffer(normalizeOfferForEngine(offer), {
      clientBaseUrl: LIVE_BASE_URL
    });

    const html = renderHtml(generated.offer, generated.whatsappLink);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (error) {
    console.error("View offer error:", error);
    return res.status(500).send("Server error");
  }
});

router.get("/", (req, res) => {
  const db = readJson(OFFER_DB, { offers: [] });

  return res.json({
    offers: Array.isArray(db.offers) ? db.offers : []
  });
});

router.post("/", (req, res) => {
  try {
    const db = readJson(OFFER_DB, { offers: [] });
    const offers = Array.isArray(db.offers) ? db.offers : [];
    const body = req.body || {};

    const basePrice = Number(body.basePrice || 0);
    const markup = Number(body.markup || 0);

    const finalPriceInput =
      body.finalPrice !== undefined && body.finalPrice !== ""
        ? Number(body.finalPrice)
        : null;

    const calculatedFinalPrice =
      finalPriceInput !== null
        ? finalPriceInput
        : basePrice * (1 + markup / 100);

    const finalPrice = Number(calculatedFinalPrice || 0);
    const margin = finalPrice - basePrice;

    const validDays = Number(body.validDays || 1);

    const validUntil = body.validUntil
      ? new Date(body.validUntil).toISOString()
      : new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();

    const offer = {
      id: body.id || `OFF-${Date.now()}`,
      clientName: body.clientName || "",
      clientPhone: body.clientPhone || "",
      contactPhone: body.clientPhone || "",
      destination: body.destination || "",
      startDate: body.startDate || "",
      endDate: body.endDate || "",
      departureAirport: body.departureAirport || "Sofia",
      adults: Number(body.adults || 2),
      children: Array.isArray(body.children) ? body.children : [],
      validHours: Number(body.validHours || 24),
      brandName: body.brandName || "AYA Offer Engine",
      flightRoute: body.flightRoute || "",
      hotel: body.hotel || "",
      travelDates: body.travelDates || "",
      guests: body.guests || "",
      status: String(body.status || "draft").toLowerCase(),
      basePrice,
      markup,
      finalPrice,
      price: finalPrice,
      margin,
      currency: body.currency || "EUR",
      validUntil,
      notes: body.notes || "",
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const existingIndex = offers.findIndex((x) => x.id === offer.id);

    if (existingIndex >= 0) {
      offer.createdAt = offers[existingIndex].createdAt || offer.createdAt;
      offers[existingIndex] = offer;
    } else {
      offers.unshift(offer);
    }

    db.offers = offers;
    writeJson(OFFER_DB, db);

    return res.json({
      success: true,
      offer
    });
  } catch (error) {
    console.error("Save offer error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get("/:id", (req, res) => {
  const { offer } = getOfferById(req.params.id);

  if (!offer) {
    return res.status(404).json({
      success: false,
      error: "Offer not found"
    });
  }

  return res.json({
    success: true,
    offer
  });
});

router.get("/:id/pdf", async (req, res) => {
  let browser;

  try {
    const { offer } = getOfferById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        error: "Offer not found"
      });
    }

    const generated = generateOffer(normalizeOfferForEngine(offer), {
      clientBaseUrl: LIVE_BASE_URL
    });

    const html = renderHtml(generated.offer, generated.whatsappLink);

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1400,
      height: 2200
    });

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 0
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "12mm",
        right: "12mm",
        bottom: "12mm",
        left: "12mm"
      }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${offer.id}.pdf"`
    );

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF render error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "PDF generation failed"
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

router.post("/:id/book", (req, res) => {
  try {
    const db = readJson(OFFER_DB, { offers: [] });
    db.offers = Array.isArray(db.offers) ? db.offers : [];

    const offer = db.offers.find(
      (o) => String(o.id) === String(req.params.id)
    );

    if (!offer) {
      return res.status(404).json({
        success: false,
        error: "Offer not found"
      });
    }

    offer.status = "booked";
    offer.bookedAt = new Date().toISOString();
    offer.updatedAt = new Date().toISOString();

    writeJson(OFFER_DB, db);

    return res.json({
      success: true,
      offer
    });
  } catch (error) {
    console.error("Book offer error:", error);
    return res.status(500).json({
      success: false,
      error: "Booking failed"
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

  const index = db.offers.findIndex((x) => x.id === offer.id);

  if (index >= 0) {
    db.offers[index] = offer;
  }

  writeJson(OFFER_DB, db);

  return res.json({
    success: true,
    offer
  });
});

module.exports = router;
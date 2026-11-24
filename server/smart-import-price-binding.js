"use strict";

const { randomUUID } = require("node:crypto");
const { smartHotelRecord, hotelBookingConditions } = require("./smart-import-hotel-review");
const { normalize: normalizeOccupancy } = require("../public/hotel-occupancy");
const CHECKOUT_EVIDENCE_VERSION = 2;

function normalizedText(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function commercialScope(hotel) {
  const { adults, children, childAges, rooms } = normalizeOccupancy(hotel.occupancy);
  const { nights, nonRefundable } = hotelBookingConditions(hotel);
  const ages = childAges?.slice().sort((a, b) => a - b) ?? null;
  return {
    adults, children, childAges: children === 0 && (ages === null || ages.length === 0) ? [] : ages, rooms,
    nights: nights ?? null, meal: normalizedText(hotel.meal) || null, nonRefundable: nonRefundable ?? null
  };
}

function hotelIdentity(hotel) {
  return ["name", "address", "room", "ratePlan", "stayDates"].map(field =>
    normalizedText(hotel[field]));
}

function checkoutRecord({ intakeId, agencyId, hotel, source, parsed, quote }) {
  if (!source || !["hotel", "mixed"].includes(source.sourceType) ||
      parsed?.sourceId !== source.sourceId || !/^SRC-[1-8]$/.test(source.sourceId)) return null;
  const checkout = smartHotelRecord(parsed, source.sourceId);
  if (!(checkout.price > 0) || !hotel.name || !hotel.room ||
      checkout.price !== hotel.price || checkout.currency !== hotel.currency) return null;
  const currency = checkout.currency;
  const rate = currency === "EUR" ? 1 : quote?.rates?.[currency];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const eurPrice = Math.round(checkout.price / rate * 100) / 100;
  if (!Number.isFinite(eurPrice) || eurPrice <= 0) return null;
  return {
    version: CHECKOUT_EVIDENCE_VERSION, referenceId: randomUUID(), intakeId, agencyId, sourceId: source.sourceId,
    identity: hotelIdentity(hotel), commercialScope: commercialScope(hotel),
    label: checkout.priceEvidence.label, originalAmount: checkout.price, currency,
    rate, rateOrigin: currency === "EUR" ? "EUR" : quote.provider,
    rateDate: currency === "EUR" ? null : quote.updatedAt, eurPrice
  };
}

function bindOfferPrices({ body, agencyId, intakes, previous, invalid }) {
  if (!Array.isArray(body.hotels)) return body;
  const hotels = body.hotels.map((hotel, index) => {
    if (hotel?.importedPrice?.kind !== "checkout") return hotel;
    const { version, intakeId, sourceId, referenceId } = hotel.importedPrice;
    // An existing pre-binding record may be resaved as legacy, without inheriting verified status.
    if (version == null && previous?.hotels?.some(old =>
      old.importedPrice?.kind === "checkout" && old.importedPrice.version == null &&
      JSON.stringify(hotelIdentity(old)) === JSON.stringify(hotelIdentity(hotel)) &&
      old.price === hotel.price &&
      JSON.stringify(old.importedPrice.sourceIds) === JSON.stringify(hotel.importedPrice.sourceIds))) {
      return { ...hotel, importedPrice: undefined };
    }
    const intake = typeof intakeId === "string" && /^SMART-\d+-[a-f0-9]{6}$/.test(intakeId)
      ? intakes?.[intakeId] : null;
    const record = intake?.agencyId === agencyId && /^SRC-[1-8]$/.test(sourceId || "")
      ? intake.records.find(item => item.referenceId === referenceId && item.sourceId === sourceId && item.intakeId === intakeId && item.agencyId === agencyId && item.version === version)
      : null;
    if (!record) throw invalid(index, "CHECKOUT_REFERENCE_INVALID");
    if (record.version !== CHECKOUT_EVIDENCE_VERSION || !record.commercialScope) {
      throw invalid(index, "CHECKOUT_COMMERCIAL_SCOPE_UNAVAILABLE");
    }
    if (JSON.stringify(record.identity) !== JSON.stringify(hotelIdentity(hotel))) throw invalid(index, "CHECKOUT_HOTEL_RATE_MISMATCH");
    const claimedScope = commercialScope(hotel);
    const changedFields = Object.keys(claimedScope).filter(field =>
      JSON.stringify(claimedScope[field]) !== JSON.stringify(record.commercialScope[field]));
    if (changedFields.length) throw invalid(index, "CHECKOUT_COMMERCIAL_SCOPE_MISMATCH", changedFields);
    const eurPrice = Math.round(record.originalAmount / record.rate * 100) / 100;
    if (hotel.sourcePrice !== record.originalAmount || hotel.sourceCurrency !== record.currency ||
        hotel.exchangeRate !== record.rate || hotel.price !== eurPrice || hotel.currency !== "EUR" ||
        record.eurPrice !== eurPrice) throw invalid(index, "CHECKOUT_AMOUNT_OR_FX_MISMATCH");
    return { ...hotel, price: eurPrice, sourcePrice: record.originalAmount, sourceCurrency: record.currency,
      exchangeRate: record.rate, exchangeRateSource: record.rateOrigin, exchangeRateDate: record.rateDate,
      importedPrice: { kind: "checkout", version: record.version, referenceId: record.referenceId, intakeId, sourceId, sourceIds: [sourceId] } };
  });
  return { ...body, hotels };
}

module.exports = { checkoutRecord, bindOfferPrices };

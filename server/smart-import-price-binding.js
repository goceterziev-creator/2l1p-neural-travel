"use strict";

const { randomUUID } = require("node:crypto");
const { smartHotelRecord, hotelBookingConditions, hotelStay } = require("./smart-import-hotel-review");
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
  return [...["name", "address", "room", "ratePlan"].map(field => normalizedText(hotel[field])),
    JSON.stringify(hotelStay(hotel.stayDates))];
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
    ...(typeof parsed.mealSourceText === "string" && parsed.mealSourceText.trim() ? { mealSourceText: parsed.mealSourceText.trim().slice(0, 2000) } : {}),
    label: checkout.priceEvidence.label, originalAmount: checkout.price, currency,
    rate, rateOrigin: currency === "EUR" ? "EUR" : quote.provider,
    rateDate: currency === "EUR" ? null : quote.updatedAt, eurPrice
  };
}

function legacyStayIdentity(stored, hotel, record, previous, archivedHotel) {
  if (stored === "[object object]") {
    // The previous format did not distinguish two different objects. Only
    // the integrity-checked intake response can recover the bound source stay.
    const restored = archivedHotel && hotelStay(archivedHotel.stayDates);
    return restored?.status === "complete" ? JSON.stringify(restored) : null;
  }
  const array = typeof stored === "string" && stored.match(/^(\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?$/);
  const stay = hotelStay(array ? [array[1], array[2]] : stored);
  if (stay.status === "complete") return JSON.stringify(stay);
  if (!["unknown", "partial"].includes(stay.status)) return null;
  // Preserve an existing attachment with only partial information on an
  // unrelated Update. Never upgrade it to a different or fully dated stay.
  const claim = hotel.importedPrice;
  const existing = previous?.hotels?.filter(old =>
    old.importedPrice?.referenceId === record.referenceId && old.importedPrice.version === claim.version &&
    old.importedPrice.sourceId === claim.sourceId && old.importedPrice.intakeId === claim.intakeId &&
    (!old.id || old.id === hotel.id) && JSON.stringify(hotelIdentity(old)) === JSON.stringify(hotelIdentity(hotel)));
  return existing?.length === 1 ? JSON.stringify(stay) : null;
}

function bindOfferPrices({ body, agencyId, intakes, previous, readArchivedHotel, invalid }) {
  if (!Array.isArray(body.hotels)) return body;
  const hotels = body.hotels.map((hotel, index) => {
    if (hotel?.importedPrice?.kind !== "checkout") {
      const matches = (previous?.hotels || []).filter(old => old.importedPrice?.kind === "checkout" &&
        (old.id && hotel.id ? old.id === hotel.id : normalizedText(old.name) === normalizedText(hotel.name)) &&
        old.importedPrice.version === CHECKOUT_EVIDENCE_VERSION);
      if (matches.length && hotel.importedPrice?.kind !== "operator") throw invalid(index, "CHECKOUT_OPERATOR_CORRECTION_REQUIRED");
      return hotel;
    }
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
    const observedIdentity = Array.isArray(record.identity) ? record.identity.slice() : [];
    const storedStay = observedIdentity[4];
    if (typeof storedStay === "string" && !storedStay.startsWith("{")) {
      observedIdentity[4] = legacyStayIdentity(storedStay, hotel, record, previous,
        storedStay === "[object object]" ? readArchivedHotel?.(intake, record) : null);
      if (!observedIdentity[4]) throw invalid(index, "CHECKOUT_STAY_IDENTITY_UNAVAILABLE");
    }
    if (JSON.stringify(observedIdentity) !== JSON.stringify(hotelIdentity(hotel))) throw invalid(index, "CHECKOUT_HOTEL_RATE_MISMATCH");
    const claimedScope = commercialScope(hotel);
    const changedFields = Object.keys(claimedScope).filter(field =>
      JSON.stringify(claimedScope[field]) !== JSON.stringify(record.commercialScope[field]));
    if (changedFields.length) throw invalid(index, "CHECKOUT_COMMERCIAL_SCOPE_MISMATCH", changedFields);
    const eurPrice = Math.round(record.originalAmount / record.rate * 100) / 100;
    if (hotel.sourcePrice !== record.originalAmount || hotel.sourceCurrency !== record.currency ||
        hotel.exchangeRate !== record.rate || hotel.price !== eurPrice || hotel.currency !== "EUR" ||
        record.eurPrice !== eurPrice) throw invalid(index, "CHECKOUT_AMOUNT_OR_FX_MISMATCH");
    return { ...hotel, ...(record.mealSourceText ? { mealSourceText: record.mealSourceText } : {}), price: eurPrice, sourcePrice: record.originalAmount, sourceCurrency: record.currency,
      exchangeRate: record.rate, exchangeRateSource: record.rateOrigin, exchangeRateDate: record.rateDate,
      importedPrice: { kind: "checkout", version: record.version, referenceId: record.referenceId, intakeId, sourceId, sourceIds: [sourceId] } };
  });
  return { ...body, hotels };
}

module.exports = { checkoutRecord, bindOfferPrices };

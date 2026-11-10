"use strict";

// Pure plan helpers: routing and persistence are owned by server.js.
// The caller must supply the existing uniqueHotelImages / image validation path.
const crypto = require("node:crypto");
const { hotelImageCandidates } = require("../gt63-core/hotel-print-images");
const { isDeepStrictEqual } = require("node:util");
const issuedPlans = new WeakSet();
const identityPlans = new WeakSet();
const { offerRecordVersion: version } = require("./offer-record-version");
function reject(message, status = 409) {
  const error = new Error(message); error.status = status; throw error;
}
// Use the RAW stored offer, never the API-enriched DTO. A mirror, if stored,
// must already agree exactly; names, URLs and positions are not cross-version IDs.
function checkedHotels(offer) {
  if (!Array.isArray(offer.hotels) || !offer.hotels.length) reject("Canonical hotels required");
  if (Object.hasOwn(offer, "hotelOptions") && !isDeepStrictEqual(offer.hotels, offer.hotelOptions)) {
    reject("Stored hotel mirror mismatch; explicit reconciliation required");
  }
  const ids = new Set();
  for (const hotel of offer.hotels) {
    if (!hotel || typeof hotel !== "object") reject("Invalid hotel record");
    if (hotel.id != null && typeof hotel.id !== "string") reject("Invalid hotel ID");
    if (typeof hotel.id === "string" && hotel.id.trim()) {
      if (hotel.id !== hotel.id.trim() || ids.has(hotel.id)) reject("Invalid or duplicate hotel ID");
      ids.add(hotel.id);
    }
  }
  return offer.hotels;
}
function replaceHotels(offer, hotels) {
  return { ...offer, hotels, ...(Object.hasOwn(offer, "hotelOptions") ? { hotelOptions: hotels.map(hotel => ({ ...hotel })) } : {}) };
}
function identityCopy(offer, ids) {
  return replaceHotels(offer, checkedHotels(offer).map((hotel, index) => ({ ...hotel, id: ids[index] })));
}
function prepareHotelIdentityPlan({ offer, offerId, expectedVersion }) {
  if (!offer || !offerId || offer.id !== offerId) reject("Offer identity mismatch");
  if (!expectedVersion || version(offer) !== expectedVersion) reject("Offer version conflict");
  const hotels = checkedHotels(offer);
  const used = new Set(hotels.map(hotel => hotel.id).filter(id => typeof id === "string" && id.trim()));
  const ids = hotels.map(hotel => {
    if (typeof hotel.id === "string" && hotel.id.trim()) return hotel.id;
    const id = `hotel-${crypto.randomUUID()}`;
    if (used.has(id)) reject("Generated hotel ID collision");
    used.add(id);
    return id;
  });
  const result = identityCopy(offer, ids);
  const plan = Object.freeze({ offerId, expectedVersion, resultVersion: version(result), ids: Object.freeze(ids) });
  identityPlans.add(plan);
  return plan;
}
// Caller re-reads and applies inside the existing serialized mutation with
// access checks; this module exposes no write endpoint.
function applyHotelIdentityPlan(offer, plan) {
  if (!plan || !identityPlans.has(plan)) reject("Only a server-prepared identity plan is accepted", 422);
  if (!offer || offer.id !== plan.offerId) reject("Offer identity mismatch");
  checkedHotels(offer);
  if (version(offer) === plan.resultVersion) return { offer, changed: false };
  if (version(offer) !== plan.expectedVersion) reject("Offer version conflict");
  return { offer: identityCopy(offer, plan.ids), changed: plan.expectedVersion !== plan.resultVersion };
}
function target(offer, offerId, hotelId) {
  if (!offer || !offerId || offer.id !== offerId) reject("Offer identity mismatch");
  const hotels = checkedHotels(offer);
  const matches = hotels.map((hotel, index) => ({ hotel, index })).filter(x =>
    typeof hotelId === "string" && hotelId.trim() && x.hotel.id === hotelId);
  if (matches.length !== 1) reject("A unique persisted hotel ID is required");
  return matches[0];
}
function imageOnlyCopy(offer, index, images) {
  return replaceHotels(offer, checkedHotels(offer).map((hotel, i) => i === index ? { ...hotel, images: images.slice() } : hotel));
}

async function prepareHotelImagePlan({ offer, offerId, hotelId, expectedVersion,
  candidates, confirmedHotelIdentity = false }, { uniqueImages, validateImage }) {
  const selected = target(offer, offerId, hotelId);
  if (!expectedVersion || version(offer) !== expectedVersion) reject("Offer version conflict");
  if (confirmedHotelIdentity !== true) reject("Explicit property identity confirmation required", 422);
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 3) reject("Supply 1–3 reviewed candidates", 422);
  const urls = [];
  for (const candidate of candidates) {
    if (candidate.hotelId !== hotelId || !["persisted-alias", "hotel-lookup"].includes(candidate.source)) {
      reject("Candidate must belong to this hotel; PDF/fallback output is not evidence", 422);
    }
    const accepted = uniqueImages([candidate.url], 1);
    if (accepted.length !== 1 || !(await validateImage(accepted[0]))) reject("Image validation failed", 422);
    urls.push(accepted[0]);
  }
  // No replacement of existing images or arbitrary normalization of other fields.
  const existing = Array.isArray(selected.hotel.images) ? selected.hotel.images : [];
  const images = [...new Set([...existing, ...uniqueImages(urls, 3)])];
  if (images.length > 6) reject("Explicit image review required: gallery limit exceeded", 422);
  if (version(offer) !== expectedVersion) reject("Offer changed during validation");
  const result = imageOnlyCopy(offer, selected.index, images);
  const plan = Object.freeze({ offerId, hotelId, expectedVersion,
    resultVersion: version(result), images: Object.freeze(images) });
  issuedPlans.add(plan);
  return plan;
}

// Invoke synchronously inside the EXISTING mutateDb callback, after re-reading
// the current offer and checking capability/agency access. It never writes itself.
function applyHotelImagePlan(currentOffer, plan) {
  if (!plan || !issuedPlans.has(plan)) reject("Only a server-prepared plan is accepted", 422);
  const selected = target(currentOffer, plan.offerId, plan.hotelId);
  const currentVersion = version(currentOffer);
  if (currentVersion === plan.resultVersion) return { offer: currentOffer, changed: false };
  if (currentVersion !== plan.expectedVersion) reject("Offer version conflict");
  return { offer: imageOnlyCopy(currentOffer, selected.index, plan.images),
    changed: plan.expectedVersion !== plan.resultVersion };
}

// Proposed render-time projection only. Do not rewrite a saved proposal snapshot
// merely to expose explicitly persisted images. No name/index matching is allowed.
function projectPersistedHotelImages(input, offer) {
  const copy = JSON.parse(JSON.stringify(input));
  const project = hotel => {
    const matches = (offer.hotels || []).filter(saved => hotel?.id && saved.id === hotel.id);
    if (matches.length !== 1) return hotel;
    const images = hotelImageCandidates({ images: matches[0].images });
    if (!images.length) return hotel;
    const next = { ...hotel, images };
    for (const key of ["imageUrls", "image", "imageUrl", "heroImage", "photo", "thumbnail", "gallery"]) delete next[key];
    return next;
  };
  copy.hotelOptions = (copy.hotelOptions || []).map(project);
  if (copy.hotel) copy.hotel = project(copy.hotel);
  return copy;
}

module.exports = { prepareHotelIdentityPlan, applyHotelIdentityPlan, hotelImageOfferVersion: version, prepareHotelImagePlan, applyHotelImagePlan, projectPersistedHotelImages };

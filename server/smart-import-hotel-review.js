"use strict";
function currencyFromText(text, fallback = "") {
  const value = String(text || "").toUpperCase().replace(/МКД/g, "MKD");
  const code = value.match(/\b(EUR|MKD|QAR|USD|GBP|BGN|CHF|JPY|AED|TRY|RON|SEK|NOK|DKK|CAD|AUD)\b/);
  if (code) return code[1];
  if (value.includes("€")) return "EUR";
  if (value.includes("£")) return "GBP";
  if (/\bЛВ\b/.test(value)) return "BGN";
  return String(fallback || "").trim().toUpperCase();
}
function moneyFromText(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const token = String(value || "").match(/\d[\d\s\u00a0\u202f.,]*\d|\d/);
  if (!token) return 0;
  let s = token[0].replace(/[\s\u00a0\u202f]/g, "");
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (last >= 0 && s.length - last - 1 <= 2) s = s.slice(0,last).replace(/[.,]/g, "") + "." + s.slice(last+1);
  else s = s.replace(/[.,]/g, "");
  return Number(s) || 0;
}
function normalizeHotelMoney(hotel) {
  const priceText = String(hotel.priceText || "").trim();
  return { ...hotel, priceText, price: moneyFromText(priceText || hotel.price), currency: currencyFromText(priceText, hotel.currency) };
}
const key = s => String(s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
function groupHotelScreenshots(records) {
  const named = records.filter(h=>key(h.name));
  const groups = [];
  for (const hotel of named) {
    const existing = groups.find(g=>key(g[0].name)===key(hotel.name) && key(g[0].room)===key(hotel.room) && g[0].currency===hotel.currency);
    if (existing) existing.push(hotel); else groups.push([hotel]);
  }
  const unresolved = [];
  for (const hotel of records.filter(h=>!key(h.name))) {
    const matches = groups.filter(g=>key(hotel.room) && key(g[0].room)===key(hotel.room) && (!hotel.currency || hotel.currency===g[0].currency));
    if (matches.length===1) matches[0].push(hotel); else unresolved.push(hotel);
  }
  return { hotels: groups.map(group=> {
    const base = {...group[0]};
    // Named checkout totals are more precise than a rounded room-selector total.
    for (const h of group.slice(1)) for (const [k,v] of Object.entries(h)) if (!base[k] && v) base[k]=v;
    return base;
  }), unresolved };
}
// The visible label and amount must come from the same checkout price row.
function smartHotelRecord(parsed, sourceId) {
  const priceText = String(parsed.priceText || "").trim();
  const label = String(parsed.priceLabel || "").trim();
  const currency = currencyFromText(priceText);
  const verifiedTotal = parsed.priceRole === "stay_total" &&
    /^(?:общо|крайна цена|цена за престоя|total|grand total|total (?:stay price|price|for the stay))[:.]?$/iu.test(label) &&
    /^(?:(?:[A-Z]{3}|[€£])\s*\d[\d.,\s]*|\d[\d.,\s]*\s*(?:[A-Z]{3}|[€£]))$/iu.test(priceText) &&
    Boolean(currency) && moneyFromText(priceText) > 0;
  return { ...parsed, sourceId, price: verifiedTotal && parsed.pageKind === "checkout" ? moneyFromText(priceText) : 0,
    currency: verifiedTotal && parsed.pageKind === "checkout" ? currency : "",
    priceEvidence: { sourceId, label, text: priceText, currency, role: String(parsed.priceRole || "unknown") },
    occupancy: require("../public/hotel-occupancy").normalize({ ...parsed.occupancy, confirmed: false }),
    ...hotelBookingConditions(parsed) };
}

function hotelBookingConditions(hotel = {}) {
  const nights = typeof hotel.nights === "boolean" ? NaN : Number(hotel.nights);
  return {
    ...(Number.isSafeInteger(nights) && nights > 0 ? { nights } : {}),
    ...(typeof hotel.nonRefundable === "boolean" ? { nonRefundable: hotel.nonRefundable } : {}),
    ...(hotel.transferOnRequest === true ? { transferOnRequest: true } : {})
  };
}

function groupSmartHotelScreenshots(records) {
  const options = [];
  // A locality alone is not property identity. Keep incomplete addresses in review.
  const streetAddress = item => /\d/.test(String(item.address || "")) ? key(item.address) : "";
  const isProperty = item => item.pageKind === "property" ||
    ((!item.pageKind || item.pageKind === "unknown") &&
      key(item.description) && (key(item.stars) || (Array.isArray(item.amenities) && item.amenities.length > 0)) &&
      !item.price && !key(item.room) && !key(item.ratePlan) && !key(item.stayDates) &&
      !item.nights && typeof item.nonRefundable !== "boolean" &&
      !Object.values(item.occupancy || {}).some(value => value === true || Number.isInteger(value)) &&
      !item.priceEvidence?.label);
  const properties = records.filter(isProperty);
  const unresolved = records.filter(item => !isProperty(item) && !key(item.name));
  const rates = records.filter(item => !isProperty(item) && key(item.name));
  for (const record of rates) {
    const signature = item => JSON.stringify([
      key(item.name), key(item.address), key(item.room), key(item.ratePlan), item.price,
      item.currency, item.priceEvidence?.text, item.stayDates, item.nights,
      item.nonRefundable, item.meal, item.occupancy, item.transferOnRequest
    ]);
    const evidence = record.priceEvidence?.text ? [record.priceEvidence] : [];
    const existing = options.find(item => signature(item) === signature(record) &&
      streetAddress(item) && streetAddress(record));
    if (existing) existing.priceEvidenceRecords.push(...evidence);
    else options.push({ ...record, priceEvidenceRecords: evidence, propertySourceIds: [] });
  }

  const propertyReview = properties.map(property => {
    const candidates = options.filter(option => key(property.name) && key(option.name) === key(property.name) &&
      (!streetAddress(property) || !streetAddress(option) || streetAddress(option) === streetAddress(property)));
    const exact = candidates.filter(option => streetAddress(property) && streetAddress(option) === streetAddress(property));
    return { property, candidates, exact, auto: exact.length > 0 && exact.length === candidates.length };
  });
  for (const option of options) {
    const matches = propertyReview.filter(item => item.auto && item.exact.includes(option));
    const transfer = new Set([option, ...matches.map(item => item.property)]
      .map(item => item.transferOnRequest).filter(value => typeof value === "boolean"));
    if (transfer.size > 1) {
      for (const match of matches) match.conflict = true;
    }
  }
  for (const item of propertyReview) {
    if (!item.auto || item.conflict) continue;
    const { property } = item;
    for (const option of item.exact) {
      for (const field of ["stars", "area", "location", "description"]) option[field] ||= property[field];
      // Keep checkout conditions tied to the checkout source.
      if (option.pageKind !== "checkout") option.transferOnRequest ??= property.transferOnRequest;
      if (property.sourceId) option.propertySourceIds.push(property.sourceId);
      if (property.priceEvidence?.text) option.priceEvidenceRecords.push(property.priceEvidence);
    }
  }
  return {
    hotels: options, unresolved,
    propertyReview: propertyReview.filter(item => !item.auto || item.conflict).map(({ property, candidates, conflict }) => ({
      sourceId: property.sourceId, name: property.name, address: property.address,
      candidateSourceIds: candidates.map(item => item.sourceId), conflict: Boolean(conflict),
      stars: property.stars, description: property.description, transferOnRequest: property.transferOnRequest
    }))
  };
}

function hotelReviewWarnings(hotels, unresolved = [], sourceRecords = []) {
  const warnings=[];
  for(const h of hotels) {
    if (!(h.price>0)) warnings.push(`Липсва крайна хотелска цена: ${h.name || "безименна снимка"}.`);
    if (!h.currency) warnings.push(`Липсва валута: ${h.name || "безименна снимка"}.`);
    if (h.currency && h.currency!=="EUR") warnings.push(`${h.name}: ${h.price} ${h.currency}. Въведете курс към EUR преди общата цена.`);
  }
  for (const record of sourceRecords) {
    if (record.pageKind !== "checkout") continue;
    const occupancy = record.occupancy || {};
    const conditions = hotelBookingConditions(record);
    const missing = [
      [occupancy.adults == null, "възрастни"],
      [occupancy.children == null, "деца"],
      [occupancy.rooms == null, "стаи"],
      [!conditions.nights, "нощувки"],
      [typeof record.stayDates !== "string" || !record.stayDates.trim(), "дати на престоя"],
      [typeof record.nonRefundable !== "boolean", "условия за възстановяване"],
      [typeof record.transferOnRequest !== "boolean", "заявка за трансфер"]
    ].filter(([unknown]) => unknown).map(([, label]) => label);
    if (missing.length) warnings.push(`${record.name || "Хотел"} (${record.sourceId}): за проверка — ${missing.join(", ")}.`);
  }
  if(unresolved.length) warnings.push(`${unresolved.length} хотелски снимки не могат да бъдат свързани еднозначно. Проверете ги.`);
  return warnings;
}
// Only screenshot-transcribed inclusion text may substantiate an imported meal.
// This is an extraction boundary, not a rule for manually entered offer data.
function importedMealEvidence(hotel = {}, parsed = {}) {
  const quote = typeof parsed.mealSourceText === "string" ? parsed.mealSourceText.trim() : "";
  const vm = require("../gt63-core/presentation-view-model");
  const label = vm.compactMealLabel(hotel.meal);
  const quotedLabel = vm.compactMealLabel(quote);
  const explicit = /включен|included|all\s*inclusive|half\s*board|full\s*board|полупансион|пълен пансион|room\s*only|без (?:включено )?(?:хранене|изхранване)/i.test(quote);
  const requested = vm.mealServiceConditions(hotel.meal);
  const quoted = vm.mealServiceConditions(quote);
  const mealNames = Object.keys(requested);
  const matchingMeals = mealNames.length > 0 && mealNames.every(name =>
    quoted[name] === "included" && ["included", "declared"].includes(requested[name]));
  const supported = label !== "Хранене за потвърждение" && (mealNames.length
    ? matchingMeals
    : explicit && quotedLabel === label);
  const qualified = Object.values(quoted).includes("paid") ||
    (Object.values(quoted).includes("excluded") && Object.values(quoted).includes("included"));
  const hasAdjacentService = supported && mealNames.length > 0 &&
    /[,;]|\s+(?:and|и|plus|плюс|\+)\s+/iu.test(hotel.meal) &&
    hotel.meal.split(/[,;]|\s+(?:and|и|plus|плюс|\+)\s+/iu)
      .some(part => part.trim() && !Object.keys(vm.mealServiceConditions(part)).length);
  const meal = qualified || hasAdjacentService ? quote : supported ? hotel.meal : "";
  const description = vm.mealSafeDescription({ ...hotel, meal });
  return { ...hotel, meal, description };
}
module.exports={smartHotelRecord,groupSmartHotelScreenshots,hotelBookingConditions,importedMealEvidence,currencyFromText,moneyFromText,normalizeHotelMoney,groupHotelScreenshots,hotelReviewWarnings};

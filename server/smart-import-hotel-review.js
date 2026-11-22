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
function hotelReviewWarnings(hotels, unresolved = []) {
  const warnings=[];
  for(const h of hotels) {
    if (!(h.price>0)) warnings.push(`Липсва крайна хотелска цена: ${h.name || "безименна снимка"}.`);
    if (!h.currency) warnings.push(`Липсва валута: ${h.name || "безименна снимка"}.`);
    if (h.currency && h.currency!=="EUR") warnings.push(`${h.name}: ${h.price} ${h.currency}. Въведете курс към EUR преди общата цена.`);
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
  const meal = qualified ? quote : supported ? hotel.meal : "";
  const description = vm.mealSafeDescription({ ...hotel, meal });
  return { ...hotel, meal, description };
}
module.exports={importedMealEvidence,currencyFromText,moneyFromText,normalizeHotelMoney,groupHotelScreenshots,hotelReviewWarnings};

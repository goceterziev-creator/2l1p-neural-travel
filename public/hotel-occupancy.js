"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AYAHotelOccupancy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const WARNING = "[WARNING] Избраният хотел няма потвърдена хотелска заетост (възрастни, деца) и брой стаи. Потвърдете отделно от полетния състав.";
  function count(value, min) {
    if (value == null || String(value).trim() === "" || typeof value === "boolean") return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= min ? number : null;
  }
  function normalize(value = {}) {
    const raw = value && typeof value === "object" ? value : {};
    const adults = count(raw.adults, 1), children = count(raw.children, 0), rooms = count(raw.rooms, 1);
    // Unknown ages stay unknown; they are never derived from flight passengers.
    const childAges = Array.isArray(raw.childAges) ? raw.childAges.map(age => count(age, 0)) : null;
    const agesValid = (raw.childAges == null || Array.isArray(raw.childAges)) && (childAges === null || (childAges.length === children && childAges.every(age => age !== null && age <= 17)));
    return { adults, children, rooms, childAges,
      confirmed: raw.confirmed === true && adults !== null && children !== null && rooms !== null && agesValid };
  }
  function hotels(offer = {}) {
    if (Array.isArray(offer.hotels) && offer.hotels.length) return offer.hotels;
    if (Array.isArray(offer.hotelOptions) && offer.hotelOptions.length) return offer.hotelOptions;
    const input = offer.proposalInput || {};
    return Array.isArray(input.hotelOptions) && input.hotelOptions.length ? input.hotelOptions : (input.hotel ? [input.hotel] : []);
  }
  function selected(offer = {}) {
    const options = hotels(offer);
    const marked = options.find(hotel => hotel.selected === true);
    if (marked) return marked;
    // Saved legacy records use first-option fallback. Proposal-only records can
    // also carry an explicit selected index or active hotel.
    if (!(Array.isArray(offer.hotels) && offer.hotels.length) && !(Array.isArray(offer.hotelOptions) && offer.hotelOptions.length)) {
      const input = offer.proposalInput || {};
      if (Number.isInteger(input.selectedHotelIndex) && options[input.selectedHotelIndex]) return options[input.selectedHotelIndex];
      const id = input.selectedHotelId || input.selection?.selectedHotelId;
      const matched = options.filter(hotel => id ? (hotel.id || hotel.name) === id : input.hotel && hotel.name === input.hotel.name);
      if (matched.length === 1) return matched[0];
    }
    return options[0] || null;
  }
  const PARTY_WARNING = "[WARNING] Посочете еднозначно броя на пътуващите за проверка на хотелското покритие.";
  function normalizeGuestsText(value = "") {
    return String(value || "").replace(/възрастнни/gi, "възрастни").replace(/vazrastnni/gi, "vazrastni").replace(/\s+/g, " ").trim();
  }
  function partyCoverage(guests, value) {
    const requested = normalizeGuestsText(guests).toLowerCase();
    const occupancy = normalize(value);
    const generic = requested.match(/^(\d+)\s*(?:пътници|пътник|души|passengers?|travell?ers?)?$/u);
    const category = /(\d+)\s*(възрастни|възрастен|vazrastni|vazrasten|adults?|деца|дете|deca|detsa|dete|children|child|kids?|бебета|бебе|bebeta|bebe|infants?)(?![\p{L}\p{N}])/gu;
    const counts = new Map();
    let end = 0;
    for (const match of requested.matchAll(category)) {
      const gap = requested.slice(end, match.index).trim();
      const key = /^(?:възраст|vazrast|adult)/u.test(match[2]) ? "adults"
        : /^(?:беб|beb|infant)/u.test(match[2]) ? "infants" : "children";
      const amount = count(match[1], key === "adults" ? 1 : 0);
      if ((!end && gap) || (end && !/^(?:,?\s*(?:and|и|i)|[,;+&])$/u.test(gap)) || counts.has(key) || amount === null) {
        return { state: "unknown", warning: PARTY_WARNING };
      }
      counts.set(key, amount);
      end = match.index + match[0].length;
    }
    if ((!end || requested.slice(end).trim() || !counts.has("adults")) && !generic) {
      return { state: "unknown", warning: requested ? PARTY_WARNING : "" };
    }
    const requiredTotal = generic ? count(generic[1], 1) : null;
    const knownTotal = occupancy.adults !== null && occupancy.children !== null ? occupancy.adults + occupancy.children : null;
    const requiredChildren = (counts.get("children") || 0) + (counts.get("infants") || 0);
    const pairs = generic ? [[requiredTotal, knownTotal, "пътници"]] : [
      [counts.get("adults"), occupancy.adults, "възрастни"], [requiredChildren, occupancy.children, "деца"]
    ];
    const warning = pairs.filter(([needed, covered]) => needed !== null && covered !== null && covered < needed)
      .map(([needed, covered, label]) => `За ${label}: настаняването покрива ${covered} от ${needed} заявени.`).join(" ");
    return { state: warning ? "insufficient" : pairs.some(([needed, covered]) => needed == null || covered == null)
      ? "unknown" : "sufficient", warning: warning || (generic && requiredTotal === null ? PARTY_WARNING : "") };
  }
  function coverage(guests, value) {
    return partyCoverage(guests, value).warning;
  }
  function insufficient(offer = {}) {
    return hotels(offer).flatMap(hotel => {
      const warning = coverage(offer.guests, hotel.occupancy);
      return warning ? [{ hotelId: String(hotel.id || hotel.name || ""), warning }] : [];
    });
  }
  function summary(offer = {}) {
    const hotel = selected(offer);
    const occupancy = normalize(hotel?.occupancy);
    return { blockingWarning: coverage(offer.guests, occupancy) || (occupancy.confirmed ? "" : WARNING), selectedHotelId: hotel ? String(hotel.id || hotel.name || "") : null,
      occupancy };
  }
  function warning(offer = {}) {
    const hasHotels = hotels(offer).length > 0;
    const status = hasHotels ? summary(offer) : (offer.hotelOccupancyStatus || summary(offer));
    return hasHotels ? status.blockingWarning : (normalize(status.occupancy).confirmed ? "" : WARNING);
  }
  function label(value) {
    const o = normalize(value);
    const composition = o.adults !== null && o.children !== null ? `${o.adults} възрастни, ${o.children} деца` : "Гости за потвърждение";
    const rooms = o.rooms !== null ? `${o.rooms} ${o.rooms === 1 ? "стая" : "стаи"}` : "Брой стаи за потвърждение";
    const ages = o.childAges && o.childAges.length ? `; възрасти: ${o.childAges.map(age => age === null ? "?" : age).join(", ")}` : "";
    return `${composition}; ${rooms}${ages} — ${o.confirmed ? "потвърдена заетост" : "непотвърдена заетост"}`;
  }
  function savedOptions(offer) {
    return Array.isArray(offer.hotels) && offer.hotels.length ? offer.hotels : (Array.isArray(offer.hotelOptions) ? offer.hotelOptions : []);
  }
  function matchingSavedHotel(hotel, offer) {
    const name = value => String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const matches = savedOptions(offer).filter(item => {
      const sameName = name(item.name) && name(item.name) === name(hotel?.name);
      return hotel?.id && item.id ? item.id === hotel.id && (!item.name || !hotel.name || sameName) : sameName;
    });
    return matches.length === 1 ? matches[0] : null;
  }
  // Saved hotel records are authoritative. Never match or populate from flights.
  function applyToInput(input, offer = {}) {
    const copy = JSON.parse(JSON.stringify(input));
    const saved = savedOptions(offer);
    if (!saved.length) return copy;
    function project(hotel) {
      if (!hotel) return hotel;
      const source = matchingSavedHotel(hotel, offer);
      return { ...hotel, ...(source && typeof source.meal === "string" ? { meal: source.meal, board: source.meal } : {}),
        occupancy: normalize(source?.occupancy),
        selected: source !== null && source === selected(offer) };
    }
    copy.hotelOptions = (Array.isArray(copy.hotelOptions) ? copy.hotelOptions : []).map(project);
    copy.hotel = project(copy.hotel);
    const index = copy.hotelOptions.findIndex(hotel => hotel.selected);
    if (index >= 0) {
      copy.hotel = copy.hotelOptions[index];
      copy.selectedHotelIndex = index;
      // Remove stale selection aliases; explicit URL selection still takes precedence.
      delete copy.selectedHotelId;
      delete copy.selectedHotel;
      delete copy.selection;
    }
    return copy;
  }
  return { normalize, selected, summary, warning, coverage, partyCoverage, normalizeGuestsText, insufficient, savedOptions, matchingSavedHotel, label, applyToInput, WARNING };
});

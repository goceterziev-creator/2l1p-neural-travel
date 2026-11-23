"use strict";

(function exposePresentationViewModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63PresentationViewModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPresentationViewModel() {
  const occupancyQa = globalThis.AYAHotelOccupancy || (typeof require === "function" ? require("../public/hotel-occupancy") : null);
  const hotelOccupancyLabel = value => occupancyQa ? occupancyQa.label(value) : "Хотелска заетост за потвърждение";
  const VALID_PRINT_MODES = new Set(["selected", "comparison"]);

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, fallback = "-") {
    const cleaned = String(value ?? "").trim();
    return cleaned || fallback;
  }

  function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function money(value, currency = "EUR") {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "-";
    return `${number.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || "EUR"}`;
  }

  function localizeClientText(value) {
    const raw = text(value, "");
    if (!raw) return "";
    return raw
      .replace(/\bJanuary\b/gi, "януари")
      .replace(/\bFebruary\b/gi, "февруари")
      .replace(/\bMarch\b/gi, "март")
      .replace(/\bApril\b/gi, "април")
      .replace(/\bMay\b/gi, "май")
      .replace(/\bJune\b/gi, "юни")
      .replace(/\bJuly\b/gi, "юли")
      .replace(/\bAugust\b/gi, "август")
      .replace(/\bSeptember\b/gi, "септември")
      .replace(/\bOctober\b/gi, "октомври")
      .replace(/\bNovember\b/gi, "ноември")
      .replace(/\bDecember\b/gi, "декември")
      .replace(/\bself[-\s]?transfer\b/gi, "Самостоятелно прехвърляне")
      .replace(/\bchecked baggage included\b/gi, "Включен регистриран багаж")
      .replace(/\bcabin baggage included\b/gi, "Включен ръчен багаж")
      .replace(/\bbreakfast included\b/gi, "Включена закуска")
      .replace(/\broom only\b/gi, "Без включено хранене")
      .replace(/\bnot specified\b/gi, "Не е посочено")
      .replace(/\s+г\.\s*-\s*/g, " г. – ")
      .replace(/\bTokyo\b/g, "Токио")
      .replace(/\bJapan\b/g, "Япония")
      .replace(/Дизайнирано пушене/gi, "Зона за пушачи")
      .replace(/Designated smoking area/gi, "Зона за пушачи");
  }

  // Bind each condition to its meal, never to another amenity in the quote.
  function mealServiceEvidence(value) {
    const raw = text(value, "");
    const fee = "(?:for\\s+(?:an?\\s+)?(?:fee|(?:extra|additional)\\s+(?:fee|charge))|at\\s+an?\\s+(?:extra|additional)\\s+charge|срещу\\s+(?:(?:допълнително|допълнителна)\\s+)?(?:такса|заплащане|доплащане)|с\\s+доплащане)";
    const currency = "(?:[A-Z]{3}\\b|[€$£])";
    const amount = "\\d+(?:[.,]\\d+)?";
    const traveler = "(?:adults?|child(?:ren)?|persons?|възрастен|възрастни|дете|деца|човек)";
    const day = "(?:day|night|ден|нощ)";
    const period = `(?:\\s*/\\s*|\\s+per\\s+|\\s+на\\s+)${day}`;
    const childAge = "\\s*\\(ages?\\s+\\d{1,2}(?:\\s*[-–—]\\s*\\d{1,2})?(?:\\s+years?)?(?:,\\s*when\\s+sharing\\s+a\\s+room)?\\)";
    const rateUnit = `(?:${traveler}(?:${period})?|child(?:ren)?${period}${childAge})`;
    const travelerRate = new RegExp(`^(?:${currency}\\s*${amount}|${amount}\\s*${currency})\\s*(?:/\\s*|per\\s+|на\\s+)${rateUnit}\\s*$`, "i");
    // A separator inside a qualifier does not start a new tariff or service.
    const boundaries = new RegExp(`[();]|(?<!\\d),(?!\\s*${fee})|(?<=\\d),(?!\\d|\\s*${fee})`, "gi");
    const clauses = [];
    let start = 0;
    let depth = 0;
    for (const { 0: boundary, index } of raw.matchAll(boundaries)) {
      if (boundary === "(") depth += 1;
      else if (boundary === ")") depth = Math.max(0, depth - 1);
      else if (depth === 0) {
        clauses.push({ start, end: index, value: raw.slice(start, index).trim() });
        start = index + 1;
      }
    }
    clauses.push({ start, end: raw.length, value: raw.slice(start).trim() });
    const names = { breakfast: "(?:breakfast|закуска(?:та)?)", dinner: "(?:dinner|вечеря(?:та)?)" };
    const result = {};
    for (const [name, noun] of Object.entries(names)) {
      const other = names[name === "breakfast" ? "dinner" : "breakfast"];
      const group = `(?:${noun}(?:\\s+(?:and|и|&)\\s+${other})?|${other}\\s+(?:and|и|&)\\s+${noun})`;
      const evidence = [];
      for (const [index, { start, value: clause }] of clauses.entries()) {
        if (!new RegExp(noun, "i").test(clause)) continue;
        const has = pattern => new RegExp(pattern, "i").test(clause);
        const link = "\\s+(?:(?:is|are|е|са)\\s+)?";
        let state = "declared";
        if (has(`${group}${link}(?:(?:available|included|се\\s+предлага|включен[аои])(?:\\s*,\\s*|\\s+))?${fee}`) || has(`(?:доплащане|extra charge|additional charge)\\s+(?:за\\s+)?${group}`)) state = "paid";
        else if (has(`(?:no|without|без)\\s+(?:включен[аои]\\s+)?${group}`) || has(`${group}${link}(?:not\\s+included|не\\s+(?:е\\s+)?включен[аои])`)) state = "excluded";
        else if (has(`(?:възможна|непотвърдена|possible|unconfirmed)\\s+${group}`) || has(`${group}${link}(?:available|on request|not confirmed|за потвърждение|подлежи на потвърждение)`)) state = "uncertain";
        else if (has(`(?:included|включен[аои])\\s+${group}`) || has(`${group}${link}(?:included|включен[аои])`)) state = "included";
        let last = index;
        // A complete adjacent traveler rate continues the explicit fee, across either separator.
        if (state === "paid") {
          while (travelerRate.test(clauses[last + 1]?.value || "")) last += 1;
        }
        evidence.push({ state, clause: raw.slice(start, clauses[last].end).trim() });
      }
      if (evidence.length) {
        const state = evidence[0].state;
        result[name] = {
          state: evidence.every(item => item.state === state) ? state : "uncertain",
          clauses: evidence.map(item => item.clause)
        };
      }
    }
    return result;
  }

  function mealServiceConditions(value) {
    return Object.fromEntries(Object.entries(mealServiceEvidence(value)).map(([name, evidence]) => [name, evidence.state]));
  }

  function paidMealText(value, meals = Object.values(mealServiceEvidence(value))) {
    const raw = text(value, "");
    if (!meals.some(meal => meal.state === "paid")) return raw;
    const clauses = [...new Set(meals.flatMap(meal => meal.clauses))];
    const normalizeSeparators = source => source.replace(/\s*[,;]\s*/g, ",");
    const normalized = normalizeSeparators(raw);
    clauses.sort((a, b) => normalized.indexOf(normalizeSeparators(a)) - normalized.indexOf(normalizeSeparators(b)));
    const projected = clauses.join("; ");
    return normalizeSeparators(projected) === normalized ? raw : projected;
  }

  function compactMealLabel(value) {
    const raw = text(value, "");
    if (!raw) return "Хранене за потвърждение";
    const meals = Object.values(mealServiceEvidence(raw));
    const services = meals.map(meal => meal.state);
    // Keep the actual paid/mixed condition, including any visible charge amount.
    if (services.includes("paid")) return localizeClientText(paidMealText(raw, meals));
    if (services.includes("excluded") && services.includes("included")) return localizeClientText(raw);
    if (services.includes("uncertain")) return services.includes("included") ? localizeClientText(raw) : "Хранене за потвърждение";
    // Qualifiers and exclusions take precedence over board-plan keywords.
    if (/възмож|вероят|непотвърден|не е потвърден|за потвърждение|подлежи на потвърждение|по заявка|според видим|при запитване|срещу (?:допълнително )?заплащане|доплащане|may|might|possible|unconfirmed|not confirmed|subject to|on request|extra charge|additional charge|not included|without breakfast|no breakfast|не е включен|не са включен/i.test(raw)) return "Хранене за потвърждение";
    if (/room\s*only|no meals?|без (?:включен[оаи] )?(?:хранене|изхранване|закуска)/i.test(raw)) return "Без включено хранене";
    if (/all\s*inclusive|всичко включено/i.test(raw)) return "All Inclusive";
    if (/half\s*board|полупансион/i.test(raw)) return "Полупансион";
    if (/full\s*board|пълен пансион/i.test(raw)) return "Пълен пансион";
    if (/(?:breakfast|закуска)/i.test(raw) && /(?:dinner|вечеря)/i.test(raw)) return "Закуска и вечеря";
    if (/breakfast|закуска/i.test(raw)) return "Закуска";
    if (/room\s*only|без хранене/i.test(raw)) return "Без включено хранене";
    return raw.length > 34 ? "Хранене за потвърждение" : localizeClientText(raw);
  }

  function resolvedMealPlan(hotel = {}) {
    return compactMealLabel(hotel.meal || hotel.board);
  }

  function mealSafeDescription(hotel = {}) {
    const description = text(hotel.description, "");
    const breakfast = mealServiceConditions(hotel.meal || hotel.board).breakfast;
    if (!["paid", "excluded", "uncertain"].includes(breakfast) && !["Хранене за потвърждение", "Без включено хранене"].includes(resolvedMealPlan(hotel))) return description;
    return description.replace(/(?:включен[аои]?\s+(?:безплатн[аои]?\s+)?(?:закуска(?:\s+и\s+вечеря)?|изхранване)|закуска(?:та)?\s+е\s+включена(?:\s+в цената)?|(?:breakfast|meals?)\s+included|included\s+breakfast)/gi,
      (match, offset, source) => /(?:не е|не са|not)\s*$/i.test(source.slice(0, offset)) ? match : "Изхранването е за потвърждение");
  }

  function numericStars(hotel = {}) {
    // Only the dedicated star-category field is authoritative; review scores and
    // free-text categories are not evidence of an official hotel classification.
    const value = hotel.stars;
    if (typeof value !== "string" && typeof value !== "number") return "";
    const raw = String(value).trim();
    return /^[1-5]$/.test(raw) ? raw : "";
  }

  function dateRangeNights(value = "") {
    const matches = String(value || "").match(/\d{4}-\d{2}-\d{2}/g) || [];
    if (matches.length < 2) return "";
    const start = new Date(`${matches[0]}T00:00:00Z`);
    const end = new Date(`${matches[1]}T00:00:00Z`);
    const diff = Math.round((end - start) / 86400000);
    return Number.isFinite(diff) && diff > 0 ? `${diff} нощувки` : "";
  }

  function optionPackageTotal(hotel = {}, input = {}) {
    const pricing = input.pricing || {};
    const flightAmount = amount(pricing.flightAmount || input.flight?.price);
    const hotelAmount = amount(hotel.price);
    const transferAmount = amount(pricing.transferAmount || input.transfer?.price);
    const marginPercent = amount(pricing.marginPercent);
    const baseAmount = flightAmount + hotelAmount + transferAmount;
    const adjustment = Number(pricing.packageAdjustmentAmount);
    if (baseAmount <= 0) return amount(pricing.totalAmount);
    return (baseAmount * (1 + marginPercent / 100)) + (Number.isFinite(adjustment) ? adjustment : 0);
  }

  function optionPositionSummary(hotel = {}, hotelOptions = [], input = {}) {
    const selectedPrice = optionPackageTotal(hotel, input) || amount(hotel.price);
    const optionPrices = hotelOptions
      .map((option) => optionPackageTotal(option, input) || amount(option.price))
      .filter((price) => price > 0);
    if (!selectedPrice || optionPrices.length < 2) return "";
    const lowerCount = optionPrices.filter((price) => selectedPrice < price).length;
    const higherCount = optionPrices.filter((price) => selectedPrice > price).length;
    const optionCountText = hotelOptions.length === 6 ? "шестте" : String(hotelOptions.length);
    if (lowerCount === hotelOptions.length - 1 && hotelOptions.length >= 2) return `Това е най-достъпният от ${optionCountText} сравнени варианта.`;
    if (lowerCount === 1) return "Цената е по-ниска от един от сравняваните варианти.";
    if (lowerCount > 1) return `Цената е по-ниска от ${lowerCount} от сравняваните варианти.`;
    if (higherCount === 0) return "Това е най-ниската цена сред показаните варианти.";
    return "";
  }

  function supportedRecommendationReasons(input = {}, selectedHotel = {}, hotelOptions = []) {
    const reasons = [];
    const add = (value) => {
      const cleaned = text(value, "");
      if (cleaned && !reasons.includes(cleaned)) reasons.push(cleaned);
    };
    const stars = numericStars(selectedHotel);
    add(optionPositionSummary(selectedHotel, hotelOptions, input));
    if (stars) add(`Хотелът е с категория ${stars} звезди.`);
    if (selectedHotel.room || selectedHotel.roomType) add(`Стая: ${localizeClientText(selectedHotel.room || selectedHotel.roomType)}.`);
    if (selectedHotel.meal || selectedHotel.board || reasons.length) add(`Изхранване: ${resolvedMealPlan(selectedHotel)}.`);
    if (input.client?.travelers) add(`Офертата е подготвена за ${text(input.client.travelers)} пътуващи.`);
    if (input.client?.travelDates || input.destination?.requested) add(`Период: ${localizeClientText(input.client?.travelDates || input.destination?.requested)}`);
    if (input.transfer?.included || input.transfer?.type || input.transfer?.status || input.transfer?.price > 0) add("Има данни за трансфер в офертата.");
    if (selectedHotel.area || selectedHotel.location || selectedHotel.city) add(`Локация: ${localizeClientText(selectedHotel.area || selectedHotel.location || selectedHotel.city)}.`);
    if (selectedHotel.reviewScore || selectedHotel.ratingText || selectedHotel.reviews) add(`Има подадени данни за оценка/ревю: ${localizeClientText(selectedHotel.reviewScore || selectedHotel.ratingText || selectedHotel.reviews)}.`);
    if (selectedHotel.cancellation || selectedHotel.bookingConditions || selectedHotel.conditions) add(`Условия: ${localizeClientText(selectedHotel.cancellation || selectedHotel.bookingConditions || selectedHotel.conditions)}.`);
    const amenities = [
      ...(Array.isArray(selectedHotel.amenities) ? selectedHotel.amenities : []),
      ...(Array.isArray(selectedHotel.highlights) ? selectedHotel.highlights : [])
    ].map((item) => text(item, "")).filter(Boolean);
    amenities.slice(0, 2).forEach((item) => add(`Посочено удобство: ${localizeClientText(item)}.`));
    return reasons.slice(0, 4);
  }

  function hotelIdentity(hotel = {}, index = 0) {
    return text(
      hotel.id ||
      hotel.hotelId ||
      hotel.optionId ||
      hotel.sourceId ||
      hotel.url ||
      hotel.websiteUrl ||
      hotel.name,
      `hotel-option-${index + 1}`
    );
  }

  function selectedHotelIndex(hotelOptions = [], activeHotel = {}, input = {}) {
    const explicitIndex = Number(
      input.selectedHotelIndex ??
      input.selectedHotel?.index ??
      input.selection?.selectedHotelIndex ??
      input.selection?.hotelIndex
    );
    if (Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < hotelOptions.length) {
      return explicitIndex;
    }
    const selectedIndex = hotelOptions.findIndex((hotel) => hotel?.selected);
    if (selectedIndex >= 0) return selectedIndex;
    const activeName = String(input.selectedHotel?.name || activeHotel?.name || "").trim();
    if (activeName) {
      const matchingIndex = hotelOptions.findIndex((hotel) => String(hotel?.name || "").trim() === activeName);
      if (matchingIndex >= 0) return matchingIndex;
    }
    return 0;
  }

  function selectedOptionPayload(hotel = {}, index, currency, input, displayedTotal) {
    const label = `Хотелска опция ${index + 1}`;
    const hotelOnly = amount(hotel.price);
    const total = displayedTotal ?? (optionPackageTotal(hotel, input) || hotelOnly);
    const name = text(hotel.name, label);
    const priceDisplay = money(total, currency);
    const hotelPriceDisplay = money(hotelOnly, currency);
    const whatsappPhone = String(input.contact?.whatsappPhone || "359885078980").replace(/[^\d]/g, "");
    const mealPlan = resolvedMealPlan(hotel);
    const dates = localizeClientText(input.client?.travelDates || input.destination?.requested || "Дати за потвърждение");
    const message = [`Предпочитам ${name} - обща пакетна цена ${priceDisplay}; хранене: ${mealPlan}`, `Период: ${dates}`];
    if (input.contact?.clientOfferUrl && URL.canParse(input.contact.clientOfferUrl)) {
      const offerUrl = new URL(input.contact.clientOfferUrl);
      offerUrl.searchParams.set("selectedHotelId", hotelIdentity(hotel, index));
      message.push(offerUrl.href);
    }
    const preferMessage = encodeURIComponent(message.join("\n"));

    return {
      label,
      name,
      priceDisplay,
      hotelPriceDisplay,
      mealPlan,
      whatsappUrl: `https://wa.me/${whatsappPhone}?text=${preferMessage}`
    };
  }

  function heroFacts(input = {}, selectedPayload = {}, selectedHotel = {}, travelDates = "") {
    const facts = [];
    const add = (label, value, key = "") => {
      const cleaned = text(value, "");
      if (cleaned) facts.push([label, localizeClientText(cleaned), key]);
    };
    add("Дестинация", input.destination?.name || input.destination?.requested || input.content?.heroTitle, "destination");
    add("Категория", numericStars(selectedHotel) ? `${numericStars(selectedHotel)} звезди` : "", "stars");
    add("Дати", travelDates);
    add("Период", dateRangeNights(travelDates));
    add("Пътуващи", input.client?.travelers);
    add("Стая", selectedHotel.room || selectedHotel.roomType, "room");
    add("Хранене", resolvedMealPlan(selectedHotel), "meal");
    add("Локация", selectedHotel.area || selectedHotel.location || selectedHotel.city, "area");
    return facts.slice(0, 9);
  }

  function resolveSelectedHotel(input = {}, options = {}) {
    const hotelOptions = asArray(input.hotelOptions).length ? asArray(input.hotelOptions) : (input.hotel ? [input.hotel] : []);
    const explicitSelectedHotelId = text(options.selectedHotelId ?? input.selectedHotelId ?? input.selection?.selectedHotelId, "");
    if (explicitSelectedHotelId) {
      const index = hotelOptions.findIndex((hotel, hotelIndex) => hotelIdentity(hotel, hotelIndex) === explicitSelectedHotelId);
      if (index < 0) {
        const error = new Error(`Invalid selectedHotelId: ${explicitSelectedHotelId}`);
        error.code = "GT63_PRINT_INVALID_SELECTED_HOTEL_ID";
        error.status = 400;
        throw error;
      }
      return {
        index,
        hotel: hotelOptions[index],
        hotelOptions,
        selectedHotelId: explicitSelectedHotelId,
        explicit: true,
        fallbackUsed: false
      };
    }

    const activeHotel = input.selectedHotel || hotelOptions.find((hotel) => hotel?.selected) || input.hotel || hotelOptions[0] || {};
    const index = selectedHotelIndex(hotelOptions, activeHotel, input);
    const selectedHotel = hotelOptions[index] || activeHotel || {};
    return {
      index,
      hotel: selectedHotel,
      hotelOptions,
      selectedHotelId: hotelIdentity(selectedHotel, index),
      explicit: false,
      fallbackUsed: !input.selectedHotel && !hotelOptions.some((hotel) => hotel?.selected) && !input.hotel
    };
  }

  function resolvePrintModeContract(input = {}, options = {}) {
    const mode = text(options.mode || input.printMode || "selected", "selected");
    if (!VALID_PRINT_MODES.has(mode)) {
      const error = new Error(`Unsupported print mode: ${mode}`);
      error.code = "GT63_PRINT_INVALID_MODE";
      error.status = 400;
      throw error;
    }
    const selection = resolveSelectedHotel(input, options);
    return {
      mode,
      selectedHotelId: selection.selectedHotelId,
      selectedHotelIndex: selection.index,
      selectedHotel: selection.hotel,
      hotelOptions: selection.hotelOptions,
      explicitSelectedHotelId: selection.explicit,
      fallbackUsed: selection.fallbackUsed
    };
  }

  const unconfirmedMealNotice = "Изхранването за избрания хотел подлежи на потвърждение преди резервация.";
  const trustedNotices = new WeakMap();

  function setTrustedNotices(input, notices) {
    trustedNotices.set(input, notices);
  }

  function presentationNotices(input = {}, options = {}) {
    const selection = resolveSelectedHotel(input, options);
    const comparison = (options.mode || input.printMode) === "comparison";
    return (trustedNotices.get(input) || []).filter(notice=>options.allHotels || !notice.parameters?.hotelId || (comparison ? selection.hotelOptions.some((hotel,index)=>hotelIdentity(hotel,index) === notice.parameters.hotelId) : notice.parameters.hotelId === selection.selectedHotelId)).map(notice => {
      const hotelId = notice.parameters?.hotelId || "";
      let message = notice.message;
      if (comparison && hotelId) {
        const hotel = selection.hotelOptions.find((item,index)=>hotelIdentity(item,index) === hotelId);
        const prefix = message.match(/^\[(?:INFO|WARNING|CRITICAL)\]\s*/)?.[0] || "";
        message = `${prefix}${hotel?.name || hotelId}: ${message.slice(prefix.length)}`;
      }
      return {text:message, hotelId,
        level: notice.severity === "BLOCKING" ? "blocking" : notice.severity === "INFO" ? "info" : "warning"};
    });
  }

  function baggageLabel(value) {
    const pending = "Багажът подлежи на потвърждение";
    if (value && typeof value === "object") {
      if (value.confirmed !== true) return pending;
      const parts = [];
      for (const [key,label] of [["checked","Регистриран багаж"],["cabin","Ръчен багаж"],["personalItem","Личен багаж"]]) {
        const detail = value[key];
        if (!detail || typeof detail !== "object" || detail.confirmed === false) continue;
        const facts = [];
        if (Number.isInteger(detail.pieces) && detail.pieces >= 0) facts.push(`${detail.pieces} бр.`);
        if (typeof detail.weightKg === "number" && Number.isFinite(detail.weightKg) && detail.weightKg > 0) facts.push(`${detail.weightKg} кг`);
        if (facts.length) parts.push(`${label}: ${facts.join(", ")}`);
      }
      return parts.join("; ") || pending;
    }
    const raw = typeof value === "string" ? value.trim() : "";
    return !raw || /\[object Object\]|^(?:unknown|not specified|not provided|BusinessPrime|PrimeFly|(?:багаж )?за потвърждение|багажът подлежи на потвърждение|не е посочен[оа]?)$/i.test(raw) ? pending : raw;
  }

  function buildPresentationViewModel(input = {}, options = {}) {
    const contract = resolvePrintModeContract(input, options);
    const currency = input.pricing?.currency || "EUR";
    const selectedPayload = selectedOptionPayload(contract.selectedHotel, contract.selectedHotelIndex, currency, input);
    const travelDates = localizeClientText(input.client?.travelDates || input.destination?.requested || "");

    return {
      input,
      currency,
      travelDates,
      contract,
      hotelOptions: contract.hotelOptions,
      selectedHotel: contract.selectedHotel,
      selectedHotelIndex: contract.selectedHotelIndex,
      selectedPayload,
      selectedMealPlan: resolvedMealPlan(contract.selectedHotel),
      selectedRecommendationReasons: supportedRecommendationReasons(input, contract.selectedHotel, contract.hotelOptions),
      heroFacts: heroFacts(input, selectedPayload, contract.selectedHotel, travelDates)
    };
  }

  return {
    amount,
    baggageLabel,
    presentationNotices,
    setTrustedNotices,
    unconfirmedMealNotice,
    buildPresentationViewModel,
    compactMealLabel,
    mealServiceConditions,
    mealServiceEvidence,
    paidMealText,
    mealSafeDescription,
    dateRangeNights,
    heroFacts,
    hotelIdentity,
    localizeClientText,
    money,
    numericStars,
    optionPackageTotal,
    optionPositionSummary,
    resolvePrintModeContract,
    resolveSelectedHotel,
    resolvedMealPlan,
    hotelOccupancyLabel,
    selectedHotelIndex,
    selectedOptionPayload,
    supportedRecommendationReasons,
    text
  };
});


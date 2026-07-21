"use strict";

(function exposePresentationViewModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63PresentationViewModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPresentationViewModel() {
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
    return `${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || "EUR"}`;
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
      .replace(/\s+г\.\s*-\s*/g, " г. – ")
      .replace(/\bTokyo\b/g, "Токио")
      .replace(/\bJapan\b/g, "Япония")
      .replace(/Дизайнирано пушене/gi, "Зона за пушачи")
      .replace(/Designated smoking area/gi, "Зона за пушачи");
  }

  function compactMealLabel(value) {
    const raw = text(value, "");
    if (!raw) return "Хранене за потвърждение";
    if (/all\s*inclusive|всичко включено/i.test(raw)) return "All Inclusive";
    if (/half\s*board|полупансион/i.test(raw)) return "Полупансион";
    if (/full\s*board|пълен пансион/i.test(raw)) return "Пълен пансион";
    if (/breakfast|закуска/i.test(raw)) return "Закуска";
    if (/room\s*only|без хранене/i.test(raw)) return "Без включено хранене";
    return raw.length > 34 ? "Хранене за потвърждение" : localizeClientText(raw);
  }

  function resolvedMealPlan(hotel = {}) {
    return compactMealLabel(hotel.meal || hotel.board);
  }

  function numericStars(hotel = {}) {
    const raw = String(hotel.stars || hotel.category || hotel.rating || "").trim();
    const match = raw.match(/[1-5](?:[.,]\d)?/);
    return match ? match[0].replace(".", ",") : "";
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
    if (baseAmount <= 0) return 0;
    return baseAmount + (baseAmount * (marginPercent / 100));
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

  function selectedOptionPayload(hotel = {}, index, currency, input) {
    const label = `Хотелска опция ${index + 1}`;
    const hotelOnly = amount(hotel.price);
    const total = optionPackageTotal(hotel, input) || hotelOnly;
    const name = text(hotel.name, label);
    const priceDisplay = money(total, currency);
    const hotelPriceDisplay = money(hotelOnly, currency);
    const whatsappPhone = String(input.contact?.whatsappPhone || "359885078980").replace(/[^\d]/g, "");
    const mealPlan = resolvedMealPlan(hotel);
    const preferMessage = encodeURIComponent(`Предпочитам ${name} - обща пакетна цена ${priceDisplay}; хранене: ${mealPlan}`);

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
    buildPresentationViewModel,
    compactMealLabel,
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
    selectedHotelIndex,
    selectedOptionPayload,
    supportedRecommendationReasons,
    text
  };
});

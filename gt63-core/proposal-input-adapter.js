"use strict";

(function exposeProposalInputAdapter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63ProposalInputAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProposalInputAdapter() {
  const flightDateSanitizer = typeof require === "function"
    ? require("./flight-date-sanitizer")
    : (typeof globalThis !== "undefined" ? globalThis.GT63FlightDateSanitizer : null);

  const PROPOSAL_INPUT_VERSION = "1.0";
  const MODE = "GT63_LUXURY_PROPOSAL_INPUT";
  const PROPOSAL_INPUT_KEYS = [
    "blockingIssues",
    "client",
    "content",
    "destination",
    "flight",
    "hotel",
    "hotelOptions",
    "mode",
    "pricing",
    "proposalInputVersion",
    "proposalTemplate",
    "readiness",
    "source",
    "warnings"
  ];

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function nullableText(value) {
    const text = cleanText(value);
    return text || null;
  }

  function isPhoneLike(value) {
    const text = cleanText(value);
    const digits = text.replace(/\D/g, "");
    return digits.length >= 7 && digits.length >= Math.max(7, Math.round(text.length * 0.55));
  }

  function nullableDestination(value) {
    const text = cleanText(value);
    if (!text) return null;
    if (isPhoneLike(text)) return null;
    if (/^[+\d\s().-]+$/.test(text)) return null;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) return null;
    return text;
  }

  function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function percent(value, fallback = 5) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function segment(segment = {}) {
    return {
      airline: nullableText(segment.airline),
      flightNumber: nullableText(segment.flightNumber),
      from: nullableText(segment.from),
      to: nullableText(segment.to),
      departure: nullableText(segment.departure),
      arrival: nullableText(segment.arrival),
      duration: nullableText(segment.duration)
    };
  }

  function selectedHotel(model = {}) {
    const options = asArray(model.hotelOptions).filter(Boolean);
    return options.find((hotel) => hotel?.selected) || model.hotel || options[0] || null;
  }

  function totalPrice(flight, hotel, context = {}) {
    const flightAmount = amount(flight?.price);
    const hotelAmount = amount(hotel?.price);
    const baseAmount = (flightAmount || 0) + (hotelAmount || 0);
    const marginPercent = percent(context.marginPercent);
    const marginAmount = baseAmount > 0 ? baseAmount * (marginPercent / 100) : 0;
    const total = baseAmount + marginAmount;
    return {
      currency: "EUR",
      flightAmount,
      hotelAmount,
      baseAmount: baseAmount > 0 ? baseAmount : null,
      marginPercent,
      marginAmount: marginAmount > 0 ? marginAmount : null,
      totalAmount: total > 0 ? total : null
    };
  }

  function destinationName(model, context) {
    const hotel = selectedHotel(model);
    return nullableDestination(context.destination)
      || nullableDestination(hotel?.area)
      || nullableDestination(hotel?.name)
      || nullableDestination(model.flight?.route)
      || "Travel Proposal";
  }

  function buildFlight(flight) {
    if (!flight) return null;
    return {
      airline: nullableText(flight.airline),
      route: nullableText(flight.route),
      outbound: nullableText(flight.departure),
      inbound: nullableText(flight.arrival),
      baggage: nullableText(flight.baggage),
      notes: nullableText(flight.notes),
      price: amount(flight.price),
      currency: "EUR",
      outboundSegments: asArray(flight.outboundSegments).map(segment),
      inboundSegments: asArray(flight.inboundSegments).map(segment)
    };
  }

  function buildHotel(hotel) {
    if (!hotel) return null;
    const imageUrls = [
      ...asArray(hotel.imageUrls),
      ...asArray(hotel.images),
      hotel.image,
      hotel.imageUrl,
      hotel.photo,
      hotel.thumbnail
    ].map(cleanText).filter(Boolean);

    return {
      name: nullableText(hotel.name),
      stars: nullableText(hotel.stars),
      area: nullableText(hotel.area),
      room: nullableText(hotel.room),
      meal: nullableText(hotel.meal),
      roomsLeft: nullableText(hotel.roomsLeft),
      price: amount(hotel.price),
      currency: "EUR",
      description: nullableText(hotel.description),
      imageUrls
    };
  }

  function buildContent(model, context) {
    const title = destinationName(model, context);
    const hotel = selectedHotel(model);
    const hotelName = nullableText(hotel?.name);
    const room = nullableText(hotel?.room);
    const flightRoute = nullableText(model.flight?.route);
    const highlights = [
      hotelName ? `Stay at ${hotelName}` : null,
      room ? `Room: ${room}` : null,
      flightRoute ? `Flights: ${flightRoute}` : null
    ].filter(Boolean);

    return {
      heroTitle: title,
      heroSubtitle: hotelName
        ? `A curated private travel proposal for ${title}.`
        : "A curated private travel proposal.",
      highlights,
      primaryCta: "Review proposal"
    };
  }

  function buildProposalTemplate(model) {
    const template = asObject(model.proposalTemplate);
    const selected = nullableText(template.selected) || nullableText(template.recommended) || "cathedral";
    const recommended = nullableText(template.recommended) || selected;
    const source = nullableText(template.source) || (selected === recommended ? "resolver" : "agent_override");

    return {
      recommended,
      selected,
      source,
      reason: nullableText(template.reason)
    };
  }

  function assertProposalInput(input) {
    const keys = Object.keys(input || {}).sort();
    if (JSON.stringify(keys) !== JSON.stringify(PROPOSAL_INPUT_KEYS)) {
      throw new Error("Unsupported proposal input shape");
    }
    if (input.proposalInputVersion !== PROPOSAL_INPUT_VERSION) {
      throw new Error("Unsupported proposal input version");
    }
    if (input.mode !== MODE) {
      throw new Error("Unsupported proposal input mode");
    }
    if (!["ready", "review"].includes(input.readiness)) {
      throw new Error("Unsupported proposal input readiness");
    }
    if (!Array.isArray(input.warnings) || !Array.isArray(input.blockingIssues)) {
      throw new Error("Unsupported proposal input issue arrays");
    }
    return input;
  }

  function buildProposalInputFromProductModel(model = {}, context = {}) {
    const safeContext = asObject(context);
    const sanitizedModel = flightDateSanitizer?.sanitizeProductModelFlightDates
      ? flightDateSanitizer.sanitizeProductModelFlightDates(model, safeContext)
      : model;
    const productModel = asObject(sanitizedModel);
    const flight = buildFlight(productModel.flight);
    const activeHotel = selectedHotel(productModel);
    const hotel = buildHotel(activeHotel);
    const hotelOptions = (asArray(productModel.hotelOptions).length ? asArray(productModel.hotelOptions) : (activeHotel ? [activeHotel] : []))
      .map(buildHotel)
      .filter(Boolean);

    return assertProposalInput({
      proposalInputVersion: PROPOSAL_INPUT_VERSION,
      mode: MODE,
      readiness: productModel.readiness === "ready" ? "ready" : "review",
      blockingIssues: asArray(productModel.blockingIssues).map(cleanText).filter(Boolean),
      warnings: asArray(productModel.warnings).map(cleanText).filter(Boolean),
      client: {
        name: nullableText(safeContext.clientName),
        travelDates: nullableText(safeContext.travelDates),
        travelers: nullableText(safeContext.travelers)
      },
      destination: {
        name: destinationName(productModel, safeContext),
        requested: nullableDestination(safeContext.destination)
      },
      flight,
      hotel,
      hotelOptions,
      pricing: totalPrice(productModel.flight, activeHotel, safeContext),
      proposalTemplate: buildProposalTemplate(productModel),
      content: buildContent(productModel, safeContext),
      source: {
        generatedFrom: "GT63_CORE_PRODUCT_MODEL",
        rendererTarget: "LUXURY_V11"
      }
    });
  }

  return {
    MODE,
    PROPOSAL_INPUT_VERSION,
    buildProposalInputFromProductModel,
    assertProposalInput
  };
});

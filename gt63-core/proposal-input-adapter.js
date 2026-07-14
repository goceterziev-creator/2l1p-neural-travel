"use strict";

(function exposeProposalInputAdapter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63ProposalInputAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProposalInputAdapter() {
  const PROPOSAL_INPUT_VERSION = "1.0";
  const MODE = "GT63_LUXURY_PROPOSAL_INPUT";
  const PROPOSAL_INPUT_KEYS = [
    "blockingIssues",
    "client",
    "content",
    "destination",
    "flight",
    "hotel",
    "mode",
    "pricing",
    "proposalInputVersion",
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

  function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
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

  function totalPrice(flight, hotel) {
    const flightAmount = amount(flight?.price);
    const hotelAmount = amount(hotel?.price);
    const total = (flightAmount || 0) + (hotelAmount || 0);
    return {
      currency: "EUR",
      flightAmount,
      hotelAmount,
      totalAmount: total > 0 ? total : null
    };
  }

  function destinationName(model, context) {
    return nullableText(context.destination)
      || nullableText(model.hotel?.area)
      || nullableText(model.hotel?.name)
      || nullableText(model.flight?.route)
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
    const hotelName = nullableText(model.hotel?.name);
    const room = nullableText(model.hotel?.room);
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
    const productModel = asObject(model);
    const safeContext = asObject(context);
    const flight = buildFlight(productModel.flight);
    const hotel = buildHotel(productModel.hotel);

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
        requested: nullableText(safeContext.destination)
      },
      flight,
      hotel,
      pricing: totalPrice(productModel.flight, productModel.hotel),
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

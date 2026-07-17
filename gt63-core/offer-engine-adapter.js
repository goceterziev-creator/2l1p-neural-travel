"use strict";

(function exposeOfferEngineAdapter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63OfferEngineAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createOfferEngineAdapter() {
  const flightDateSanitizer = typeof require === "function"
    ? require("./flight-date-sanitizer")
    : (typeof globalThis !== "undefined" ? globalThis.GT63FlightDateSanitizer : null);

  function cleanText(value) {
    const text = String(value ?? "").trim();
    return /^(null|undefined)$/i.test(text) ? "" : text;
  }

  function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function percent(value, fallback = 5) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function firstText(...values) {
    for (const value of values) {
      const text = cleanText(value);
      if (text) return text;
    }
    return "";
  }

  function isPhoneLike(value) {
    const text = cleanText(value);
    const digits = text.replace(/\D/g, "");
    return digits.length >= 7 && digits.length >= Math.max(7, Math.round(text.length * 0.55));
  }

  function safeDestination(...values) {
    for (const value of values) {
      const text = cleanText(value);
      if (!text) continue;
      if (isPhoneLike(text)) continue;
      if (/^[+\d\s().-]+$/.test(text)) continue;
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) continue;
      return text;
    }
    return "Travel Proposal";
  }

  function segmentRoute(segments) {
    const list = asArray(segments);
    if (!list.length) return "";
    return [list[0].from, ...list.map((segment) => segment.to)].map(cleanText).filter(Boolean).join(" -> ");
  }

  function segmentSummary(segment) {
    const fromTo = [segment.from, segment.to].map(cleanText).filter(Boolean).join(" -> ");
    const times = [segment.departure, segment.arrival].map(cleanText).filter(Boolean).join(" - ");
    const via = cleanText(segment.duration) ? ` (${cleanText(segment.duration)})` : "";
    return [fromTo, times].filter(Boolean).join(", ") + via;
  }

  function segmentsSummary(segments) {
    return asArray(segments).map(segmentSummary).filter(Boolean).join("; ");
  }

  function flightNumbers(flight) {
    return [
      ...asArray(flight?.outboundSegments),
      ...asArray(flight?.inboundSegments)
    ].map((segment) => cleanText(segment.flightNumber)).filter(Boolean);
  }

  function offerRoute(flight) {
    if (!flight) return "";
    const outbound = segmentRoute(flight.outboundSegments);
    const inbound = segmentRoute(flight.inboundSegments);
    return firstText(flight.route, outbound && inbound ? `${outbound} / ${inbound}` : outbound || inbound);
  }

  function buildFlightNotes(flight, warnings) {
    const numbers = flightNumbers(flight);
    const notes = [
      numbers.length ? `Flight numbers: ${numbers.join(", ")}.` : "",
      cleanText(flight?.notes),
      asArray(warnings).length ? `Core warnings: ${asArray(warnings).join(" | ")}` : "",
      "Created from GT63 Core Workspace."
    ].filter(Boolean);
    return notes.join(" ");
  }

  function buildHotelImages(hotel) {
    return [
      ...asArray(hotel?.imageUrls),
      ...asArray(hotel?.images),
      hotel?.imageUrl,
      hotel?.image,
      hotel?.photo,
      hotel?.thumbnail
    ].map(cleanText).filter(Boolean);
  }

  function cloneSegment(segment = {}) {
    return {
      from: cleanText(segment.from),
      to: cleanText(segment.to),
      departure: cleanText(segment.departure),
      arrival: cleanText(segment.arrival),
      duration: cleanText(segment.duration),
      flightNumber: cleanText(segment.flightNumber),
      airline: cleanText(segment.airline),
      class: cleanText(segment.class),
      transferBefore: cleanText(segment.transferBefore)
    };
  }

  function buildOfferFlights(flight, flightPrice) {
    if (!flight) return [];
    const outboundSegments = asArray(flight.outboundSegments).map(cloneSegment);
    const inboundSegments = asArray(flight.inboundSegments).map(cloneSegment);
    return [{
      airline: cleanText(flight.airline),
      route: offerRoute(flight),
      departure: firstText(flight.departure, segmentsSummary(outboundSegments)),
      arrival: firstText(flight.arrival, segmentsSummary(inboundSegments)),
      baggage: cleanText(flight.baggage),
      notes: buildFlightNotes(flight, []),
      price: flightPrice,
      outboundSegments,
      inboundSegments,
      segments: [...outboundSegments, ...inboundSegments]
    }];
  }

  function selectedHotel(model = {}) {
    const options = asArray(model.hotelOptions).filter(Boolean);
    return options.find((hotel) => hotel?.selected) || model.hotel || options[0] || null;
  }

  function buildOfferHotels(model = {}) {
    const selected = selectedHotel(model);
    const options = asArray(model.hotelOptions).length ? asArray(model.hotelOptions) : (selected ? [selected] : []);
    return options.map((hotel, index) => ({
      name: cleanText(hotel?.name),
      stars: cleanText(hotel?.stars),
      area: cleanText(hotel?.area),
      distance: cleanText(hotel?.distance),
      room: cleanText(hotel?.room),
      meal: cleanText(hotel?.meal),
      price: amount(hotel?.price),
      roomsLeft: cleanText(hotel?.roomsLeft),
      description: cleanText(hotel?.description),
      url: firstText(hotel?.url, hotel?.link, hotel?.bookingUrl),
      images: buildHotelImages(hotel),
      selected: options.some((item) => item?.selected) ? hotel?.selected === true : index === 0
    })).filter((hotel) => (
      hotel.name || hotel.stars || hotel.area || hotel.distance || hotel.room || hotel.meal ||
      hotel.price > 0 || hotel.roomsLeft || hotel.description || hotel.images.length
    ));
  }

  function buildOfferPayloadFromProductModel(model = {}, context = {}) {
    const safeModel = flightDateSanitizer?.sanitizeProductModelFlightDates
      ? flightDateSanitizer.sanitizeProductModelFlightDates(model, context)
      : model;
    const flight = safeModel.flight || null;
    const hotel = selectedHotel(safeModel);
    const hotels = buildOfferHotels(safeModel);
    const destination = safeDestination(context.destination, hotel?.area, hotel?.name, flight?.route);
    const travelDates = firstText(context.travelDates, flight?.departure, flight?.arrival);
    const flightPrice = amount(flight?.price);
    const hotelPrice = amount(hotel?.price);
    const offerFlights = buildOfferFlights(flight, flightPrice);

    return {
      clientName: firstText(context.clientName, "GT63 Client"),
      clientPhone: cleanText(context.clientPhone),
      destination,
      travelDates,
      guests: firstText(context.guests, context.travelers, "2 adults"),
      status: "draft",
      currency: "EUR",
      flightAirline: cleanText(flight?.airline),
      flightRoute: offerRoute(flight),
      flightDeparture: firstText(flight?.departure, segmentsSummary(flight?.outboundSegments)),
      flightArrival: firstText(flight?.arrival, segmentsSummary(flight?.inboundSegments)),
      flightBaggage: cleanText(flight?.baggage),
      flightNotes: buildFlightNotes(flight, safeModel.warnings),
      flightOutboundSegments: offerFlights[0]?.outboundSegments || [],
      flightInboundSegments: offerFlights[0]?.inboundSegments || [],
      flightSegments: offerFlights[0]?.segments || [],
      flights: offerFlights,
      hotelName: cleanText(hotel?.name),
      hotelArea: firstText(hotel?.area, destination),
      hotelRoom: cleanText(hotel?.room),
      hotelMeal: cleanText(hotel?.meal),
      hotelRoomsLeft: cleanText(hotel?.roomsLeft),
      hotelDescription: cleanText(hotel?.description),
      hotelImages: buildHotelImages(hotel),
      hotels,
      proposalTemplate: safeModel.proposalTemplate || null,
      destinationDescription: `Curated proposal for ${destination}.`,
      notes: asArray(safeModel.warnings).join(" | "),
      flightPrice,
      hotelPrice,
      transferPrice: 0,
      markupPercent: percent(context.marginPercent),
      validForDays: 1
    };
  }

  return {
    buildOfferPayloadFromProductModel
  };
});

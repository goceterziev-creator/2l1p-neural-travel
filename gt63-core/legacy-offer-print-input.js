"use strict";

// Read-only compatibility for offers saved by the original operator form.
// Keep the separate print renderer and the stored client price authoritative.
function buildLegacyOfferPrintInput(offer = {}) {
  const list = value => Array.isArray(value) ? value.filter(Boolean) : [];
  const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const flights = list(offer.flights).length ? list(offer.flights) : list(offer.flightOptions);
  const hotels = list(offer.hotels).length ? list(offer.hotels) : list(offer.hotelOptions);
  const options = hotels.map((hotel, index) => ({
    ...hotel, id: hotel.id || `legacy-hotel-${index + 1}`,
    selected: hotels.some(item => item.selected) ? Boolean(hotel.selected) : index === 0
  }));
  const selected = options.find(hotel => hotel.selected) || options[0] || null;
  const join = key => [...new Set(flights.map(flight => flight[key]).filter(Boolean))].join(" / ");
  const flightAmount = amount(offer.flightPrice) || flights.reduce((sum, flight) => sum + amount(flight.price), 0);
  const hotelAmount = selected ? amount(selected.price) : amount(offer.hotelPrice);
  const transferAmount = amount(offer.transferPrice);
  const marginPercent = amount(offer.markupPercent);
  const baseAmount = flightAmount + hotelAmount + transferAmount;
  const calculated = baseAmount * (1 + marginPercent / 100);
  const finalAmount = amount(offer.finalPrice) > 0 ? amount(offer.finalPrice) : calculated;

  return {
    proposalInputVersion: "1.0", mode: "GT63_LUXURY_PROPOSAL_INPUT",
    readiness: "review", blockingIssues: [], warnings: list(offer.validationWarnings),
    client: { name: offer.clientName || "", travelDates: offer.travelDates || "", travelers: offer.guests || "" },
    destination: { name: offer.destination || "", requested: offer.destination || "" },
    flight: flights.length ? {
      airline: join("airline"), route: join("route"), baggage: join("baggage"), notes: join("notes"),
      outbound: join("departure"), inbound: join("arrival"), price: flightAmount,
      outboundSegments: flights.flatMap(flight => list(flight.outboundSegments)),
      inboundSegments: flights.flatMap(flight => list(flight.inboundSegments))
    } : null,
    hotel: selected, hotelOptions: options,
    transfer: transferAmount > 0 ? { price: transferAmount, status: "Според офертата" } : null,
    pricing: {
      currency: offer.currency || "EUR", flightAmount, hotelAmount, transferAmount, marginPercent,
      baseAmount, totalAmount: finalAmount,
      // A saved final override also applies consistently to comparison options.
      packageAdjustmentAmount: Number((finalAmount - calculated).toFixed(8))
    },
    proposalTemplate: { selected: "multi-hotel", recommended: "multi-hotel", source: "legacy_offer_print_adapter" },
    content: { heroTitle: offer.destination || "", heroSubtitle: offer.destinationDescription || "" },
    source: { generatedFrom: "AYA_SAVED_OFFER_PRINT_ADAPTER", offerId: offer.id || "" }
  };
}

module.exports = { buildLegacyOfferPrintInput };

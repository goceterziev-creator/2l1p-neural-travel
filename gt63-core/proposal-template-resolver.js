"use strict";

(function exposeProposalTemplateResolver(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63ProposalTemplateResolver = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProposalTemplateResolver() {
  const TEMPLATE_OPTIONS = [
    {
      value: "cathedral",
      label: "Cathedral",
      description: "Single-destination premium or resort proposal."
    },
    {
      value: "city-discovery",
      label: "City Discovery",
      description: "Single-city travel proposal with one primary stay."
    },
    {
      value: "multi-city",
      label: "Multi-City Journey",
      description: "Journey across multiple cities or itinerary stops."
    },
    {
      value: "multi-hotel",
      label: "Multi-Hotel Selector",
      description: "One destination with multiple accommodation options."
    }
  ];

  const TEMPLATE_VALUES = new Set(TEMPLATE_OPTIONS.map((option) => option.value));
  const CITY_DESTINATION_TERMS = [
    "tokyo",
    "токио",
    "paris",
    "париж",
    "rome",
    "рим",
    "lisbon",
    "лисабон",
    "new york",
    "ню йорк",
    "santiago",
    "сантяго",
    "barcelona",
    "барселона",
    "dubai",
    "дубай",
    "london",
    "лондон"
  ];

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function normalized(value) {
    return cleanText(value).toLowerCase();
  }

  function validTemplate(value) {
    return TEMPLATE_VALUES.has(value);
  }

  function selectedTemplate(model = {}) {
    const selected = cleanText(model?.proposalTemplate?.selected);
    return validTemplate(selected) ? selected : "";
  }

  function isCityDestination(model = {}) {
    const text = normalized([
      model.destination,
      model.destinationName,
      model.tripStyle,
      model.hotel?.area,
      model.hotel?.name,
      model.flight?.route
    ].filter(Boolean).join(" "));
    if (/\bcity\b|град/i.test(text)) return true;
    return CITY_DESTINATION_TERMS.some((term) => text.includes(term));
  }

  function resolveProposalTemplate(model = {}) {
    const hotelOptions = asArray(model.hotelOptions).filter(Boolean);
    const destinations = asArray(model.destinations).filter(Boolean);
    const itineraryStops = asArray(model.itineraryStops).filter(Boolean);

    let recommended = "cathedral";
    let reason = "Single destination with one primary accommodation.";

    if (itineraryStops.length > 1) {
      recommended = "multi-city";
      reason = "Multiple itinerary stops detected.";
    } else if (hotelOptions.length > 1) {
      recommended = "multi-hotel";
      reason = `${hotelOptions.length} accommodation options detected.`;
    } else if (destinations.length > 1) {
      recommended = "multi-city";
      reason = "Multiple destinations detected.";
    } else if (isCityDestination(model)) {
      recommended = "city-discovery";
      reason = "Single-city travel proposal detected.";
    }

    const selected = selectedTemplate(model) || recommended;
    const source = selected === recommended ? "resolver" : "agent_override";

    return {
      recommended,
      selected,
      source,
      reason: source === "resolver"
        ? reason
        : `Agent selected ${templateLabel(selected)} instead of ${templateLabel(recommended)}.`
    };
  }

  function templateLabel(value) {
    return TEMPLATE_OPTIONS.find((option) => option.value === value)?.label || value || "";
  }

  return {
    TEMPLATE_OPTIONS,
    resolveProposalTemplate,
    templateLabel
  };
});

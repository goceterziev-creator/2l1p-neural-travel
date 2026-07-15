"use strict";

(function exposeFlightDateSanitizer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63FlightDateSanitizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFlightDateSanitizer() {
  const MONTHS_EN = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function reviewedYears(context = {}) {
    return new Set(
      String(context.travelDates || "")
        .match(/\b20\d{2}\b/g)
        ?.map((year) => Number(year))
        .filter((year) => Number.isFinite(year) && year >= 2024 && year <= 2100) || []
    );
  }

  function shouldStripYear(year, allowedYears) {
    const parsed = Number(year);
    if (!Number.isFinite(parsed)) return false;
    if (!allowedYears || !allowedYears.size) return false;
    return !allowedYears.has(parsed);
  }

  function stripDisallowedIsoYear(value, allowedYears) {
    return String(value || "").replace(
      /\b(20\d{2})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}:\d{2}))?/g,
      (match, year, month, day, time) => {
        if (!shouldStripYear(year, allowedYears)) return match;
        const monthName = MONTHS_EN[Number(month) - 1] || month;
        return [Number(day), monthName, time].filter(Boolean).join(" ");
      }
    );
  }

  function stripDisallowedTextYear(value, allowedYears) {
    return String(value || "")
      .replace(
        /\b(\d{1,2})\s+([A-Za-z]+|януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)\s+(20\d{2})\b/gi,
        (match, day, month, year) => shouldStripYear(year, allowedYears) ? `${Number(day)} ${month}` : match
      )
      .replace(
        /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g,
        (match, day, month, year) => {
          if (!shouldStripYear(year, allowedYears)) return match;
          const monthName = MONTHS_EN[Number(month) - 1] || month;
          return `${Number(day)} ${monthName}`;
        }
      );
  }

  function sanitizeDateValue(value, context = {}) {
    const text = cleanText(value);
    if (!text) return "";
    const years = reviewedYears(context);
    return stripDisallowedTextYear(stripDisallowedIsoYear(text, years), years).replace(/\s+/g, " ").trim();
  }

  function sanitizeSegment(segment = {}, context = {}) {
    const next = { ...segment };
    ["departure", "arrival", "departureDate", "arrivalDate", "date"].forEach((field) => {
      if (next[field] !== undefined && next[field] !== null) {
        next[field] = sanitizeDateValue(next[field], context);
      }
    });
    return next;
  }

  function sanitizeFlight(flight = null, context = {}) {
    if (!flight || typeof flight !== "object") return flight;
    const next = { ...flight };
    ["departure", "arrival"].forEach((field) => {
      if (next[field] !== undefined && next[field] !== null) {
        next[field] = sanitizeDateValue(next[field], context);
      }
    });
    next.outboundSegments = asArray(next.outboundSegments).map((segment) => sanitizeSegment(segment, context));
    next.inboundSegments = asArray(next.inboundSegments).map((segment) => sanitizeSegment(segment, context));
    next.segments = asArray(next.segments).map((segment) => sanitizeSegment(segment, context));
    return next;
  }

  function sanitizeProductModelFlightDates(model = {}, context = {}) {
    const next = clone(model) || {};
    next.flight = sanitizeFlight(next.flight, context);
    return next;
  }

  return {
    sanitizeDateValue,
    sanitizeSegment,
    sanitizeFlight,
    sanitizeProductModelFlightDates
  };
});

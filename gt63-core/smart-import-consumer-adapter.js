"use strict";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hasContent(value) {
  return Object.keys(asPlainObject(value)).length > 0;
}

function adaptSmartImportForProduct(contract = {}) {
  const warnings = asArray(contract.warnings).map((warning) => String(warning || "").trim()).filter(Boolean);
  const classifications = asArray(contract.classifications);
  const hasUnknownSource = classifications.some((item) => item?.sourceType === "unknown");
  const flight = hasContent(contract.offerFlight) ? contract.offerFlight : null;
  const hotel = hasContent(contract.offerHotel) ? contract.offerHotel : null;

  return {
    flight,
    hotel,
    warnings,
    readiness: warnings.length || hasUnknownSource || (!flight && !hotel) ? "review" : "ready"
  };
}

module.exports = {
  adaptSmartImportForProduct
};

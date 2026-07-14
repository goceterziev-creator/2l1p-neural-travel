"use strict";

(function exposeSmartImportConsumerAdapter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GT63SmartImportConsumerAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSmartImportConsumerAdapter() {
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

  return {
    adaptSmartImportForProduct
  };
});

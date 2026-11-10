"use strict";
const crypto = require("node:crypto");
// Editorial token derived from the raw record before API enrichment.
// Only top-level tracking fields are excluded. updatedAt is shared by tracking
// and editorial writers; all actual editorial content (including status) remains.
const nonEditorialFields = new Set(["clientViews", "clientViewed", "clicks", "pdfDownloads", "updatedAt"]);
// JSON database parsing/stringification preserves this property order.
function offerRecordVersion(offer) {
  return crypto.createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(offer).filter(([key]) => !nonEditorialFields.has(key))))).digest("hex");
}
module.exports = { offerRecordVersion };

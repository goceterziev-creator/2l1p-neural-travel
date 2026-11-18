"use strict";

const { createHash } = require("node:crypto");

const UNRESOLVED = "UNRESOLVED";
const INTERNAL = "INTERNAL_DIAGNOSTIC";
const MATERIAL = "CLIENT_MATERIAL_CONDITION";
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function rawNotices(offer) {
  const proposal = offer.proposalInput || {};
  return Object.entries({
    offer: offer.legacyNoticeWarnings ?? offer.validationWarnings,
    proposal: proposal.warnings,
    blocking: proposal.blockingIssues
  }).flatMap(([source, values]) => (Array.isArray(values) ? values : []).flatMap((value, index) => {
    const message = typeof value === "string" ? value : value?.message;
    if (typeof message !== "string" || !message.trim()) return [];
    const id = digest([offer.id, source, index, value]);
    const decision = offer.noticeDecisions?.[id];
    return [{ id, source, message, classification: decision?.classification || UNRESOLVED, decision }];
  }));
}

function retainedDecisions(previous, updated) {
  const before = rawNotices(previous).map(notice => notice.id);
  const after = rawNotices(updated).map(notice => notice.id);
  // An edit to the raw lists can shift indistinguishable duplicate strings.
  // Re-review the lists rather than binding a decision to the wrong occurrence.
  return digest(before) === digest(after) ? previous.noticeDecisions || {} : {};
}

function adminState(offer) {
  const notices = rawNotices(offer);
  return { notices, unresolved: notices.filter(item => item.classification === UNRESOLVED).length };
}

function generatedNotice(offer, code, index, message, parameters = {}) {
  return {
    id: digest([offer.id, code, index, message, parameters]),
    source: "offer-engine",
    audience: "CLIENT",
    code,
    severity: message.match(/^\[(INFO|WARNING|CRITICAL)\]/)?.[1] || "WARNING",
    message,
    parameters,
    currentness: "recomputed-from-offer"
  };
}

module.exports = { UNRESOLVED, INTERNAL, MATERIAL, rawNotices, retainedDecisions, adminState, generatedNotice };

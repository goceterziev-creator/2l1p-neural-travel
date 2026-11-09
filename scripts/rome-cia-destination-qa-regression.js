"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/admin.js"), "utf8");
const start = source.indexOf("function destinationMatchesFlight(");
const end = source.indexOf("\nfunction destinationMatchesHotel(", start);
assert.ok(start >= 0 && end > start, "destinationMatchesFlight source is present");

const context = {
  destinationAlias: (value) => String(value || "").toLowerCase(),
  normalizeText: (value) => String(value || "").toLowerCase(),
  matchesDestinationQaNeedle: (text, needle) =>
    new RegExp("(^|[^a-z])" + needle + "([^a-z]|$)", "i").test(text)
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const matches = context.destinationMatchesFlight;

assert.equal(matches("Рим", { outbound: "SOF → CIA", inbound: "CIA → SOF" }), true);
assert.equal(matches("Rome", { arrivalAirport: "CIA" }), true);
assert.equal(matches("Рим", { arrivalAirport: "FCO" }), true);
assert.equal(matches("Рим", { arrivalAirport: "LHR" }), false);
assert.equal(matches("Rome", { arrivalAirport: "NRT" }), false);
console.log("PASS: Rome CIA/FCO accepted; unrelated airports rejected");

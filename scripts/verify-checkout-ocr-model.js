"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { MODEL_PATH, MODEL_SHA256 } = require("../server/checkout-ocr");

const model = readFileSync(MODEL_PATH);
assert.equal(model.length, 10_923_060, "Packaged English OCR model size mismatch");
assert.equal(createHash("sha256").update(model).digest("hex"), MODEL_SHA256, "Packaged English OCR model digest mismatch");
console.log("Packaged English OCR model verified");

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const sharp = require("sharp");
const { createWorker, OEM, PSM } = require("tesseract.js");

const MODEL_PATH = path.join(__dirname, "../data/ocr/eng.traineddata.gz");
const MODEL_SHA256 = "ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
let busy = false;

async function readCheckoutOcr(image, sourceId, modelPath = MODEL_PATH) {
  if (busy) return { status: "unavailable", reason: "busy" };
  busy = true;
  let worker;
  try {
    const metadata = await sharp(image, { limitInputPixels: 4_000_000 }).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages || 1) !== 1) {
      return { status: "unavailable", reason: "unsupported-image" };
    }
    const model = await fs.readFile(modelPath);
    if (sha256(model) !== MODEL_SHA256) return { status: "unavailable", reason: "model-integrity" };
    const start = performance.now();
    let rejectWorker;
    const workerError = new Promise((_, reject) => { rejectWorker = reject; });
    worker = await Promise.race([
      createWorker("eng", OEM.LSTM_ONLY, {
        cacheMethod: "none", langPath: path.dirname(modelPath), gzip: true, errorHandler: rejectWorker
      }),
      workerError
    ]);
    await Promise.race([worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO }), workerError]);
    const initialized = performance.now();
    const { data } = await Promise.race([
      worker.recognize(image, {}, { tsv: true, blocks: true }),
      workerError
    ]);
    if (!data.tsv || !data.blocks?.length) return { status: "unavailable", reason: "unreadable" };
    return {
      status: "observed", sourceId, sourceDigest: sha256(image), tsv: data.tsv, blocks: data.blocks,
      confidence: data.confidence, initializationMs: initialized - start,
      recognitionMs: performance.now() - initialized, peakRssKiB: process.resourceUsage().maxRSS
    };
  } catch (error) {
    return { status: "unavailable", reason: error.code === "ENOENT" ? "model-missing" : "ocr-error" };
  } finally {
    try {
      await worker?.terminate();
    } finally {
      busy = false;
    }
  }
}

function roomConflict(evidence, occupancy) {
  if (evidence.status !== "observed" || !Number.isSafeInteger(occupancy?.rooms)) return null;
  const lines = new Map();
  for (const row of evidence.tsv.split("\n")) {
    const [level, page, block, paragraph, line, , x, y, width, height, confidence, raw] = row.split("\t");
    if (level !== "5" || page !== "1" || !raw?.trim()) continue;
    const key = [block, paragraph, line].join(":");
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push({ text: raw.trim(), x: +x, y: +y, width: +width, height: +height, confidence: +confidence });
  }
  const rows = [...lines.values()].map(words => ({
    words, text: words.map(word => word.text).join(" "), y: Math.min(...words.map(word => word.y))
  })).sort((a, b) => a.y - b.y);

  const reservation = rows.find(row => /^Your Reservation\b/i.test(row.text) && row.words.slice(0, 2).every(word => word.confidence >= 80));
  const totals = rows.filter(row => /^Total Reservation\b/i.test(row.text));
  if (!reservation || totals.length !== 1 || totals[0].y <= reservation.y) return null;
  const checkoutRows = rows.filter(row => row.y > reservation.y && row.y < totals[0].y);
  if (checkoutRows.some(row => /\b(?:available rooms|room types|choose (?:a|your) room|room options|alternatives?)\b/i.test(row.text))) return null;

  const headings = checkoutRows.filter(row => /^Room\s+\d+\s*:/i.test(row.text));
  if (headings.length <= occupancy.rooms || headings.length > 8) return null;
  const separated = headings.every((heading, i) => {
    const number = Number(heading.text.match(/^Room\s+(\d+)/i)[1]);
    const nextY = headings[i + 1]?.y ?? totals[0].y;
    const hasStay = checkoutRows.some(row => row.y > heading.y && row.y < nextY &&
      /\b\d+\s*Adults?\b.*\b\d+\s+Nights?\b.*\d+[.,]\d{2}\s*(?:€|EUR)(?:\s|$)/i.test(row.text));
    const aligned = Math.abs(heading.words[0].x - headings[0].words[0].x) <= headings[0].words[0].height;
    return number === i + 1 && aligned && heading.words.slice(0, 2).every(word => word.confidence >= 80) && hasStay;
  });
  if (!separated) return null;
  return {
    sourceId: evidence.sourceId, sourceDigest: evidence.sourceDigest,
    reportedRooms: occupancy.rooms, observedRooms: headings.length,
    // Keep only the relevant title tokens. Nearby buttons/icons can also be recognized as text.
    headings: headings.map(heading => heading.words.slice(0, 2))
  };
}

module.exports = { readCheckoutOcr, roomConflict };

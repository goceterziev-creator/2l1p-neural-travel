"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const sharp = require("sharp");
const { readCheckoutOcr, roomConflict, archiveCheckoutOcr } = require("../server/checkout-ocr");

function replay(rows) {
  return { status: "observed", sourceId: "SRC-5", sourceDigest: "fixture", tsv: rows.flatMap((row, i) => {
    const [text, confidence = 95] = typeof row === "string" ? [row] : row;
    return text.split(" ").map((word, j) =>
      [5, 1, i + 1, 1, 1, j + 1, 30 + j * 30, 100 + i * 40, 25, 20, confidence, word].join("\t"));
  }).join("\n") };
}

const first = ["Room 1: Standard Twin", "2 Adults | 10 Nights 722,00 €"];
const second = ["Room 2: Standard Twin", "1Adult | 10 Nights 722,00 €"];
const checkout = (...rows) => replay(["Your Reservation", ...rows, "Total Reservation 1444,00 €"]);

test("checkout reconciliation requires distinct, readable reservation sections", () => {
  const occupancy = { adults: 2, rooms: 1 };
  const conflict = roomConflict(checkout(...first, ...second), occupancy);
  assert.equal(conflict.observedRooms, 2);
  assert.equal(conflict.reportedRooms, 1);
  assert.equal(conflict.headings[1][1].text, "2:");
  assert.deepEqual(occupancy, { adults: 2, rooms: 1 });
  assert.equal(roomConflict(checkout(...first, ...second), { rooms: 2 }), null);
  assert.equal(roomConflict(checkout(...first, ...second), { rooms: null }), null);
  assert.equal(roomConflict(checkout(...first), occupancy), null);
  assert.equal(roomConflict(checkout(...first, ...first), occupancy), null);
  assert.equal(roomConflict(checkout("Available rooms", ...first, ...second), occupancy), null);
  assert.equal(roomConflict(checkout(...first, "Room 2: Standard Twin"), occupancy), null);
  assert.equal(roomConflict(checkout(...first, [second[0], 35], second[1]), occupancy), null);
  assert.equal(roomConflict({ status: "unavailable" }, occupancy), null);
});

test("missing and mismatched language models stop before recognition", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aya-ocr-"));
  try {
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).jpeg().toBuffer();
    const model = path.join(dir, "eng.traineddata.gz");
    assert.deepEqual(await readCheckoutOcr(image, "SRC-5", model), { status: "unavailable", reason: "model-missing" });
    await fs.writeFile(model, "invalid model");
    assert.deepEqual(await readCheckoutOcr(image, "SRC-5", model), { status: "unavailable", reason: "model-integrity" });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("packaged WASM recognizes archived SRC-5", { skip: !process.env.AYA_SRC5_JPEG }, async () => {
  const evidence = await readCheckoutOcr(await fs.readFile(process.env.AYA_SRC5_JPEG), "SRC-5");
  assert.equal(evidence.sourceDigest, "97172be9c0a4d98c799d886f21d2c40cbeff860ccc17ca4887dd0df35893cbbe");
  assert(evidence.blocks.length);
  assert.match(evidence.tsv, /1444,00/);
  const conflict = roomConflict(evidence, { rooms: 1 });
  assert.equal(conflict?.observedRooms, 2);
  console.log(JSON.stringify({
    initializationMs: evidence.initializationMs, recognitionMs: evidence.recognitionMs,
    peakRssKiB: evidence.peakRssKiB, blocks: evidence.blocks.length, conflict
  }));
});


test("worker deadline and initialization error clean up the snapshot and release the slot", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aya-ocr-worker-test-"));
  try {
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).jpeg().toBuffer();
    const stalled = path.join(dir, "stall.cjs");
    const failure = path.join(dir, "failure.cjs");
    const marker = path.join(dir, "snapshot-path");
    await fs.writeFile(stalled, `const {workerData} = require("node:worker_threads");
      require("node:fs").writeFileSync(${JSON.stringify(marker)}, workerData.langPath);
      setInterval(() => {}, 1000);`);
    await fs.writeFile(failure, 'throw new Error("init failed");');
    const first = await readCheckoutOcr(image, "SRC-5", undefined, { workerFile: stalled, deadlineMs: 500 });
    assert.equal(first.reason, "timeout");
    const snapshot = await fs.readFile(marker, "utf8");
    await assert.rejects(fs.access(snapshot), { code: "ENOENT" });
    assert.equal((await readCheckoutOcr(image, "SRC-5", undefined, { workerFile: failure })).reason, "ocr-error");
    assert.equal((await readCheckoutOcr(image, "SRC-5", path.join(dir, "missing"))).reason, "model-missing");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("raw archive evidence has independent serialized size ceilings", () => {
  const capped = archiveCheckoutOcr({ sourceId: "SRC-5", sourceDigest: "digest",
    tsv: "x".repeat(70_000), blocks: [{ text: "y".repeat(200_000) }], initializationMs: 11 });
  assert.deepEqual([capped.tsv, capped.blocks, capped.sizeLimitExceeded], [null, null, true]);
  assert.equal(capped.initializationMs, 11);
});

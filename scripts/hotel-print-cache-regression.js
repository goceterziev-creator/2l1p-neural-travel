"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const sharp = require("sharp");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aya-hotel-image-cache-"));
process.env.DATA_DIR = scratch;
process.env.DB_FILE = path.join(scratch, "db.json");
process.env.AIRPORT_CONFIG_FILE = path.join(scratch, "airports.json");
process.env.OCR_PATTERN_CONFIG_FILE = path.join(scratch, "ocr.json");
process.env.LIVE_BASE_URL = "https://aya.example.test";
process.env.GT63_PRINT_IMAGE_DNS_FIXTURES = JSON.stringify({ "assets.example.test": ["8.8.8.8"] });
delete process.env.SERPAPI_KEY;
const filename = path.join(__dirname, "..", "server.js");
function load() {
  const harness = new Module(filename, module);
  harness.filename = filename;
  harness.paths = Module._nodeModulePaths(path.dirname(filename));
  harness._compile(fs.readFileSync(filename, "utf8") + "\nmodule.exports.cacheTest = { resolveGt63HotelPrintImage, fetchGt63PrintImageForPdf, isGt63AllowedPrintImageUrl };", filename);
  return harness.exports.cacheTest;
}
const realFetch = global.fetch;
(async () => {
  const body = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#8bb7c5" } }).jpeg().toBuffer();
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, status: 200, headers: new Headers({ "content-type": "image/jpeg" }), arrayBuffer: async () => body }; };
  const first = load();
  const url = await first.resolveGt63HotelPrintImage("https://assets.example.test/hotel.jpg");
  assert.match(url, /\/images\/hotel-cache\/[a-f0-9]{64}\.jpg$/);
  assert.equal(calls, 1);
  const cachedBody = await first.fetchGt63PrintImageForPdf(url, "https://aya.example.test");
  assert.equal(calls, 1, "local image must not make another network call");
  const metadata = await sharp(cachedBody.body).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 1600);
  console.log("PASS validated image is decoded, resized, stored and served locally");

  global.fetch = async () => { throw Error("Network unavailable after restart"); };
  const second = load();
  assert.equal(await second.resolveGt63HotelPrintImage("https://assets.example.test/hotel.jpg"), url);
  console.log("PASS disk image survives new process state and upstream outage");

  global.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "image/jpeg" }), arrayBuffer: async () => Buffer.from("<html>not an image</html>") });
  assert.equal(await second.resolveGt63HotelPrintImage("https://assets.example.test/invalid.jpg"), null);
  assert.equal(await second.isGt63AllowedPrintImageUrl("http://127.0.0.1/private.jpg", "https://aya.example.test"), false);
  assert.equal(await second.isGt63AllowedPrintImageUrl("http://169.254.169.254/meta.jpg", "https://aya.example.test"), false);
  console.log("PASS mislabeled HTML and private-network image URLs rejected");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = realFetch;
  fs.rmSync(scratch, { recursive: true, force: true });
});

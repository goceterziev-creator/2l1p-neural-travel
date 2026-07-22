"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const http = require("http");
const { spawn } = require("child_process");

const printRenderer = require("../gt63-core/renderers/print-presentation");
const serverJs = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const printRendererJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "renderers", "print-presentation.js"), "utf8");

function hotelOptions(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `print-hotel-${index + 1}`,
    name: `Print Route Hotel ${index + 1}`,
    description: `Unique selected print description ${index + 1}`,
    room: `Print room ${index + 1}`,
    meal: index === 0 ? "Breakfast included" : "",
    stars: index % 2 ? "4" : "5",
    area: `Tokyo print area ${index + 1}`,
    price: 1000 + (index * 111),
    selected: index === Math.min(count - 1, 5),
    websiteUrl: `https://print.example.test/hotel-${index + 1}`
  }));
}

function proposalInput(count = 6) {
  const options = hotelOptions(count);
  const selected = options.find((hotel) => hotel.selected) || options[0];
  return {
    mode: "GT63_LUXURY_PROPOSAL_INPUT",
    proposalInputVersion: "1.0",
    destination: { name: "Токио", requested: "2027-03-28 - 2027-04-08" },
    client: { travelers: "2", travelDates: "2027-03-28 - 2027-04-08" },
    contact: { whatsappPhone: "359885078980" },
    pricing: { currency: "EUR", flightAmount: 500, marginPercent: 5 },
    flight: {
      airline: "All Nippon Airways",
      route: "SOF -> MUC -> HND",
      baggage: "Checked baggage included",
      outboundSegments: [
        { airline: "All Nippon Airways", flightNumber: "NH 7881", from: "SOF", to: "MUC", departure: "2027-03-28T06:10", arrival: "2027-03-28T07:10" },
        { airline: "All Nippon Airways", flightNumber: "NH 218", from: "MUC", to: "HND", departure: "2027-03-28T12:00", arrival: "2027-03-29T13:15" }
      ],
      inboundSegments: [
        { airline: "All Nippon Airways", flightNumber: "NH 217", from: "HND", to: "MUC", departure: "2027-04-08T22:55", arrival: "2027-04-09T06:40" }
      ]
    },
    transfer: { status: "За потвърждение" },
    hotel: selected,
    hotelOptions: options,
    proposalTemplate: { selected: "multi-hotel", recommended: "multi-hotel" }
  };
}

function proposalInputWithSelectedImage(imageUrl) {
  const input = proposalInput(1);
  input.hotelOptions[0] = {
    ...input.hotelOptions[0],
    id: "image-test-hotel",
    name: "Image Resilience Hotel",
    selected: true
  };
  if (imageUrl !== undefined) input.hotelOptions[0].imageUrls = imageUrl ? [imageUrl] : [];
  input.hotel = input.hotelOptions[0];
  return input;
}

function assertStaticPrintHtml(html) {
  assert.match(html, /gt63-print-proposal/, "print HTML should use the print renderer shell");
  assert.doesNotMatch(html, /<script\b/i, "print HTML must not depend on JavaScript");
  assert.doesNotMatch(html, /v11-prefer-option|v11-gallery-dialog|data-gallery-action|js-selected-option/i, "print HTML must not expose interactive controls");
  assert.doesNotMatch(html, /READY|REVIEW|MULTI-HOTEL BRIEF|Review proposal/i, "print HTML must not expose internal workflow labels");
}

function flateStreams(buffer) {
  const source = buffer.toString("latin1");
  const streams = [];
  const regex = /<<(?:[\s\S]*?)\/Filter\s*\/FlateDecode(?:[\s\S]*?)>>\s*stream/g;
  let match;
  while ((match = regex.exec(source))) {
    let start = match.index + match[0].length;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    else if (buffer[start] === 10) start += 1;
    const end = source.indexOf("endstream", start);
    if (end < 0) continue;
    let rawEnd = end;
    while (rawEnd > start && (buffer[rawEnd - 1] === 10 || buffer[rawEnd - 1] === 13)) rawEnd -= 1;
    try {
      streams.push(zlib.inflateSync(buffer.subarray(start, rawEnd)).toString("utf8"));
    } catch {
      // Non-text stream or unsupported compression detail; skip it.
    }
  }
  return streams;
}

function unicodeFromHex(hex) {
  const clean = String(hex || "").replace(/[^0-9a-f]/gi, "");
  let value = "";
  for (let index = 0; index + 3 < clean.length; index += 4) {
    const code = parseInt(clean.slice(index, index + 4), 16);
    if (Number.isFinite(code)) value += String.fromCodePoint(code);
  }
  return value;
}

function pdfTextMap(streams) {
  const map = new Map();
  for (const stream of streams) {
    for (const block of stream.matchAll(/\d+\s+beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const item of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        if (!map.has(item[1])) map.set(item[1], unicodeFromHex(item[2]));
      }
    }
    for (const block of stream.matchAll(/\d+\s+beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const item of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        const start = parseInt(item[1], 16);
        const end = parseInt(item[2], 16);
        const unicodeStart = parseInt(item[3], 16);
        for (let code = start; code <= end; code += 1) {
          const key = code.toString(16).toUpperCase().padStart(item[1].length, "0");
          if (!map.has(key)) map.set(key, String.fromCodePoint(unicodeStart + (code - start)));
        }
      }
    }
  }
  return map;
}

function extractPdfText(buffer) {
  const streams = flateStreams(buffer);
  const map = pdfTextMap(streams);
  const chunks = [];
  let textContentStreamCount = 0;
  for (const stream of streams) {
    if (!/\bBT\b/.test(stream) || !/(?:Tj|TJ)/.test(stream)) continue;
    textContentStreamCount += 1;
    for (const item of stream.matchAll(/<([0-9a-fA-F]{4,})>/g)) {
      const hex = item[1];
      let decoded = "";
      for (let index = 0; index + 3 < hex.length; index += 4) {
        const key = hex.slice(index, index + 4).toUpperCase();
        decoded += map.get(key) || "";
      }
      if (decoded) chunks.push(decoded);
    }
  }
  return {
    text: chunks.join(" ").replace(/\s+/g, " ").trim(),
    compactText: chunks.join("").replace(/\s+/g, ""),
    pageCount: (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length,
    textContentStreamCount
  };
}

function assertValidPdf(buffer, label) {
  assert.ok(Buffer.isBuffer(buffer), `${label} PDF should be a buffer`);
  assert.ok(buffer.length > 1000, `${label} PDF should be non-empty`);
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-", `${label} should be a valid PDF`);
  const extracted = extractPdfText(buffer);
  assert.ok(extracted.pageCount >= 1, `${label} PDF should have at least one page`);
  return extracted;
}

for (const count of [1, 3, 6, 10]) {
  const input = proposalInput(count);
  const selectedId = input.hotelOptions[Math.min(count - 1, 5)].id;
  const selectedHtml = printRenderer.renderPrintProposal(input, { mode: "selected", selectedHotelId: selectedId });
  assertStaticPrintHtml(selectedHtml);
  assert.match(selectedHtml, /Токио/, "selected print HTML should include destination");
  assert.match(selectedHtml, new RegExp(`Print Route Hotel ${Math.min(count, 6)}`), "selected print HTML should include selected hotel");
  assert.match(selectedHtml, new RegExp(`Unique selected print description ${Math.min(count, 6)}`), "selected print HTML should include selected hotel details");
  assert.equal(/Unique selected print description [1-9]/g.test(selectedHtml.replace(`Unique selected print description ${Math.min(count, 6)}`, "")), false, "selected print mode should not render full detail descriptions for every hotel");

  const comparisonHtml = printRenderer.renderPrintProposal(input, { mode: "comparison", selectedHotelId: selectedId });
  assertStaticPrintHtml(comparisonHtml);
  for (let index = 1; index <= count; index += 1) {
    assert.match(comparisonHtml, new RegExp(`Print Route Hotel ${index}`), `comparison print mode should render hotel option ${index}`);
  }
  assert.doesNotMatch(comparisonHtml, /Unique selected print description/, "comparison print mode should not render full hotel detail panels");
}

assert.match(serverJs, /app\.get\("\/api\/offers\/:id\/print"/, "server should expose a dedicated print route");
assert.match(serverJs, /renderGt63PrintOfferHtml/, "server should render dedicated Print HTML through a separate wrapper");
assert.match(serverJs, /new URL\(`\/api\/offers\/\$\{encodeURIComponent\(offer\.id\)\}\/print`, LIVE_BASE_URL\)/, "PDF endpoint should build the dedicated Print HTML route URL");
assert.match(serverJs, /page\.goto\(printUrl\.toString\(\)/, "PDF endpoint should load the dedicated Print HTML route in Puppeteer");
assert.match(serverJs, /waitUntil:\s*"domcontentloaded"/, "PDF endpoint should not let slow images block navigation readiness");
assert.equal(/networkidle0/.test(serverJs), false, "PDF endpoint must not wait for networkidle0 because slow images are handled locally");
assert.equal(/renderOfferHtml\(offer, \{ forPdf: true \}\)/.test(serverJs), false, "PDF endpoint must not use the interactive HTML pipeline");
assert.match(serverJs, /\.gt63-print-cta[\s\S]*?break-inside:\s*avoid/, "Print CSS should keep CTA/contact block together");
assert.match(printRendererJs, /Контакт с консултант/, "Print renderer should include contact text inside the CTA block");

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep waiting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("print route test server did not become healthy");
}

async function request(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, text, json };
}

async function requestBuffer(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(buffer.toString("utf8"));
  } catch {
    json = null;
  }
  return { response, buffer, json, text: buffer.toString("utf8") };
}

function startImageServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/slow.jpg") return;
    if (req.url === "/404.jpg") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.statusCode = 204;
    res.end();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`
      });
    });
  });
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

async function routeRegression() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gt63-print-route-"));
  const dbFile = path.join(tmpDir, "database.json");
  const offer = {
    id: "OFF-PRINT-ROUTE",
    destination: "Токио",
    proposalInput: proposalInput(6),
    proposalTemplate: { selected: "multi-hotel", recommended: "multi-hotel" }
  };
  const imageServer = await startImageServer();
  const imageOffers = [
    ["OFF-IMAGE-SLOW", proposalInputWithSelectedImage(`${imageServer.baseUrl}/slow.jpg`)],
    ["OFF-IMAGE-404", proposalInputWithSelectedImage(`${imageServer.baseUrl}/404.jpg`)],
    ["OFF-IMAGE-INVALID", proposalInputWithSelectedImage("notaurl")],
    ["OFF-IMAGE-DNS", proposalInputWithSelectedImage("https://gt63.invalid.example.test/missing.jpg")],
    ["OFF-IMAGE-EMPTY", proposalInputWithSelectedImage("")]
  ].map(([id, input]) => ({
    id,
    destination: "Токио",
    proposalInput: input,
    proposalTemplate: { selected: "multi-hotel", recommended: "multi-hotel" }
  }));
  fs.writeFileSync(dbFile, JSON.stringify({
    offers: [offer, ...imageOffers],
    users: [],
    agencies: [],
    clients: [],
    activities: [],
    templates: [],
    meta: {},
    schemaVersion: {},
    updatedAt: {}
  }, null, 2));

  const port = String(4600 + Math.floor(Math.random() * 500));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: port,
      LIVE_BASE_URL: baseUrl,
      DB_FILE: dbFile,
      DATA_DIR: tmpDir,
      REGRESSION_LIBRARY_DIR: path.join(tmpDir, "regression-library"),
      SOURCE_EVIDENCE_DIR: path.join(tmpDir, "source-evidence"),
      GEMINI_INTAKE_TEST_DIR: path.join(tmpDir, "gemini-intake-test")
    }
  });

  try {
    await waitForHealth(baseUrl);
    const selected = await request(baseUrl, "/api/offers/OFF-PRINT-ROUTE/print?mode=selected&selectedHotelId=print-hotel-6");
    assert.equal(selected.response.status, 200, `selected print route should return 200, got ${selected.response.status}`);
    assertStaticPrintHtml(selected.text);
    assert.match(selected.text, /Print Route Hotel 6/, "selected print route should render selected hotel");
    assert.doesNotMatch(selected.text, /Unique selected print description 1/, "selected route should not render full details for non-selected hotels");

    const comparison = await request(baseUrl, "/api/offers/OFF-PRINT-ROUTE/print?mode=comparison&selectedHotelId=print-hotel-6");
    assert.equal(comparison.response.status, 200, `comparison print route should return 200, got ${comparison.response.status}`);
    for (let index = 1; index <= 6; index += 1) {
      assert.match(comparison.text, new RegExp(`Print Route Hotel ${index}`), `comparison route should render hotel option ${index}`);
    }

    const invalidHotel = await request(baseUrl, "/api/offers/OFF-PRINT-ROUTE/print?selectedHotelId=missing");
    assert.equal(invalidHotel.response.status, 400, "invalid selectedHotelId should return 400");
    assert.equal(invalidHotel.json?.error, "GT63_PRINT_INVALID_SELECTED_HOTEL_ID", "invalid selectedHotelId should return controlled error code");

    const invalidMode = await request(baseUrl, "/api/offers/OFF-PRINT-ROUTE/print?mode=gallery");
    assert.equal(invalidMode.response.status, 400, "invalid print mode should return 400");
    assert.equal(invalidMode.json?.error, "GT63_PRINT_INVALID_MODE", "invalid print mode should return controlled error code");

    const selectedPdf = await requestBuffer(baseUrl, "/api/offers/OFF-PRINT-ROUTE/pdf?mode=selected&selectedHotelId=print-hotel-6");
    assert.equal(selectedPdf.response.status, 200, `selected PDF endpoint should return 200, got ${selectedPdf.response.status}: ${selectedPdf.text.slice(0, 200)}`);
    const selectedPdfText = assertValidPdf(selectedPdf.buffer, "selected mode");
    assert.match(selectedPdfText.compactText, /PrintRouteHotel6/, `selected PDF text should include selected hotel; extracted: ${selectedPdfText.text.slice(0, 400)}`);
    assert.match(selectedPdfText.compactText, /Токио/, "selected PDF text should include destination");
    assert.match(selectedPdfText.compactText, /Вашатаофертаеготова/, "selected PDF text should include CTA text");
    assert.match(selectedPdfText.compactText, /Контактсконсултант/, "selected PDF text should include contact text in the CTA block");
    assert.doesNotMatch(selectedPdfText.text, /Предпочитам този хотел|Изпрати избора в WhatsApp|Затвори|Напред|Назад/, "selected PDF text should not contain interactive controls");
    assert.ok(selectedPdfText.pageCount <= 5, "selected PDF should not create an excessive or likely blank trailing page");

    const comparisonPdf = await requestBuffer(baseUrl, "/api/offers/OFF-PRINT-ROUTE/pdf?mode=comparison&selectedHotelId=print-hotel-6");
    assert.equal(comparisonPdf.response.status, 200, `comparison PDF endpoint should return 200, got ${comparisonPdf.response.status}: ${comparisonPdf.text.slice(0, 200)}`);
    const comparisonPdfText = assertValidPdf(comparisonPdf.buffer, "comparison mode");
    for (let index = 1; index <= 6; index += 1) {
      assert.match(comparisonPdfText.compactText, new RegExp(`PrintRouteHotel${index}`), `comparison PDF text should include hotel option ${index}`);
    }
    assert.ok(comparisonPdfText.pageCount <= 5, "comparison PDF should not create an excessive or likely blank trailing page");

    const invalidHotelPdf = await requestBuffer(baseUrl, "/api/offers/OFF-PRINT-ROUTE/pdf?selectedHotelId=missing");
    assert.equal(invalidHotelPdf.response.status, 400, "invalid selectedHotelId should return 400 from PDF endpoint");
    assert.equal(invalidHotelPdf.json?.error, "GT63_PRINT_INVALID_SELECTED_HOTEL_ID", "PDF endpoint should preserve invalid selectedHotelId error code");

    const invalidModePdf = await requestBuffer(baseUrl, "/api/offers/OFF-PRINT-ROUTE/pdf?mode=gallery");
    assert.equal(invalidModePdf.response.status, 400, "invalid mode should return 400 from PDF endpoint");
    assert.equal(invalidModePdf.json?.error, "GT63_PRINT_INVALID_MODE", "PDF endpoint should preserve invalid mode error code");

    for (const id of ["OFF-IMAGE-SLOW", "OFF-IMAGE-404", "OFF-IMAGE-INVALID", "OFF-IMAGE-DNS", "OFF-IMAGE-EMPTY"]) {
      const imagePdf = await requestBuffer(baseUrl, `/api/offers/${id}/pdf?mode=selected&selectedHotelId=image-test-hotel`);
      assert.equal(imagePdf.response.status, 200, `${id} selected PDF should survive unavailable image, got ${imagePdf.response.status}: ${imagePdf.text.slice(0, 200)}`);
      const imagePdfText = assertValidPdf(imagePdf.buffer, id);
      assert.match(imagePdfText.compactText, /ImageResilienceHotel/, `${id} PDF text should still include selected hotel`);
      assert.match(imagePdfText.compactText, /Вашатаофертаеготова/, `${id} PDF text should still include CTA`);
    }
  } finally {
    child.kill();
    await closeServer(imageServer.server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

routeRegression()
  .then(() => {
    console.log("PRINT PRESENTATION ROUTE REGRESSION PASS");
  })
  .catch((error) => {
    console.error(`PRINT PRESENTATION ROUTE REGRESSION FAIL: ${error.message}`);
    process.exit(1);
  });

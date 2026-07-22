"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const printRenderer = require("../gt63-core/renderers/print-presentation");
const serverJs = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

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
    websiteUrl: `https://print.example.test/hotel-${index + 1}`,
    imageUrls: [`https://images.print.test/hotel-${index + 1}.jpg`]
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

function assertStaticPrintHtml(html) {
  assert.match(html, /gt63-print-proposal/, "print HTML should use the print renderer shell");
  assert.doesNotMatch(html, /<script\b/i, "print HTML must not depend on JavaScript");
  assert.doesNotMatch(html, /v11-prefer-option|v11-gallery-dialog|data-gallery-action|js-selected-option/i, "print HTML must not expose interactive controls");
  assert.doesNotMatch(html, /READY|REVIEW|MULTI-HOTEL BRIEF|Review proposal/i, "print HTML must not expose internal workflow labels");
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
assert.match(serverJs, /const html = await renderOfferHtml\(offer, \{ forPdf: true \}\);/, "PDF endpoint should not be redirected to Print HTML in this checkpoint");
assert.equal(/page\.pdf[\s\S]{0,500}renderGt63PrintOfferHtml|renderGt63PrintOfferHtml[\s\S]{0,500}page\.pdf/.test(serverJs), false, "Puppeteer should not print the dedicated Print HTML before the infrastructure checkpoint");

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

async function routeRegression() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gt63-print-route-"));
  const dbFile = path.join(tmpDir, "database.json");
  const offer = {
    id: "OFF-PRINT-ROUTE",
    destination: "Токио",
    proposalInput: proposalInput(6),
    proposalTemplate: { selected: "multi-hotel", recommended: "multi-hotel" }
  };
  fs.writeFileSync(dbFile, JSON.stringify({
    offers: [offer],
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
  } finally {
    child.kill();
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

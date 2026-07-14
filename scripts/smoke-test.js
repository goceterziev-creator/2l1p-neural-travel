const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.SMOKE_BASE_URL || process.env.LIVE_BASE_URL || "http://localhost:3001";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "demo@aya.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const WRITE_QA = process.argv.includes("--write-qa");
const ROOT = path.join(__dirname, "..");
const REPORT_JSON = path.join(ROOT, "storage", "generated", "QA_REPORT.json");
const REPORT_MD = path.join(ROOT, "storage", "generated", "QA_REPORT.md");
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(name, status, details = {}) {
  results.push({ name, status, details, timestamp: new Date().toISOString() });
}

async function request(pathname, options = {}, cookie = "") {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE_URL}${pathname}`, { ...options, headers });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, json, text };
}

async function login() {
  const { response, json, text } = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });

  assert(response.status === 200, `login expected 200, got ${response.status}: ${text}`);
  assert(json?.success === true, "login expected success=true");

  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  assert(cookie.includes("aya_session="), "login did not return aya_session cookie");
  record("auth login", "pass");
  return cookie;
}

async function checkEndpoint(pathname, cookie, validate) {
  const { response, json, text } = await request(pathname, {}, cookie);
  assert(response.status === 200, `${pathname} expected 200, got ${response.status}: ${text.slice(0, 200)}`);
  assert(json && typeof json === "object", `${pathname} expected JSON object`);
  if (validate) validate(json);
  record(`endpoint ${pathname}`, "pass", { status: response.status });
  console.log(`ok ${pathname}`);
}

async function checkCoreEndpoints(cookie) {
  await checkEndpoint("/api/health", cookie, (json) => assert(json.ok === true, "/api/health expected ok=true"));
  await checkEndpoint("/api/offers", cookie, (json) => assert(Array.isArray(json.offers), "/api/offers expected offers[]"));
  await checkEndpoint("/api/clients", cookie, (json) => assert(Array.isArray(json.clients), "/api/clients expected clients[]"));
  await checkEndpoint("/api/activities", cookie, (json) => assert(Array.isArray(json.activities), "/api/activities expected activities[]"));
  await checkEndpoint("/api/activities/stats", cookie, (json) => assert(typeof json.total === "number", "/api/activities/stats expected total number"));
  await checkEndpoint("/api/agency", cookie, (json) => assert(json.agency && json.summary, "/api/agency expected agency + summary"));
}

async function checkGt63CoreProductShell(cookie) {
  const page = await request("/gt63-core/product/", {}, cookie);
  assert(page.response.status === 200, `/gt63-core/product/ expected 200, got ${page.response.status}: ${page.text.slice(0, 200)}`);
  assert(page.text.includes("Travel Proposal Intelligence Platform"), "GT63 Core product shell title missing");
  assert(page.text.includes("core-data-provider.js"), "GT63 Core product shell provider script missing");

  const fixture = await request("/gt63-core/fixtures/smart-import/flight-only.json", {}, cookie);
  assert(fixture.response.status === 200, `/gt63-core/fixtures/smart-import/flight-only.json expected 200, got ${fixture.response.status}`);
  assert(fixture.json?.contractVersion === "1.0", "GT63 Core fixture route expected Smart Import contract v1.0");

  record("gt63 core product shell", "pass", { status: page.response.status });
  console.log("ok /gt63-core/product/");
}

function checkSourceStability() {
  const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const renderCount = (server.match(/function renderOfferHtml\(/g) || []).length;
  const readDbCount = (server.match(/function readDb\(/g) || []).length;
  const writeDbCount = (server.match(/function writeDb\(/g) || []).length;
  const renderStart = server.indexOf("function renderOfferHtml(");
  const renderEnd = server.indexOf('app.get("/login"');
  const renderBlock = renderStart >= 0 && renderEnd > renderStart ? server.slice(renderStart, renderEnd) : "";

  assert(renderCount === 1, `expected one renderOfferHtml(), found ${renderCount}`);
  assert(readDbCount === 1, `expected one readDb(), found ${readDbCount}`);
  assert(writeDbCount === 1, `expected one writeDb(), found ${writeDbCount}`);
  assert(server.includes('const OCR_ENGINE_VERSION = "8.3.2";'), "OCR_ENGINE_VERSION is not locked to 8.3.2");
  assert(server.includes("function buildValidationWarnings("), "buildValidationWarnings() missing");
  assert(server.includes("function sanitizeHotelImages("), "sanitizeHotelImages() missing");
  assert(server.includes("function parsePlainTicket("), "plain-ticket structural parser missing");
  assert(server.includes("function plainTicketLegsAreDistinct("), "plain-ticket duplicate-leg guard missing");
  assert(server.includes('return "plain_ticket";'), "plain-ticket profile lock missing");
  assert(!server.includes("RETURN(?:\\s+FLIGHT)?"), "plain-ticket return marker must not match header '(return)'");
  assert(
    server.indexOf('return "plain_ticket";') < server.indexOf('return "connecting_flight_checkout";'),
    "plain-ticket profile must run before connecting-flight fallback"
  );
  assert(server.includes('buildOcrMetadata("plain_ticket"'), "plain-ticket metadata contract missing");
  assert(!/writeDb\(|fs\.writeFileSync\(|fs\.renameSync\(/.test(renderBlock), "renderOfferHtml must not mutate persisted data");

  record("source stability", "pass", { renderCount, readDbCount, writeDbCount, ocrEngineVersion: "8.3.2" });
  console.log("ok source stability");
}

function checkDatabaseIntegrity() {
  const db = JSON.parse(fs.readFileSync(path.join(ROOT, "DATABASE", "database.json"), "utf8"));
  const offers = Array.isArray(db.offers) ? db.offers : [];
  const clients = Array.isArray(db.clients) ? db.clients : [];
  const activities = Array.isArray(db.activities) ? db.activities : [];
  const clientIds = new Set(clients.map((client) => client.clientId || client.id).filter(Boolean));
  const offerIds = new Set(offers.map((offer) => offer.offerId || offer.id).filter(Boolean));

  const missingOfferIds = offers.filter((offer) => !(offer.offerId || offer.id));
  const missingClientIds = offers.filter((offer) => offer.clientId && !clientIds.has(offer.clientId));
  const orphanClientOfferRefs = clients.flatMap((client) => (client.offerIds || [])
    .filter((offerId) => !offerIds.has(offerId))
    .map((offerId) => ({ clientId: client.clientId || client.id, offerId })));
  const riskyOffers = offers.filter((offer) => Array.isArray(offer.validationWarnings) && offer.validationWarnings.length);
  const invalidImages = offers.flatMap((offer) => offer.hotels || [])
    .flatMap((hotel) => hotel.images || [])
    .filter((url) => /\/hotel\/[^/]+\/[^/?#]+\.html/i.test(String(url)));
  const invalidActivities = activities.filter((activity) => Number.isNaN(Date.parse(activity.timestamp || "")));
  const duplicateMigrationGroups = Object.values(activities
    .filter((activity) => /migrated|migration/i.test(activity.type || ""))
    .reduce((groups, activity) => {
      const key = `${activity.type}:${activity.metadata?.schemaVersion || ""}`;
      groups[key] = (groups[key] || 0) + 1;
      return groups;
    }, {})).filter((count) => count > 1);

  assert(typeof db.schemaVersion === "string" && db.schemaVersion.length > 0, "schemaVersion must be persisted");
  assert(missingOfferIds.length === 0, `offers missing offerId/id: ${missingOfferIds.length}`);
  assert(missingClientIds.length === 0, `offers reference missing clientId: ${missingClientIds.length}`);
  assert(orphanClientOfferRefs.length === 0, `orphan client offer references: ${orphanClientOfferRefs.length}`);
  assert(riskyOffers.length > 0, "expected at least one persisted validation warning in DB");
  assert(invalidImages.length === 0, `expected no Booking hotel page URLs in hotel images, found ${invalidImages.length}`);
  assert(invalidActivities.length === 0, `activity timestamps must be valid ISO strings: ${invalidActivities.length} invalid`);
  assert(duplicateMigrationGroups.length === 0, `migration/system events must be deduped: ${duplicateMigrationGroups.length} duplicate groups`);

  record("database integrity", "pass", {
    schemaVersion: db.schemaVersion,
    offers: offers.length,
    clients: clients.length,
    activities: activities.length,
    riskyOffers: riskyOffers.length,
    invalidImages: invalidImages.length
  });
  console.log("ok database integrity");
}

async function checkWarningPersistence(cookie) {
  const basePayload = {
    clientName: "GT63 QA Smoke Test",
    clientPhone: "0000000000",
    destination: "Rome",
    travelDates: "13.06 - 20.06.2026",
    guests: "2 adults",
    status: "draft",
    currency: "EUR",
    flightAirline: "Wizz Air",
    flightRoute: "SOF -> FCO / FCO -> SOF",
    flightDeparture: "SOF -> FCO, 27.12.2026, 14:40 - 15:45",
    flightArrival: "FCO -> SOF, 06.01.2027, 14:40 - 15:45",
    flightBaggage: "Wizz Basic",
    flightNotes: "Passengers: 1 adult.",
    hotelName: "Navona Little Home",
    hotelArea: "Rome",
    hotelRoom: "One-bedroom apartment",
    hotelMeal: "No",
    hotelRoomsLeft: "not available",
    hotelDescription: "Reservation for 1 adult.",
    hotelImages: [
      "https://cf.bstatic.com/xdata/images/hotel/max1024x768/651336640.jpg?k=test&o=",
      "https://sp.booking.com/hotel/it/navona-little-home.en-us.html"
    ],
    destinationDescription: "QA test offer.",
    notes: "Created by scripts/smoke-test.js --write-qa",
    flightPrice: 43.98,
    hotelPrice: 1200,
    transferPrice: 0,
    markupPercent: 5,
    validForDays: 1
  };

  const created = await request("/api/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(basePayload)
  }, cookie);
  assert(created.response.status === 200, `create offer expected 200, got ${created.response.status}: ${created.text}`);
  const offer = created.json?.offer;
  assert(offer?.id, "create offer did not return offer.id");
  assert((offer.validationWarnings || []).length >= 3, "create offer expected persisted validationWarnings");
  assert((offer.hotels?.[0]?.images || []).length === 1, "create offer expected invalid hotel image URL filtered");

  const dismissed = await request(`/api/offers/${offer.id}/warnings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dismissed: true })
  }, cookie);
  assert(dismissed.response.status === 200, "warning dismiss expected 200");

  const updated = await request(`/api/offers/${offer.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...basePayload, id: offer.id, travelDates: "27.12.2026 - 06.01.2027" })
  }, cookie);
  assert(updated.response.status === 200, `update offer expected 200, got ${updated.response.status}: ${updated.text}`);
  assert(updated.json?.offer?.warningsDismissed === false, "update changed warnings should reset warningsDismissed=false");

  record("warning persistence", "pass", {
    offerId: offer.id,
    createdWarnings: offer.validationWarnings.length,
    updatedWarnings: updated.json?.offer?.validationWarnings?.length || 0
  });
  console.log("ok warning persistence");
}

function writeReport(error = null) {
  const failed = results.filter((item) => item.status === "fail");
  const report = {
    ok: !error && failed.length === 0,
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    writeQa: WRITE_QA,
    failedChecks: error ? [{ message: error.message }] : failed,
    checks: results
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");

  const lines = [
    "# GT63 QA Report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Base URL: ${BASE_URL}`,
    `- Write QA: ${WRITE_QA}`,
    `- Result: ${report.ok ? "PASS" : "FAIL"}`,
    "",
    "## Checks",
    "",
    ...results.map((item) => `- ${item.status.toUpperCase()}: ${item.name}`),
    ...(error ? ["", "## Failure", "", `- ${error.message}`] : [])
  ];
  fs.writeFileSync(REPORT_MD, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  try {
    checkSourceStability();
    checkDatabaseIntegrity();
    const cookie = await login();
    await checkCoreEndpoints(cookie);
    await checkGt63CoreProductShell(cookie);
    if (WRITE_QA) await checkWarningPersistence(cookie);
    else {
      record("warning persistence", "skip");
      console.log("skip warning persistence write test (run with --write-qa)");
    }
    writeReport();
    console.log(`QA report: ${REPORT_JSON}`);
    console.log("SMOKE PASS");
  } catch (error) {
    record("smoke run", "fail", { message: error.message });
    writeReport(error);
    console.error("SMOKE FAIL:", error.message);
    process.exit(1);
  }
}

main();

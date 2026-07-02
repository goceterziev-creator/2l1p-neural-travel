const assert = require("assert");
const fs = require("fs");
const path = require("path");

process.env.DB_FILE = process.env.DB_FILE || "storage/generated/V10_FLIGHT_OCR_TEST_DATABASE.json";
process.env.AIRPORT_CONFIG_FILE = process.env.AIRPORT_CONFIG_FILE || "storage/generated/V10_AIRPORTS_TEST_CONFIG.json";
process.env.REGRESSION_LIBRARY_DIR = process.env.REGRESSION_LIBRARY_DIR || "storage/generated/V10_REGRESSION_LIBRARY_TEST";
if (process.env.AIRPORT_CONFIG_FILE.includes("storage/generated/")) {
  fs.rmSync(process.env.AIRPORT_CONFIG_FILE, { force: true });
}

const {
  airportResolverMetrics,
  archiveRegressionCaseSafe,
  buildBookingAndroidFlightProfileTrace,
  classifyFlightScreenshot,
  cleanupFlightDateTimeDisplay,
  detectGenericConnectingFlight,
  enrichFlightStopSummary,
  enrichFlightOfferLevelDateTimes,
  extractFlightPriceFromText,
  extractGlobalFlightDateTimeCandidates,
  getFlightCoreBlockingReasons,
  inferConnectingAirline,
  listRegressionCases,
  mergeMultiImageFlightSegments,
  normalizeOffer,
  normalizeAirportAliases,
  findAirport,
  parseBookingLastminuteFlightModal,
  parseDirectRoundTripTicket,
  readRegressionCaseDetail,
  summarizeRegressionLibrary,
  summarizeBetaHealth,
  parseConnectingFlightCheckout,
  buildFlightOcrConfidence
} = require("../server");

const airportSeed = require("../data/airports.json");
const airportRecords = normalizeAirportAliases(airportSeed);
for (const code of ["SOF", "PMO", "BVA", "JFK", "YYZ", "WAW", "ZRH", "VIE", "IST", "NRT", "HND", "MLE", "AUH", "ATH", "DXB", "FCO", "CIA", "MXP", "BGY", "BRI", "PRG", "BCN", "TIA"]) {
  assert.ok(airportRecords.some((record) => record.code === code), `airport seed must include ${code}`);
  assert.equal(findAirport(code)?.code, code, `shadow airport lookup must resolve ${code}`);
}
assert.ok(Number.isFinite(airportResolverMetrics.totalAirportLookups), "airport resolver metrics must be available");

fs.rmSync(process.env.REGRESSION_LIBRARY_DIR, { recursive: true, force: true });
const archiveResult = archiveRegressionCaseSafe({
  type: "flight",
  files: [
    {
      originalname: "regression-test.png",
      buffer: Buffer.from("fake-image")
    }
  ],
  rawOcrText: "SOF -> JFK Total: €762.61",
  parsedOutput: { airline: "SWISS", route: "SOF -> JFK / JFK -> SOF", price: 762.61 },
  trace: { confidence: { price: 0.91 } },
  metadata: { source: "test_fixture" },
  decision: "PASS",
  route: "SOF -> JFK / JFK -> SOF",
  price: 762.61,
  sourceProfile: "test_fixture"
});
assert.equal(archiveResult.archived, true, "regression case archive should succeed");
assert.ok(fs.existsSync(path.join(archiveResult.path, "metadata.json")), "metadata.json should be written");
assert.ok(fs.existsSync(path.join(archiveResult.path, "parsed_output.json")), "parsed_output.json should be written");
const regressionStats = summarizeRegressionLibrary();
assert.ok(regressionStats.flightCases >= 1, "regression library should count archived flight cases");
const regressionCases = listRegressionCases();
assert.ok(Array.isArray(regressionCases), "regression case inspector should expose a list");
assert.ok(regressionCases.some((item) => item.id && item.route === "SOF -> JFK / JFK -> SOF"), "regression case list should include archived case ids");
const archivedCase = regressionCases.find((item) => item.route === "SOF -> JFK / JFK -> SOF");
const archivedCaseDetail = readRegressionCaseDetail(archivedCase.id);
assert.equal(archivedCaseDetail.id, archivedCase.id, "regression case detail should load by id");
assert.equal(archivedCaseDetail.parsedOutput.route, "SOF -> JFK / JFK -> SOF", "regression case detail should include parsed output");
assert.ok(archivedCaseDetail.rawOcr.includes("SOF -> JFK"), "regression case detail should include raw OCR");
assert.ok(archivedCaseDetail.files.includes("metadata.json"), "regression case detail should list files");
assert.equal(readRegressionCaseDetail("missing-case"), null, "missing regression case should return a safe null");
const sensitiveArchive = archiveRegressionCaseSafe({
  type: "flight",
  files: [{ originalname: "sensitive.png", buffer: Buffer.from("fake-image") }],
  rawOcrText: "Card number 4111 1111 1111 1111",
  parsedOutput: {
    route: "SOF -> JFK",
    operatorWarnings: [
      "Missing OCR field: flight.price.",
      "Flight date/time confidence below production threshold."
    ]
  },
  decision: "REVIEW"
});
assert.equal(sensitiveArchive.archived, true, "sensitive archive should still save metadata");
assert.equal(sensitiveArchive.screenshotsArchived, false, "sensitive archive must skip screenshots");
assert.ok(!fs.existsSync(path.join(sensitiveArchive.path, "screenshot_1.png")), "sensitive screenshot should not be written");
const betaHealthStats = summarizeBetaHealth();
assert.ok(betaHealthStats.totalImports >= 2, "beta health should count archived imports");
assert.ok(betaHealthStats.passImports >= 1, "beta health should count PASS imports");
assert.ok(betaHealthStats.reviewImports >= 1, "beta health should count REVIEW imports");
assert.ok(betaHealthStats.reviewRate > 0, "beta health should calculate review rate");
assert.ok(Array.isArray(betaHealthStats.topReviewReasons), "beta health should expose top review reasons");
assert.ok(betaHealthStats.topReviewReasons.some((item) => item.reason === "Missing OCR field: flight.price"), "beta health should normalize duplicate review reason punctuation");
assert.ok(Array.isArray(betaHealthStats.reviewReasonGroups), "beta health should expose review reason groups");
assert.ok(betaHealthStats.reviewReasonGroups.some((item) => item.category === "PRICE" && item.count >= 1), "beta health should group price review reasons");
assert.ok(betaHealthStats.reviewReasonGroups.some((item) => item.category === "DATES" && item.count >= 1), "beta health should group date/time review reasons");
assert.ok(Array.isArray(betaHealthStats.topAffectedRoutes), "beta health should expose top affected routes");
assert.ok(betaHealthStats.topAffectedRoutes.some((item) => item.route === "SOF -> JFK" && item.count >= 1), "beta health should count affected routes");
assert.ok(Array.isArray(betaHealthStats.recentReviewCases), "beta health should expose recent review cases");

const originalWriteFileSync = fs.writeFileSync;
fs.writeFileSync = () => {
  throw new Error("simulated archive write failure");
};
try {
  const failedArchive = archiveRegressionCaseSafe({
    type: "hotel",
    parsedOutput: { name: "Test Hotel" },
    metadata: { source: "test_fixture" },
    decision: "REVIEW"
  });
  assert.equal(failedArchive.archived, false, "archive failure should return a safe result");
} finally {
  fs.writeFileSync = originalWriteFileSync;
}

const fuzzyFlightOcr = `
NIS.DOOKING.CO
Bawusm noaem go Meua cumu
Monet go Meitn cut
srop. 1 cent 21104
SOF - Nlewue Coun
IST - Nermue Ucransyn
cp. 2cen 02104
IST - Nermue Ucransyn
MLE - Mexaynapoauo neue Benana
Toner go Coun
15 cen. 2125
MLE - Mexaynapoawo netuue Benana
AUH - Mexaymapogso netwie Sake
cp.16cent. 0715
ATH - Netwue Enestepwoc
cp.16cent. 0900
SOF - Netwuie Coda
241428€
`;

const profile = buildBookingAndroidFlightProfileTrace(fuzzyFlightOcr);
assert.equal(profile.detected, true, "fuzzy flight modal profile should be detected");
assert.equal(profile.profile, "booking_flight_modal");

const candidates = extractGlobalFlightDateTimeCandidates(fuzzyFlightOcr);
assert.ok(candidates.length >= 5, `expected at least 5 date/time candidates, received ${candidates.length}`);
assert.ok(candidates.some((value) => /Sep 1 21:10/i.test(value)), "compact outbound date/time should normalize");
assert.ok(candidates.some((value) => /Sep 16 09:00/i.test(value)), "compact final arrival date/time should normalize");

const enriched = enrichFlightOfferLevelDateTimes(
  fuzzyFlightOcr,
  { route: "SOF -> MLE / MLE -> SOF", departure: "", arrival: "" },
  { missingFields: ["flight.times"] }
);
assert.match(enriched.flight.departure, /SOF -> MLE, Sep 1 21:10/i);
assert.match(enriched.flight.arrival, /MLE -> SOF, Sep 16 09:00/i);
assert.ok(!enriched.metadata.missingFields.includes("flight.times"));

assert.equal(
  cleanupFlightDateTimeDisplay("SOF -> MLE, Sep 211:04", "Sep 1 21:10"),
  "SOF -> MLE, Sep 1 21:10"
);
assert.equal(
  cleanupFlightDateTimeDisplay("SOF -> MLE, Sep 211:04", "Sep 211:04"),
  "SOF -> MLE, Sep 1 21:10"
);
assert.equal(
  cleanupFlightDateTimeDisplay("MLE -> SOF, Sep 1609:00", "Sep 16 09:00"),
  "MLE -> SOF, Sep 16 09:00"
);
assert.equal(
  cleanupFlightDateTimeDisplay("SOF -> MLE, Sep 109:00", "Sep 1 09:00"),
  "SOF -> MLE, Sep 1 09:00"
);
assert.equal(
  cleanupFlightDateTimeDisplay("SOF -> MLE, Sep 1 21:10", "Sep 1 21:10"),
  "SOF -> MLE, Sep 1 21:10"
);
assert.equal(
  cleanupFlightDateTimeDisplay("MLE -> SOF, 16.09 09:00", "Sep 16 09:00"),
  "MLE -> SOF, 16.09 09:00"
);

const malformedProductionEnriched = enrichFlightOfferLevelDateTimes(
  "Sep 211:04 Sep 16 09:00",
  {
    route: "SOF -> MLE / MLE -> SOF",
    departure: "SOF -> MLE, Sep 211:04",
    arrival: "MLE -> SOF, Sep 16 09:00"
  },
  { missingFields: [] }
);
assert.equal(malformedProductionEnriched.flight.departure, "SOF -> MLE, Sep 1 21:10");
assert.equal(malformedProductionEnriched.flight.arrival, "MLE -> SOF, Sep 16 09:00");
assert.deepEqual(
  extractGlobalFlightDateTimeCandidates(
    "Flight to Maldives Sep 211:04 SOF Airport Return Sep 16 09:00 SOF Airport"
  ),
  ["Sep 1 21:10", "Sep 16 09:00"],
  "malformed OCR date/time tokens must be repaired before candidate selection"
);

const stopEnriched = enrichFlightStopSummary(
  fuzzyFlightOcr,
  enriched.flight,
  "Maldives"
);
assert.match(stopEnriched.departure, /via IST/i);
assert.match(stopEnriched.arrival, /via AUH \+ ATH/i);
assert.match(stopEnriched.notes, /Outbound via IST/i);
assert.match(stopEnriched.notes, /Return via AUH \+ ATH/i);

const noisyAustrianRoundTripOcr = `
Travel operated by Austrian Airlines
Sep 1 08:00 SOF
Sep 1 10:00 IST
Sep 2 08:00 NRT
Sep 15 10:00 NRT
Sep 15 18:00 IST
Sep 15 21:00 SOF
--- ENHANCED OCR ---
Sep 1 08:00 SOF
Sep 1 10:00 VIE
Sep 2 08:00 NRT
Sep 15 10:00 NRT
Sep 15 18:00 VIE
Sep 15 21:00 SOF
`;
const austrianStops = enrichFlightStopSummary(
  noisyAustrianRoundTripOcr,
  {
    route: "SOF -> NRT / NRT -> SOF",
    departure: "SOF -> NRT, Sep 1 08:00",
    arrival: "NRT -> SOF, Sep 15 21:00",
    notes: ""
  }
);
assert.match(austrianStops.departure, /via VIE/i);
assert.match(austrianStops.arrival, /via VIE/i);
assert.doesNotMatch(austrianStops.notes, /via IST/i);
assert.equal(
  inferConnectingAirline("Travel operated by Austrian Airlines Austrian Airlines"),
  "Austrian Airlines",
  "visible airline labels should be globally extracted and deduplicated"
);

assert.deepEqual(
  getFlightCoreBlockingReasons({
    airline: "",
    route: "SOF -> NRT / NRT -> SOF",
    departure: "SOF -> NRT, Sep 1 08:00",
    arrival: "NRT -> SOF, Sep 15 21:00",
    price: 1200
  }),
  [],
  "missing airline alone must remain a review item"
);
assert.deepEqual(
  getFlightCoreBlockingReasons({ airline: "Austrian Airlines", route: "", departure: "", arrival: "", price: 0 }),
  [
    "Missing or invalid flight.route.",
    "Missing or invalid flight.times.",
    "Missing or invalid flight.price."
  ],
  "missing core fields must block import"
);

const bulgarianMonthDateOcr = `
25 \u043c\u0430\u0440\u0442 (\u0447\u0442)
12:30 \u0421\u043e\u0444\u0438\u044f (SOF)

8 \u0430\u043f\u0440 (\u0447\u0442)
22:25 \u0422\u043e\u043a\u0438\u043e (NRT)
`;
const bulgarianDateCandidates = extractGlobalFlightDateTimeCandidates(bulgarianMonthDateOcr);
assert.deepEqual(
  bulgarianDateCandidates,
  ["Mar 25 12:30", "Apr 8 22:25"],
  "Bulgarian full and abbreviated month formats should produce global date candidates"
);
const bulgarianDateEnriched = enrichFlightOfferLevelDateTimes(
  bulgarianMonthDateOcr,
  { airline: "Airline", route: "SOF -> NRT", departure: "", arrival: "", price: 100 },
  { missingFields: ["flight.times"] }
);
assert.match(bulgarianDateEnriched.flight.departure, /Mar 25 12:30/);
assert.match(bulgarianDateEnriched.flight.arrival, /Apr 8 22:25/);
assert.ok(!bulgarianDateEnriched.metadata.missingFields.includes("flight.times"));
assert.ok(
  buildFlightOcrConfidence(
    bulgarianMonthDateOcr,
    bulgarianDateEnriched.flight,
    bulgarianDateEnriched.metadata
  ).outboundDate.confidence >= 0.8,
  "day + localized month + time must pass date confidence without a year"
);

const fuzzyBulgarianMonthDateOcr = `
25 mapr (ur)
12:30 Coduma (SOF)
11:55 Tomo (NRT)

8 anp (ur)
22:25 Tokuno (NRT)
23 Codus (SOF)
`;
const fuzzyBulgarianDateCandidates = extractGlobalFlightDateTimeCandidates(fuzzyBulgarianMonthDateOcr);
assert.deepEqual(
  fuzzyBulgarianDateCandidates,
  ["Mar 25 12:30", "Apr 8 22:25"],
  "OCR-deformed Bulgarian month tokens should produce global date candidates"
);
const fuzzyBulgarianDateEnriched = enrichFlightOfferLevelDateTimes(
  fuzzyBulgarianMonthDateOcr,
  { airline: "Airline", route: "SOF -> NRT / NRT -> SOF", departure: "", arrival: "", price: 100 },
  { missingFields: ["flight.times"] }
);
assert.match(fuzzyBulgarianDateEnriched.flight.departure, /Mar 25 12:30/);
assert.match(fuzzyBulgarianDateEnriched.flight.arrival, /Apr 8 22:25/);
assert.ok(!fuzzyBulgarianDateEnriched.metadata.missingFields.includes("flight.times"));
assert.ok(
  buildFlightOcrConfidence(
    fuzzyBulgarianMonthDateOcr,
    fuzzyBulgarianDateEnriched.flight,
    fuzzyBulgarianDateEnriched.metadata
  ).outboundDate.confidence >= 0.8,
  "OCR-deformed day + month + time must pass date confidence without inventing a missing time"
);
assert.deepEqual(
  getFlightCoreBlockingReasons(fuzzyBulgarianDateEnriched.flight, 100),
  [],
  "OCR-deformed Bulgarian dates must not hard-stop an otherwise complete flight"
);

const productionFuzzyBulgarianMonthDateOcr = `
25 map (an)
+ 12:30 Coduma (SOF)
11:55 Tomo (NRT)

samp (em)
» 22:25 Tokuno (NRT)
23 Codus (SOF)
`;
const productionFuzzyDateCandidates = extractGlobalFlightDateTimeCandidates(
  productionFuzzyBulgarianMonthDateOcr
);
assert.deepEqual(
  productionFuzzyDateCandidates,
  ["Mar 25 12:30", "Apr 8 22:25"],
  "production OCR variants map, samp, an and em should normalize without treating ordinary map text as a month"
);
const productionFuzzyDateEnriched = enrichFlightOfferLevelDateTimes(
  productionFuzzyBulgarianMonthDateOcr,
  { airline: "Airline", route: "SOF -> NRT / NRT -> SOF", departure: "", arrival: "", price: 100 },
  { missingFields: ["flight.times"] }
);
assert.match(productionFuzzyDateEnriched.flight.departure, /Mar 25 12:30/);
assert.match(productionFuzzyDateEnriched.flight.arrival, /Apr 8 22:25/);
assert.deepEqual(
  getFlightCoreBlockingReasons(productionFuzzyDateEnriched.flight, 100),
  [],
  "production fuzzy date variants must not hard-stop an otherwise complete flight"
);

const globalConnectingFlightOcr = `
X Flight details
1 Jul Sofia > New York
11:05 Sofia Airport (SOF)
13:15 Zurich Airport (ZRH)
Flight duration: 2h 20min Flight number: LX 1391
Class: Economy Airline: SWISS
1 Jul
12:25 Zurich Airport (ZRH)
16:35 John F. Kennedy (JFK)
Flight duration: 9h 20min Flight number: LX 14
Class: Economy Airline: SWISS
New York > Sofia
8 Jul
16:15 John F. Kennedy (JFK)
06:10 Zurich Airport (ZRH)
8 Jul
07:05 Zurich Airport (ZRH)
10:20 Sofia Airport (SOF)
Passengers €286.71
Taxes and fees €502.12
Total: €788.83
`;
const globalConnectingFlight = detectGenericConnectingFlight(globalConnectingFlightOcr);
assert.equal(globalConnectingFlight.airline, "SWISS");
assert.equal(globalConnectingFlight.route, "SOF -> JFK / JFK -> SOF");
assert.match(globalConnectingFlight.departure, /via ZRH/i);
assert.match(globalConnectingFlight.arrival, /via ZRH/i);
assert.equal(extractFlightPriceFromText(globalConnectingFlightOcr), 788.83);

const directRoundTripTicketOcr = `
Sofia to Bari
Return 7 May - 13 May
07 MAY
06:55 Sofia
07:15 Bari
FRS 460
FR 5460
13 MAY
22:00 Bari
00:20 Sofia
FR 5454
Total to pay EUR 219.36
`;
const directRoundTripTicket = parseDirectRoundTripTicket(directRoundTripTicketOcr, { airline: "Ryanair" });
assert.equal(directRoundTripTicket.flight.route, "SOF -> BRI / BRI -> SOF");
assert.match(directRoundTripTicket.flight.departure, /SOF -> BRI, May 7 06:55 - May 7 07:15, FR 5460/);
assert.match(directRoundTripTicket.flight.arrival, /BRI -> SOF, May 13 22:00 - May 14 00:20, FR 5454/);
assert.equal(directRoundTripTicket.flight.price, 219.36);

const bookingLastminuteFlightModalOcr = `
Booking.com
Flight details
Sofia - Palermo
16.07
20:20 Sofia (SOF)
21:15 Palermo (PMO)
Wizzair
W64313
Return
Palermo - Sofia
18.07
12:55 Palermo (PMO)
15:45 Sofia (SOF)
Wizzair
W64314
Total price for all travelers
809 \u20ac
`;
const bookingLastminuteModal = parseBookingLastminuteFlightModal(bookingLastminuteFlightModalOcr);
assert.equal(bookingLastminuteModal.flight.route, "SOF -> PMO / PMO -> SOF");
assert.equal(bookingLastminuteModal.flight.dates, "16.07 - 18.07");
assert.match(bookingLastminuteModal.flight.departure, /SOF -> PMO, 16\.07, 20:20 - 21:15, W64313/);
assert.match(bookingLastminuteModal.flight.arrival, /PMO -> SOF, 18\.07, 12:55 - 15:45, W64314/);
assert.equal(bookingLastminuteModal.flight.airline, "Wizz Air");
assert.match(bookingLastminuteModal.flight.notes, /W64313, W64314/);
assert.equal(bookingLastminuteModal.flight.price, 809);
assert.deepEqual(bookingLastminuteModal.metadata.missingFields, []);

const turkishOpenJawConnectingOcr = `
Flight to Tokyo
1 stop - 16h 10m
Tue, Sep 1 - 9:10 PM
SOF - Sofia Airport
Tue, Sep 1 - 10:40 PM
IST - Istanbul Airport
Layover 3h 25m
Wed, Sep 2 - 2:05 AM
IST - Istanbul Airport
Wed, Sep 2 - 7:20 PM
HND - Tokyo Haneda Airport
Flight to Sofia
1 stop - 17h 30m
Tue, Sep 15 - 9:15 PM
NRT - Narita International Airport
Wed, Sep 16 - 4:40 AM
IST - Istanbul Airport
Layover 2h 50m
Wed, Sep 16 - 7:30 AM
IST - Istanbul Airport
Wed, Sep 16 - 8:45 AM
SOF - Sofia Airport
Turkish Airlines
TK1030 - Economy
Turkish Airlines
TK198 - Economy
Turkish Airlines
TK301 - Economy
Turkish Airlines
TK1027 - Economy
Total price for all travelers
€2,697.58
`;
const turkishOpenJawFlight = detectGenericConnectingFlight(turkishOpenJawConnectingOcr);
assert.equal(turkishOpenJawFlight.airline, "Turkish Airlines");
assert.equal(turkishOpenJawFlight.route, "SOF -> HND / NRT -> SOF");
assert.match(turkishOpenJawFlight.departure, /SOF -> HND, .*via IST/i);
assert.match(turkishOpenJawFlight.arrival, /NRT -> SOF, .*via IST/i);
assert.doesNotMatch(turkishOpenJawFlight.route, /SOF -> IST \/ IST -> SOF/i);
assert.doesNotMatch(turkishOpenJawFlight.departure, /via HND|via NRT/i);
assert.match(turkishOpenJawFlight.notes, /IST: кацане Tue, Sep 1 - 10:40 PM, излитане Wed, Sep 2 - 2:05 AM, престой 3ч 25м/i);
assert.match(turkishOpenJawFlight.notes, /IST: кацане Wed, Sep 16 - 4:40 AM, излитане Wed, Sep 16 - 7:30 AM, престой 2ч 50м/i);

const turkishOpenJawStopSummary = enrichFlightStopSummary(
  turkishOpenJawConnectingOcr,
  turkishOpenJawFlight
);
assert.doesNotMatch(turkishOpenJawStopSummary.notes, /Return via NRT/i);
assert.doesNotMatch(turkishOpenJawStopSummary.notes, /Outbound via IST/i);

const globalConnectingParsed = parseConnectingFlightCheckout(globalConnectingFlightOcr);
assert.equal(globalConnectingParsed.flight.price, 788.83);
assert.equal(globalConnectingParsed.flight.route, "SOF -> JFK / JFK -> SOF");
assert.equal(globalConnectingParsed.metadata.missingFields.length, 0);

const multiScreenshotSummaryAndDetailsOcr = `
--- OCR IMAGE 1: desktop-summary.png ---
Flight information
View details
Jul 1 (Wed)
11:05 Sofia (SOF)
16:35 New York (JFK)
1 stop
Total journey length: 12h 30min
Jul 8 (Wed)
16:15 New York (JFK)
10:20 Sofia (SOF)
1 stop
Total journey length: 11h 05min
Passengers €261.19
Adult €261.19
Taxes and fees €501.42
Airport fees €443.97
Service fee €57.45
Total: €762.61
--- OCR IMAGE 2: desktop-details.png ---
Flight details
11:05
1 Jul
Sofia Airport (SOF)
Flight duration: 2 hours 20 minutes Flight number: LX 1391
Class: Economy Airline: SWISS
12:25
1 Jul
Zurich Airport (ZRH)
Transfer Time: 50min
13:15
1 Jul
Zurich Airport (ZRH)
Flight duration: 9h 20min Flight number: LX 14
Class: Economy Airline: SWISS
16:35
1 Jul
John F. Kennedy (JFK)
New York > Sofia
16:15
8 Jul
John F. Kennedy (JFK)
Flight duration: 7h 55min Flight number: LX 17
Class: Economy Airline: SWISS
06:10
Jul 9
Zurich Airport (ZRH)
Transfer Time: 55min
07:05
Jul 9
Zurich Airport (ZRH)
Flight duration: 2 hours 15 minutes Flight number: LX 1390
Class: Economy Airline: SWISS
10:20
Jul 9
Sofia Airport (SOF)
`;
const multiScreenshotParsed = parseConnectingFlightCheckout(multiScreenshotSummaryAndDetailsOcr);
assert.equal(multiScreenshotParsed.flight.airline, "SWISS");
assert.equal(multiScreenshotParsed.flight.route, "SOF -> JFK / JFK -> SOF");
assert.match(multiScreenshotParsed.flight.departure, /SOF -> JFK, Jul 1 11:05 - Jul 1 16:35, via ZRH/i);
assert.match(multiScreenshotParsed.flight.arrival, /JFK -> SOF, Jul 8 16:15 - Jul 9 10:20, via ZRH/i);
assert.match(multiScreenshotParsed.flight.notes, /ZRH: кацане .*12:25.*излитане .*13:15.*престой 50м/i);
assert.match(multiScreenshotParsed.flight.notes, /ZRH: кацане .*06:10.*излитане .*07:05.*престой 55м/i);
assert.ok(!/\.\.\./.test(multiScreenshotParsed.flight.notes));
assert.equal(multiScreenshotParsed.flight.price, 762.61);
assert.equal(extractFlightPriceFromText(multiScreenshotSummaryAndDetailsOcr), 762.61);
assert.equal(multiScreenshotParsed.metadata.missingFields.length, 0);
assert.deepEqual(
  multiScreenshotParsed.flight.outboundSegments.map((segment) => `${segment.from}->${segment.to}`),
  ["SOF->ZRH", "ZRH->JFK"]
);
assert.deepEqual(
  multiScreenshotParsed.flight.inboundSegments.map((segment) => `${segment.from}->${segment.to}`),
  ["JFK->ZRH", "ZRH->SOF"]
);
assert.deepEqual(multiScreenshotParsed.flight.stopoverAirports, ["ZRH"]);
assert.ok(multiScreenshotParsed.flight.transferTimes.includes("50min"));
assert.ok(multiScreenshotParsed.flight.transferTimes.includes("55min"));
  assert.equal(multiScreenshotParsed.flight.outboundSegments[0].flightNumber, "LX 1391");
  assert.equal(multiScreenshotParsed.flight.outboundSegments[1].flightNumber, "LX 14");
  assert.equal(multiScreenshotParsed.flight.outboundSegments[0].duration, "2 hours 20 minutes");
  assert.equal(multiScreenshotParsed.flight.outboundSegments[1].duration, "9h 20min");
  assert.equal(multiScreenshotParsed.flight.inboundSegments[0].flightNumber, "LX 17");
assert.equal(multiScreenshotParsed.flight.inboundSegments[1].flightNumber, "LX 1390");
assert.equal(multiScreenshotParsed.flight.inboundSegments[0].duration, "7h 55min");
  assert.equal(multiScreenshotParsed.flight.inboundSegments[1].duration, "2 hours 15 minutes");
  assert.deepEqual(multiScreenshotParsed.flight.transferTimes, ["50min", "55min"]);

const [swissSummaryImage, swissDetailsImage] = multiScreenshotSummaryAndDetailsOcr
  .split(/--- OCR IMAGE 2: desktop-details\.png ---/i);
assert.equal(classifyFlightScreenshot(swissSummaryImage), "summary");
assert.equal(classifyFlightScreenshot(swissDetailsImage), "detail");
const mergedSwissSegments = mergeMultiImageFlightSegments(
  [swissSummaryImage, swissDetailsImage],
  {
    route: "SOF -> JFK / JFK -> SOF",
    price: 762.61
  }
);
assert.deepEqual(
  mergedSwissSegments.inboundSegments.map((segment) => `${segment.from}->${segment.to}`),
  ["JFK->ZRH", "ZRH->SOF"],
  "multi-image imports must prefer the detail timeline for inbound segments"
);
  assert.equal(mergedSwissSegments.inboundSegments[1].flightNumber, "LX 1390");
  assert.match(mergedSwissSegments.departure, /SOF -> JFK, Jul 1 11:05 - Jul 1 16:35, via ZRH/);
  assert.match(mergedSwissSegments.arrival, /JFK -> SOF, Jul 8 16:15 - Jul 9 10:20, via ZRH/);
  assert.deepEqual(mergedSwissSegments.transferTimes, ["50min", "55min"]);
  assert.equal(mergedSwissSegments.price, 762.61, "summary-derived price must remain unchanged");

const swissDetailWithSparseReturnDates = `
1 Jul
11:05 Sofia Airport (SOF)
Flight duration: 2 hours 20 minutes
Flight number: LX 1391
12:25 Zurich Airport (ZRH)
Transfer Time: 50min
13:15 Zurich Airport (ZRH)
Flight duration: 9h 20min
Flight number: LX 14
16:35 John F. Kennedy (JFK)
16:15 John F. Kennedy (JFK)
Flight duration: 7h 55min
Flight number: LX 17
06:10 Zurich Airport (ZRH)
Transfer Time: 55min
07:05 Zurich Airport (ZRH)
Flight duration: 2 hours 15 minutes
Flight number: LX 1390
10:20 Sofia Airport (SOF)
`;
const swissSummaryWithReturnAnchors = `
Jul 1 (Wed)
11:05 Sofia (SOF)
16:35 New York (JFK)
Jul 8 (Wed)
16:15 New York (JFK)
10:20 Sofia (SOF)
Total: €762.61
`;
const recoveredSparseSwissSegments = mergeMultiImageFlightSegments(
  [swissDetailWithSparseReturnDates, swissSummaryWithReturnAnchors],
  { route: "SOF -> JFK / JFK -> SOF", price: 762.61 }
);
assert.deepEqual(
  recoveredSparseSwissSegments.inboundSegments.map((segment) => `${segment.from}->${segment.to}`),
  ["JFK->ZRH", "ZRH->SOF"],
  "detail rows with sparse dates must retain both inbound segments"
);
assert.match(recoveredSparseSwissSegments.inboundSegments[0].departure, /Jul 8 16:15/);
assert.match(recoveredSparseSwissSegments.inboundSegments[1].arrival, /Jul 9 10:20/);
assert.equal(recoveredSparseSwissSegments.inboundSegments[1].flightNumber, "LX 1390");
assert.equal(recoveredSparseSwissSegments.inboundSegments[1].duration, "2 hours 15 minutes");

const multiScreenshotPartialDetailsOcr = `
--- OCR IMAGE 1: desktop-summary.png ---
Flight information
View details
Jul 1 (Wed)
11:05 Sofia (SOF)
16:35 New York (JFK)
1 stop
Total journey length: 12h 30min
Jul 8 (Wed)
16:15 New York (JFK)
10:20 Sofia (SOF)
1 stop
Total journey length: 11h 05min
Total: €762.61
--- OCR IMAGE 2: partial-details.png ---
Flight details
11:05
1 Jul
Sofia Airport (SOF)
12:25
1 Jul
Zurich Airport (ZRH)
Transfer Time: 50min
13:15
1 Jul
Zurich Airport (ZRH)
10:20
Jul 9
Sofia Airport (SOF)
`;
const multiScreenshotPartialParsed = parseConnectingFlightCheckout(multiScreenshotPartialDetailsOcr);
assert.equal(multiScreenshotPartialParsed.flight.route, "SOF -> JFK / JFK -> SOF");
assert.notEqual(multiScreenshotPartialParsed.flight.route, "SOF -> ZRH / ZRH -> SOF");
assert.ok(!/Return via ZRH \(ZRH:.*10:20/i.test(multiScreenshotPartialParsed.flight.notes || ""));
assert.ok(!/\.\.\./.test(multiScreenshotPartialParsed.flight.notes || ""));

const summaryOnlyOvernight = enrichFlightStopSummary(`
Flight information
Jul 1 (Wed)
11:05 Sofia (SOF)
16:35 New York (JFK)
1 stop
Jul 8 (Wed)
16:15 New York (JFK)
10:20 Sofia (SOF)
1 stop
Total: €762.61
`, {
  airline: "SWISS",
  route: "SOF -> JFK / JFK -> SOF",
  departure: "SOF -> JFK, Jul 1 11:05 - Jul 1 16:35",
  arrival: "JFK -> SOF, Jul 8 16:15 - Jul 8 10:20",
  notes: ""
});
assert.match(summaryOnlyOvernight.arrival, /JFK -> SOF, Jul 8 16:15 - Jul 9 10:20/i);

const partialLotTorontoModalOcr = `
--- OCR IMAGE 1: screenshot.png ---
--- ENHANCED OCR ---
X Flight details
Sofia » Toronto
Travel time: 12h 45min 1 stop
14:35 Sofia Airport (SOF)
1 Jul Sofia, Bulgaria
Flight duration: 01h 55min Flight number: LO 632
LOT Economy
15:30 Frederic Chopin (WAW)
1 Jul Warsaw, Poland
Transfer Time: 01h 30min
17:00 Frederic Chopin (WAW)
1 Jul Warsaw, Poland
Flight duration: 09h 20min Airline LOT
Flight number: LO 45
20:20 Lester B. Pearson (YYZ)
1 Jul Toronto, Canada
Toronto » Sofia
Travel time: 11h 50min 1 stop
19:20 Lester B. Pearson (YYZ)
8 Jul Toronto, Canada
Flight duration: 08h 25min Flight number: LO 42
LOT Economy
09:45 Frederic Chopin (WAW)
9 Jul Warsaw, Poland
Transfer Time: 01h 00min
10:45 Frederic Chopin (WAW)
9 Jul Warsaw, Poland
Flight duration: 02h 05min Flight number: LO 631
LOT Economy
13:50 Sofia Airport (SOF)
9 Jul Sofia, Bulgaria
--- OCR IMAGE 2: screenshot.png ---
X Flight details
Sofia )» Toronto
Total journey length: 12h 45min 1 stop
14:35 Sofia Airport (SOF)
1 Jul Sofia, Bulgaria
Flight duration: 01h 55min | Flight number: LO 632
LOT | e175(Jet)
15:30 Frederic Chopin (WAW)
1 Jul Warsaw, Poland
Transfer Time: 01h 30min
17:00 Frederic Chopin (WAW)
1 Jul Warsaw, Poland
Flight duration: 09h 20min | Flight number: LO 45
LOT Operated by EuroAtlantic Airways
Toronto » Sofia
19:20 Lester B. Pearson (YYZ)
8 Jul Toronto, Canada
Flight duration: 08h 25min | Flight number: LO 42
LOT | 787(Jet)
09:45 Frederic Chopin (WAW)
9 Jul Warsaw, Poland
Transfer Time: 01h 00min
10:45 Frederic Chopin (WAW)
9 Jul Warsaw, Poland
Flight duration: 02h 05min | Flight number: LO 631
LOT | e175(Jet)
13:50 Sofia Airport (SOF)
9 Jul Sofia, Bulgaria
782 ©
Price per 1 passenger for return
`;
const partialLotTorontoParsed = parseConnectingFlightCheckout(partialLotTorontoModalOcr);
assert.equal(partialLotTorontoParsed.flight.route, "SOF -> YYZ / YYZ -> SOF");
assert.equal(partialLotTorontoParsed.flight.airline, "LOT Polish Airlines");
assert.match(partialLotTorontoParsed.flight.departure, /SOF -> YYZ, Jul 1 14:35 - Jul 1 20:20, via WAW/i);
assert.match(partialLotTorontoParsed.flight.arrival, /YYZ -> SOF, Jul 8 19:20 - Jul 9 13:50, via WAW/i);
assert.deepEqual(
  partialLotTorontoParsed.flight.outboundSegments.map((segment) => `${segment.departure} ${segment.from}->${segment.arrival} ${segment.to} ${segment.flightNumber}`),
  [
    "Jul 1 14:35 SOF->Jul 1 15:30 WAW LO 632",
    "Jul 1 17:00 WAW->Jul 1 20:20 YYZ LO 45"
  ]
);
assert.deepEqual(
  partialLotTorontoParsed.flight.inboundSegments.map((segment) => `${segment.departure} ${segment.from}->${segment.arrival} ${segment.to} ${segment.flightNumber}`),
  [
    "Jul 8 19:20 YYZ->Jul 9 09:45 WAW LO 42",
    "Jul 9 10:45 WAW->Jul 9 13:50 SOF LO 631"
  ]
);
assert.deepEqual(partialLotTorontoParsed.flight.stopoverAirports, ["WAW"]);
assert.match(partialLotTorontoParsed.flight.notes, /LO 632, LO 45, LO 42, LO 631/);
assert.equal(partialLotTorontoParsed.flight.price, 782);
const savedLotTorontoOffer = normalizeOffer({
  destination: "Toronto",
  flightPrice: partialLotTorontoParsed.flight.price,
  flights: [partialLotTorontoParsed.flight]
});
assert.deepEqual(
  savedLotTorontoOffer.flights[0].outboundSegments.map((segment) => `${segment.from}->${segment.to} ${segment.flightNumber}`),
  ["SOF->WAW LO 632", "WAW->YYZ LO 45"]
);
assert.deepEqual(
  savedLotTorontoOffer.flights[0].inboundSegments.map((segment) => `${segment.from}->${segment.to} ${segment.flightNumber}`),
  ["YYZ->WAW LO 42", "WAW->SOF LO 631"]
);
assert.deepEqual(
  savedLotTorontoOffer.flights[0].segments.map((segment) => `${segment.from}->${segment.to} ${segment.flightNumber}`),
  ["SOF->WAW LO 632", "WAW->YYZ LO 45", "YYZ->WAW LO 42", "WAW->SOF LO 631"]
);
assert.ok(!partialLotTorontoParsed.metadata.missingFields.includes("flight.route"));
assert.ok(!partialLotTorontoParsed.metadata.missingFields.includes("flight.price"));

const productionRouteSeparatorModalOcr = `
Sofia » Toronto
14:35 Sofia Airport (SOF)
20:20 Lester B. Pearson (YYZ)
Toronto » Sofia
19:20 Lester B. Pearson (YYZ)
13:50 Sofia Airport (SOF)
`;
const productionRouteSeparatorParsed = parseBookingLastminuteFlightModal(productionRouteSeparatorModalOcr);
assert.equal(productionRouteSeparatorParsed.flight.route, "SOF -> YYZ / YYZ -> SOF");
assert.equal(parseBookingLastminuteFlightModal(`
ron → Tra
14:35 Sofia Airport (SOF)
20:20 Lester B. Pearson (YYZ)
Tra → ron
19:20 Lester B. Pearson (YYZ)
13:50 Sofia Airport (SOF)
`), null);

console.log("V10 FLIGHT OCR REGRESSION PASS");

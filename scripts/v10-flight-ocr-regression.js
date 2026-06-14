const assert = require("assert");

process.env.DB_FILE = process.env.DB_FILE || "storage/generated/V10_FLIGHT_OCR_TEST_DATABASE.json";

const {
  buildBookingAndroidFlightProfileTrace,
  cleanupFlightDateTimeDisplay,
  enrichFlightStopSummary,
  enrichFlightOfferLevelDateTimes,
  extractGlobalFlightDateTimeCandidates,
  getFlightCoreBlockingReasons,
  inferConnectingAirline,
  buildFlightOcrConfidence
} = require("../server");

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

console.log("V10 FLIGHT OCR REGRESSION PASS");

const assert = require("assert");

process.env.DB_FILE = process.env.DB_FILE || "storage/generated/V10_FLIGHT_OCR_TEST_DATABASE.json";

const {
  buildBookingAndroidFlightProfileTrace,
  cleanupFlightDateTimeDisplay,
  enrichFlightStopSummary,
  enrichFlightOfferLevelDateTimes,
  extractGlobalFlightDateTimeCandidates
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

console.log("V10 FLIGHT OCR REGRESSION PASS");

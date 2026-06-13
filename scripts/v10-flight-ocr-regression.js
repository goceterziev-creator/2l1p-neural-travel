const assert = require("assert");

process.env.DB_FILE = process.env.DB_FILE || "storage/generated/V10_FLIGHT_OCR_TEST_DATABASE.json";

const {
  buildBookingAndroidFlightProfileTrace,
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

console.log("V10 FLIGHT OCR REGRESSION PASS");

const assert = require("assert");

process.env.DB_FILE = process.env.DB_FILE || "storage/generated/V10_FLIGHT_OCR_TEST_DATABASE.json";

const {
  buildBookingAndroidFlightProfileTrace,
  cleanupFlightDateTimeDisplay,
  detectGenericConnectingFlight,
  enrichFlightStopSummary,
  enrichFlightOfferLevelDateTimes,
  extractFlightPriceFromText,
  extractGlobalFlightDateTimeCandidates,
  getFlightCoreBlockingReasons,
  inferConnectingAirline,
  parseConnectingFlightCheckout,
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
assert.equal(multiScreenshotParsed.flight.price, 762.61);
assert.equal(multiScreenshotParsed.metadata.missingFields.length, 0);

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

console.log("V10 FLIGHT OCR REGRESSION PASS");

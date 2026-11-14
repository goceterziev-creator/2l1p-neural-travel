# AYA Flight Data Consistency Fix V1 — local validation

Baseline: `1c95a13e4ac0478a2f5a60f3935edf698fc6fa77`.
Branch: `fix/aya-flight-data-consistency-v1`.
Environment: Linux x86_64, Node v24.22.1, 2026-11-14 UTC; local isolated databases, synthetic offers/users/images, actual headless Chrome and PDF generation. No production reads/writes were needed for implementation validation.

## Demonstrated causes and bounded correction

The original source of the reference offer's 2020 year remains **UNKNOWN**. The demonstrated defect is independent editing/persistence of summary and structured dates:

- Admin import review and flight summary inputs previously changed summaries without synchronizing segments.
- The writer retained segment strings; PDF correctly read their explicit year.
- An additional reproducible path was found during the full HTTP regression: with empty summaries and explicit 2020 segments, `fillFlightDisplayFallbacks()` constructed 2026 summaries from the offer period. Missing summaries now use existing structured segment dates first. Segment years are never changed by this fallback.

`public/flight-data-consistency.js` shares the existing travel date normalizer between server and browser. It compares explicit summary dates, grouped/combined segment representations, date aliases, legacy top-level segment fields and supplied proposal flight data. It does not infer a correct year from travelDates or the current date.

The editor presents exact conflicting values and requires an explicit SUMMARY / SEGMENTS / MANUAL source choice, then final confirmation. SUMMARY requires a complete unambiguous per-segment date mapping. MANUAL requires explicit YYYY-MM-DD dates. SEGMENTS retains the supplied segment years and rebuilds summaries. Correction is prepared on a copy, preserves route, flight numbers, airline, clocks/time zones, baggage, price and metadata, and is applied only after confirmation. Cancel leaves the model and database unchanged. Save is still a separate operation.

All reviewed import application paths and summary editing paths use the review function. An explicit Review action also permits intentional editing of an otherwise consistent historical flight. The server never silently resolves a conflict: POST/PUT return `422 / AYA_FLIGHT_DATA_CONFLICT` with exact conflict details before normalization/write/audit. PUT authorization and offerVersion verification precede this check.

The Gemini summary helper is reused, including its existing connecting-airport selection semantics. Existing date normalizer algorithms are unchanged; its export wrapper also exposes it to the browser. Flight-Date Safety, client status guards, occupancy, authorization and agency enforcement were not weakened.

## Final local commands

Each command below exited **0 / PASS** on the cumulative source patch.

| Command | Evidence/result |
| --- | --- |
| `node test/flight-data-consistency-regression.js` | 12 cases: exact conflicts, explicit choices, cancel, clean2026, historical2020, manual legs/overnight, aliases, malformed data, duplicate identity, legacy fields |
| `node test/flight-data-consistency-http-regression.js` | 12 groups; real HTTP + browser + PDF |
| `node test/flight-date-safety-http-regression.js` | 335 recorded PASS results across 18 fixture variants |
| `node test/flight-date-midnight-http-regression.js` | UTC rollover presentation behavior preserved; SENT after rollover rejected422 |
| `node scripts/aya-ready-sent-isolated-regression.js` | Status, authentication and agency refusals; unchanged DB |
| `node test/flight-date-safety-regression.js` | PASS |
| `node test/flight-date-resolver-regression.js` | PASS |
| `node test/flight-year-mismatch-regression.js` | PASS |
| `node test/presentation-flight-warning-regression.js` | PASS |
| `node test/aya-07-hotel-occupancy-regression.js` | PASS |
| `node test/offer-update-concurrency-regression.js` | 6 cases PASS |
| `node test/hotel-image-alias-cia-info-regression.js` | PASS |
| `node scripts/smart-import-hotel-money-regression.js` | PASS |
| `node scripts/offer-output-regression.js` | PASS |
| `node scripts/v10-flight-display-bg-regression.js` | PASS |
| `node scripts/v10-flight-ocr-regression.js` | PASS |
| `node scripts/print-presentation-route-regression.js` | Full actual print/PDF regression PASS |

The existing isolated VM harnesses were connected to the real new review helper. The HTTP suite now explicitly rejects newly submitted contradictory records, then seeds equivalent **isolated synthetic legacy records** to preserve coverage of existing presentation/status behavior. Its proposal fixture now deep-clones the adapter output before altering the proposal, avoiding shared references that previously also altered the primary flight.

## HTTP/browser evidence

- Anonymous update401; foreign agency403; database unchanged.
- Conflicting POST/PUT422, error details include 2020 and2026; database/audit unchanged.
- Incomplete/invalid segment payload422 with no mutation.
- Real browser Review cancel, card edit cancel and Smart Import Use Result cancel: model/database unchanged.
- Real browser SUMMARY choice + confirmation + Save: PUT200, both FR625/FR626 legs2026, one update audit; re-open retains values.
- Old offerVersion PUT409, unchanged DB.
- HTML200, print200, binary PDF200: 2026, FR625/FR626 and original 13:25/14:15/12:25/15:10 clocks; no2020 in extracted PDF text.
- Prices, markup, hotel IDs/images/occupancy/selection and agency preserved. Presentation adds only expected view/download telemetry; editorial version unchanged.
- Coherent historical2020 draft POST200 retains2020. READY/SENT/BOOKED and alternate booking reject422; no automatic replacement.
- Valid future dates plus unconfirmed occupancy still reject READY/SENT/BOOKED422. Valid coherent future flight with confirmed occupancy permits those existing transitions200.
- Full legacy matrix verifies hotel selection, prices/images, warnings, metrics, internal QA preview, direct client HTML/print/PDF and status protection.

An early full run correctly exposed the period-based fallback conflict described above; after the minimal fix the complete matrix passed. The complete print regression was repeated because that fallback is part of presentation. No assertions or safety gates were removed to obtain PASS.

## Compatibility and remaining limitations

- Inconsistent legacy drafts remain readable and editable for review, but cannot be saved until their flight data is explicitly reconciled. Direct API callers must submit coherent representations. Historical dates are allowed in coherent drafts; existing publication/status safety still applies.
- Flat-only segments without outbound/inbound mapping, mismatched duplicate identities/order, incomplete original dates and conflicting clocks require source review/re-import with explicit grouped mapping. V1 fails closed rather than guessing or discarding segments.
- Connecting endpoint-only summaries cannot authorize intermediate segment dates; MANUAL review is required.
- Browser dialogs provide the explicit operator review in V1; no new renderer or import engine was introduced.
- Local acceptance uses a frozen synthetic scenario in the future relative to execution on2026-11-14. It does not validate real supplier availability, production records or original import artifacts.
- External notifications are NOT VERIFIED. Production validation remains pending a separately authorized deployment and controlled QA.
- No production offer, database, configuration, deployment or MACHINE authority was changed. No merge/deployment is authorized by this report.

## PR #31 independent review follow-up — F1 single-date summaries

Reviewed commit: `169e4176ccd6415f90b76c1a6e25f91430072d5d`; local follow-up changes only this document and the consistency regression test. Runtime source is unchanged.

Rule: a single date in `flight.departure` denotes the outbound leg's first departure day; a single date in the legacy `flight.arrival` summary denotes the inbound leg's first departure day. It makes **no assertion about the arrival date**. This is compatible with the existing `parseBookingLastminuteFlightModal()` path, whose `formatLeg(leg,date,number)` emits one date plus departure/arrival clocks. A valid overnight arrival must not be forced onto the departure's calendar day.

`inspect().ok` means the supplied summary assertions do not contradict segments; it does not mean Flight-Date Safety is ready or every date has been operator-confirmed. The safety gate independently checks every segment departure/arrival and aliases against the real offer period and current server day. There is no inference of arrival year from a single summary date. `resolve(...,'summary')` requires explicit departure AND arrival dates per segment and rejects a single-date summary; explicit per-segment MANUAL review or retaining source segments remains necessary.

Three new targeted regressions cover:

1. Single outbound/inbound departure dates with a valid overnight arrival: consistency and safety pass; an incorrect inbound departure summary fails consistency.
2. Exact review example `16.11.2026` / departure `2026-11-16T23:30` / arrival `2027-11-17T01:30`: partial summary consistency passes, live safety fails with an out-of-period warning, and the actual `assertClientStatusSafety()` rejects READY/SENT/BOOKED with status422/code `AYA_FLIGHT_DATE_BLOCKED`. Raw values remain unchanged. This is an extracted real server-function regression, not a new HTTP or production run.
3. Single summary cannot authorize automatic arrival-year correction: SUMMARY resolution and operator Review reject it without mutation. Missing arrival or contradictory arrival aliases fail consistency.

Execution: `node test/flight-data-consistency-regression.js` — exit0, **15/15 PASS**, including the three new F1 cases. Fixed server-date context: 2026-11-14 UTC. No full HTTP/print suite was repeated because runtime code is unchanged. F1 verdict: **CLOSED — documented partial-summary contract, no demonstrated safety bypass**. Production validation and independent full-suite execution remain separate limitations.

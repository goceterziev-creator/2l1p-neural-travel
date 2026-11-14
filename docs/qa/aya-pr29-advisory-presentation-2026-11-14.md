# AYA PR #29 — regression QA and merge readiness

Verdict: **READY FOR MERGE — technical regression review**. The PR remains Draft for human review; this is not a merge/deployment authorization or production validation.

Repository: `goceterziev-creator/2l1p-neural-travel`.
Initial PR HEAD: `7474f8244745e0ef1a93a02e80ab1f91e86f2904`.
Base/main: `d6a1502227c8c887e7ce26f47e517787dab25d4b`.
Branch: `fix/aya-qa-warnings-nonblocking-presentation-20261114`.
Environment: local Linux, Node v24.22.1, Puppeteer/Chromium, isolated temporary JSON databases, synthetic offers/users, UTC 2026-11-14. No production credentials, DB or volume used. Historical FR625/FR626 fixture was exercised before 16 November 2026; that time context matters.

## Contract reviewed

PR runtime changes make client presentation advisory: `/offer/:id` redirects (302), `/api/offers/view/:id`, `/api/offers/:id/print`, and `/api/offers/:id/pdf` render invalid-flight or unconfirmed-occupancy offers instead of rejecting them for QA readiness. VIEWED is an observation rather than a readiness gate; a legacy SENT offer may become VIEWED when opened.

`assertClientStatusSafety` still checks flight dates and saved hotel occupancy for READY, SENT and BOOKED. Authenticated create/PUT/status handlers and the alternate `/book` path continue using it. No flight-date algorithm, occupancy confirmation, pricing, images, hotel selection, authentication middleware or agency-scope logic is changed by the QA follow-up.

Client presentation/share URLs are public by the existing contract. The alternate `/book` endpoint is also an existing public-link operation; the evidence proves its date/occupancy refusals, not a new authentication requirement for that endpoint. Protected admin read/write/preview/status routes are tested for 401/403. No broader security redesign is implied.

## Initial FAIL findings and bounded corrections

- Existing `test/flight-date-safety-http-regression.js` failed: redirect **302**, expected old **422**.
- Existing `scripts/aya-ready-sent-isolated-regression.js` passed READY/SENT refusals, then failed: invalid-date client HTML **200**, expected old **422**.
- Existing midnight regression default expected the former render-time 422 gate.

These assertions described the superseded presentation contract, not a demonstrated runtime bug. Updated only presentation/VIEWED expectations and strengthened checks for visible live warnings, successful real PDFs, protected mutation denials and exact metric/editorial isolation. Added the missing unconfirmed-occupancy, combined-failure and dismissed-warning HTTP cases. Isolated the READY/SENT harness's cwd/config/data paths and explicitly disabled local auth bypass. No production fixture or safety algorithm was altered. No additional runtime correction was needed: `server.js` remains exactly the PR's original runtime source.

## Commands and results

| Exact command | Exit | Evidence |
|---|---:|---|
| `AYA_GATE_REPORT=/workspace/aya-pr29-evidence/http-results.json node test/flight-date-safety-http-regression.js` | 0 | **330/330 recorded checks PASS**, 18 fixtures, **36 real PDFs** |
| `node scripts/aya-ready-sent-isolated-regression.js` | 0 | READY/SENT/BOOKED, legacy SENT→VIEWED, alternate booking, selected-second/no-hotel legacy cases, auth 401, other-agency 403; rejected writes leave DB bytes unchanged |
| `AYA_GATE_REPORT=/workspace/aya-pr29-evidence/midnight.json node test/flight-date-midnight-http-regression.js` | 0 | PDF 200 across UTC midnight; live verdict becomes not ready; subsequent SENT 422, no rejected-write mutation |
| `node scripts/print-presentation-route-regression.js` | 0 | Full existing print/PDF/image suite PASS, duration 72,764 ms; assertions and fixture unchanged |
| `node scripts/offer-output-regression.js` | 0 | 8 PASS; selected hotel, price overrides, images and print compatibility |
| `node test/presentation-flight-warning-regression.js` | 0 | 9/9 PASS; live warnings replace stale generated warnings, other notices/source data retained |
| `node test/flight-date-safety-regression.js` | 0 | 9/9 PASS; invalid/ambiguous/past dates and aliases remain unsafe |
| `node test/aya-07-hotel-occupancy-regression.js` | 0 | 10/10 PASS; independent occupancy and confirmation invariants |
| `node test/offer-update-concurrency-regression.js` | 0 | 6/6 PASS; stale edits and telemetry preservation |
| `node --check test/flight-date-safety-http-regression.js` | 0 | Syntax PASS |
| `node --check test/flight-date-midnight-http-regression.js` | 0 | Syntax PASS |
| `node --check scripts/aya-ready-sent-isolated-regression.js` | 0 | Syntax PASS |
| `git diff --check` | 0 | PASS |

The former wide print baseline FAIL is **now PASS** because the approved PR removes the render-time QA gate that prevented the fixture from being presented. No assertion or fixture was weakened to obtain that result. It is no longer reported as an outstanding failure for this PR.

## Real HTTP boundaries

The full matrix contains old 2020 dates against a 2026 period, expired dates, missing year resolved from a valid period, ambiguous year, valid dates, saved-proposal inconsistency, wrong arrival, connection/second-flight errors, date aliases, multiple conflicting dates, valid/expired ISO periods, occupancy-only failure, combined date/occupancy failure, and dismissed warnings.

| Boundary | Observed behavior | Verdict |
|---|---|---|
| Invalid 2020 flight vs 2026 period | HTML/print/PDF 200 with current `[FLIGHT_DATE_SAFETY]`; PDF retains 2020 rather than inventing a correction | PASS |
| Unconfirmed selected occupancy | HTML/default print/default PDF 200; visible `непотвърдена заетост` | PASS |
| Correct dates and confirmed occupancy | HTML/print/PDF 200; protected READY/SENT/BOOKED 200 | PASS |
| Dismissed warnings with invalid dates | Live flight-date warning remains visible in HTML/print/PDF | PASS |
| Invalid READY/SENT/BOOKED | PATCH, PUT and create refuse with 422 / `AYA_FLIGHT_DATE_BLOCKED` or `AYA_HOTEL_OCCUPANCY_BLOCKED`, DB byte-identical | PASS |
| Alternate `/api/offers/:id/book` | Invalid date/occupancy refuses with corresponding 422, DB byte-identical | PASS |
| Protected admin routes | No session 401; other agency 403; no mutation | PASS |
| Internal QA and draft editing | Authenticated preview and ordinary draft PUT remain 200 | PASS |
| Redirect / print | No DB/metric mutation | PASS |
| One HTML view | Exactly +1 clientViews and clientViewed=true; draft stays draft | PASS |
| Two successful PDF requests per fixture | Exactly +2 pdfDownloads; prices/hotels/images/flights/warnings/selection and other offers unchanged | PASS |
| Missing selected hotel (print/PDF) | 400 and byte-identical DB; no download accounting | PASS |
| Legacy SENT opened | Only expected SENT→VIEWED and view telemetry change | PASS |

Alternate hotel B is confirmed in the fixture; its explicit PDF correctly displays B's confirmed occupancy/image/name, while the default unconfirmed hotel A is shown as unconfirmed. We do not claim an unconfirmed-occupancy warning for B. Flight-date warnings remain offer-level and apply in both PDF selections. PDF text is decoded with the existing print regression's extraction helpers; actual embedded image objects are checked.

Metrics are **not unchanged** for successful public views/downloads: they change by the exact intended counts above. Protected editorial data and other offers remain unchanged. Invalid-date click tracking still returns its existing 422; this PR does not change that separate route.

## Midnight, risks and integration limits

A PDF is a snapshot rendered during generation. It may finish after UTC midnight and still be returned with download accounting. There is no claim that every warning is refreshed at final byte delivery after a concurrent edit/midnight change; current date/occupancy checks still apply to actual READY/SENT/BOOKED requests. The midnight test proves the newly expired offer cannot then become SENT. The existing latest-offer-existence check and serialized writer remain in PDF accounting; concurrency tests remain PASS.

No production offer was accessed or mutated. No production visual acceptance, supplier prices/availability or real reservations were tested. External notification delivery/background integrations were not instrumented and remain UNKNOWN; the isolated tests do not send WhatsApp/email. The admin interactive browser workflow was not rerun; the HTTP suite uses real handlers and real Chromium PDF generation.

At pre-publication GitHub review: PR OPEN/DRAFT, mergeable MERGEABLE / CLEAN; no reviews and no returned CI checks. Main API reports protected=false, rulesets empty. Missing CI is **not CI PASS**. Final HEAD and observed remote state are recorded in the accompanying integration report. Human review and any Draft transition/merge/deployment remain separate actions.

# AYA-07 independent hotel occupancy gate — 2026-10-14

Baseline: 62b78fad90186c3b09bd327388cee44c0c8977cf (main; PR #13 merged by the owner). This change is reviewable but NOT RELEASE READY. No merge/deploy performed.

## Root cause and scope

The prior admin QA required nonblank top-level Guests/travelDates but had no mandatory independently confirmed hotel occupancy. The list DTO fix exposed those trip fields correctly, allowing SAFE/QA100 even when hotel occupancy was absent. READY TO SEND also used a separate warning-count predicate. Trip-level Guests is the flight party; it must never populate hotel occupancy.

Each saved hotel now has occupancy {adults, children, rooms, childAges, confirmed}. Adults and rooms must be positive safe integers; children must be an explicitly supplied nonnegative safe integer. Ages remain null when unknown; when supplied, ages must match child count and be 0–17. Missing/invalid values cannot be confirmed. No values are inferred from flight, description, URLs, or screenshots. Existing records remain unchanged and unconfirmed at read time. Hotel source text may trigger consistency warnings, but never supplies structured counts or confirms them.

The per-hotel admin editor provides these fields and an explicit confirmation checkbox. Changing occupancy, hotel name or room clears confirmation. Imported hotel objects always start unconfirmed even if an upstream object carries true. No import was run. Hotels selected in the existing admin builder retain their own occupancy, independently of other options.

A shared browser/server helper returns the selected hotel's normalized occupancy plus a blockingWarning in hotelOccupancyStatus. The list and detail APIs compute this read-only; no migration writes stored offers. Admin getOfferWarnings checks the same helper on full records or DTOs. Missing/unconfirmed occupancy is actionable, so qaTone cannot return ready. READY TO SEND now uses the same QA gate; explicit review status remains excluded, and INFO-only reminders do not reduce score or block otherwise eligible draft offers.

Saved occupancy is retained by normalizeOffer and edit's hotel spread copies. Existing hotel ids are preserved. Client legacy HTML and registry multi-hotel HTML show occupancy and confirmation state. Dedicated PDF print HTML includes occupancy; client option changes update the displayed occupancy independently. Saved hotels override stale proposal occupancy through an exact id or unique-name match, never a flight-party fallback. Explicit PDF hotel selection remains supported. No pricing formula, saved price or flight normalization was changed.

## Synthetic evidence

The new test/aya-07-hotel-occupancy-regression.js has 10 passing scenarios: missing occupancy with valid trip fields; recognized-but-unconfirmed values; independent flight 2A+1C+1I and hotel 2A+2C/1 room; explicit confirmation removes only its own blocker; invalid counts/ages; selected-hotel switching; confirmation reset and imported unconfirmed state; HTML/print rendering and saved-field precedence; READY count; real normalizeOffer + JSON roundtrip + edit normalization + list/detail GET handlers; zero-child editor rendering.

The route/normalizer integration executes extracted actual application functions in an isolated VM with synthetic in-memory data and mocked route registration/auth/storage plumbing. It is not a full Express HTTP/browser/Puppeteer test. HTML prepared for PDF is tested, not a generated PDF binary. Existing markup/meal tests retain their assertions; VM dependency injection was updated. The AYA-02 extraction test keeps its count expectations and changes only its helper boundary marker. Existing AYA-07 positive fixtures now explicitly include confirmed hotel occupancy; the new tests cover the previously accepted missing case. Original AYA-06 image expectations are untouched.

## Verification and blockers

26 commands passed, including all 12 prior pre-merge checks and 10 new occupancy scenarios. Three additional relevant commands failed (exit 1):

- node scripts/print-presentation-route-regression.js — AssertionError: PDF image completion wait should be bounded to 2000ms. The exact same assertion fails on the unchanged baseline; GT63_PRINT_IMAGE_WAIT_MS does not meet that test's 2000 expectation. This patch does not change the PDF timing code or weaken the assertion.
- node scripts/offer-output-regression.js — Cannot find module 'dotenv'.
- node scripts/proposal-input-adapter-regression.js — Cannot find module 'dotenv'.

Dependency installation requiring additional network permission was interrupted; it did not complete. Package/lockfile changes are excluded. Before merge: restore test dependencies, resolve/triage the existing print-route failure, rerun all relevant checks. Production post-deploy QA status and READY count are UNKNOWN because this branch was not merged or deployed. The owner's earlier production SAFE/QA100 and READY10 observation is not a post-fix validation. No production offer, DB, import, message, reservation, payment or Railway configuration change was performed.

## Commands and actual exit codes

- `node test/aya-meal-markup-display-regression.js` — exit 0
- `node --test --test-reporter=tap --test-isolation=none test/aya-meal-markup-boundaries-regression.js` — exit 0
- `node test/aya-02-guest-child-count-regression.js` — exit 0
- `node test/aya-04-meal-label-regression.js` — exit 0
- `node test/aya-06-print-images-regression.js` — exit 0
- `node test/aya-07-readiness-regression.js` — exit 0
- `node scripts/hotel-print-images-regression.js` — exit 0
- `node scripts/presentation-view-model-regression.js` — exit 0
- `node --check server.js` — exit 0
- `node --check public/admin.js` — exit 0
- `node --check gt63-core/presentation-view-model.js` — exit 0
- `node --check gt63-core/hotel-print-images.js` — exit 0
- `node --test --test-reporter=tap --test-isolation=none test/aya-06-search-failure-regression.js` — exit 0
- `node test/aya-07-list-fields-regression.js` — exit 0
- `node --check test/aya-07-list-fields-regression.js` — exit 0
- `node --test --test-reporter=tap --test-isolation=none test/aya-07-hotel-occupancy-regression.js` — exit 0
- `node scripts/gt63-offer-engine-adapter-regression.js` — exit 0
- `node scripts/smart-import-consumer-adapter-regression.js` — exit 0
- `node --check test/aya-07-hotel-occupancy-regression.js` — exit 0
- `node --check test/aya-meal-markup-display-regression.js` — exit 0
- `node --check test/aya-02-guest-child-count-regression.js` — exit 0
- `node --check test/aya-meal-markup-boundaries-regression.js` — exit 0
- `node --check test/aya-07-readiness-regression.js` — exit 0
- `node --check public/hotel-occupancy.js` — exit 0
- `node --check gt63-core/renderers/multi-hotel.js` — exit 0
- `node --check gt63-core/renderers/print-presentation.js` — exit 0
- `node scripts/print-presentation-route-regression.js` — exit 1; AssertionError [ERR_ASSERTION]: PDF image completion wait should be bounded to 2000ms
- `node scripts/offer-output-regression.js` — exit 1; Error: Cannot find module 'dotenv'
- `node scripts/proposal-input-adapter-regression.js` — exit 1; Error: Cannot find module 'dotenv'

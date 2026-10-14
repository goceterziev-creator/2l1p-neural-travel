# AYA-07 QA field projection audit — 2026-10-14

Baseline: main 99a48ca818c8ecdf67d744cfcdfc4ae1b791e747. Review only; no merge/deployment authorized for this change.

## Proven defect

server.js normalizeOffer stores body.travelDates as offer.travelDates and normalizes body.guests into offer.guests. GET /api/offers/:id returns the stored offer via withBulgarianOfferFlightDisplay. GET /api/offers instead maps summarizeOfferForList. Before this patch the latter omitted both fields unconditionally. public/admin.js loadOffers consumes this list; getOfferWarnings checks !String(offer.guests || '').trim() and !String(offer.travelDates || '').trim(). Thus even valid saved top-level fields were lost before QA. Patch adds only these two fields, using empty strings for absent values; no preview/flight fallbacks, confirmation inference or data writes.

The new regression fails against the exact baseline server blob d077c978095b4ae067ed996cd6e468b070be4f9a and passes after the two-line DTO correction.

## HTML and confirmation semantics

There are two display paths. Legacy HTML uses offer.travelDates / offer.guests. Registry HTML uses normalized/cloned offer.proposalInput; presentation-view-model uses input.client.travelDates (or input.destination.requested) and input.client.travelers. normalizeProposalInputForOffer validates version/mode/template, not independent dates/guest confirmation. proposal-input-adapter obtains client values from context. These are textual summary strings, not independently verified passenger/date records. QA's two named warnings check only nonblank top-level strings; no operator-confirmed boolean or structured passenger/date validation is involved. This patch does not add or claim such validation.

Visible registry text alone cannot justify removing the warnings. Preview-only or flight-only values remain insufficient. The user's production observation is reported evidence, not an independently fetched current authenticated offer snapshot: current saved top-level fields and hotel occupancy remain unverified. Source screenshots describe hotel occupancy 2 adults + 2 children, 1 room; flight composition 2 adults + 1 child + 1 infant must not be used to populate that occupancy. No offer or database was inspected through write operations or edited.

## Three messages

- Missing travelers: genuine false positive if saved offer.guests is nonblank, otherwise correct under current predicate. Proven list projection defect; current record applicability unverified.
- Missing dates: same distinction for offer.travelDates. Proven list projection defect; current record applicability unverified.
- Transfer reminder: getDestinationMismatchWarnings emits [INFO] when destinationMatchesFlight succeeds and a destination-profile airport signal exists. It asks the operator to check transfer, but does not inspect transfer confirmation and does not prove transfer is absent. Preserve it. getOfferWarnings retains validationWarnings; warningSeverity classifies [INFO] as info; qaScore and qaTone exclude it from actionable warnings.

QA 54 is consistent with 100 - (2 actionable warnings * 18) - 10 for missing travelDates. Three displayed messages can comprise two actionable warnings plus one INFO. HIGH RISK follows score < 60; it does not establish three material defects.

## Boundaries and remaining gaps

No SAFE/READY predicate changed. qaTone still rejects any actionable warning, critical finding, or low score. Stored uncertainty warnings remain present through the DTO. Tests establish that missing top-level fields remain blocking despite visible preview strings/flight composition and that an explicit hotel-occupancy uncertainty remains blocking even when trip-level fields exist. This does not prove automatic detection of every missing hotel occupancy: current QA has no dedicated independently confirmed hotel-occupancy schema/gate, and a bare trip-level guests string is not hotel occupancy confirmation. Supplying valid list fields can remove the two false warnings; that alone is not evidence the offer is ready for delivery.

No current offer confirmation, transfer confirmation or hotel occupancy was fabricated. An authorized read-only inspection of the current QA offer's top-level and proposalInput fields is still needed to classify the two warnings for that specific record. Source screenshots alone do not fill the record.

## Validation

All commands exited 0: existing 12 pre-merge checks (meal/markup, AYA-02, AYA-04, AYA-06, AYA-07, image/presentation regressions; server/admin/view-model/image syntax), existing five-case image-search failure suite, new test/aya-07-list-fields-regression.js and its syntax check. New test uses synthetic data only. Baseline negative control exits 1 because the list omits travelDates. Detailed commands/output retained in the task's local test-results.json and logs.

Changed files: server.js (two DTO fields), test/aya-07-list-fields-regression.js (cross-boundary synthetic regression), this audit note. No renderer, readiness criteria, offers, database, Railway configuration, imports or messaging changed.

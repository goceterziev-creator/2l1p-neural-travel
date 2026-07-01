# GT63 Known Limitations

Version: 1.0

This file lists accepted limitations for controlled closed beta. These are not ignored problems; they are known boundaries with operator workarounds.

## Multi-Image Connecting Flights

Status:
Beta limitation

Accepted:
YES

Impact:
Some complex connecting itineraries may still require operator review, especially when OCR text is sparse, reordered, or partially hidden.

Workaround:
Use operator review and compare the generated segment review against the original screenshots.

Do not:
Do not add one-off carrier patches unless a repeated pattern proves the generic segment parser is missing a reusable rule.

## Some OCR Mobile Screenshots

Status:
Beta limitation

Accepted:
YES

Impact:
Android and mobile browser screenshots can produce distorted text, missing prices, broken month names, or reordered flight timelines.

Workaround:
Use operator review, upload a clearer screenshot, or manually correct fields before sending the client offer.

Do not:
Do not lower confidence thresholds just to make difficult mobile screenshots pass.

## Airline Label Quality

Status:
Beta limitation

Accepted:
YES

Impact:
Some imports may produce imperfect airline labels when OCR reads nearby words as carrier names.

Workaround:
Operator review and manual correction.

Do not:
Do not block an otherwise valid import only because airline confidence is lower, if route, dates, times, and price are usable.

## Hotel Enrichment Completeness

Status:
Beta limitation

Accepted:
YES

Impact:
Some hotel screenshots may miss optional enrichment fields such as exact distance, meal wording, amenities, or room availability.

Workaround:
Operator review and manual polish before publishing.

Do not:
Do not let missing optional hotel enrichment block the entire offer if hotel name, price, room, and destination are usable.

## Airport Resolver Shadow Mismatches

Status:
Expected during V10.25A shadow validation

Accepted:
YES

Impact:
JSON airport metadata may occasionally differ from the hardcoded resolver during shadow mode.

Workaround:
Use Admin Airport Resolver metrics and Last mismatches to add missing aliases to the runtime airport database.

Do not:
Do not switch to JSON airport resolution until mismatch behavior is understood and GT63 approves V10.25B.

## Generated Files In Working Tree

Status:
Operational limitation

Accepted:
YES

Impact:
QA reports, boundary databases, PDF reviews, ad assets, and local inspection outputs may leave the git working tree dirty.

Workaround:
Stage only the files relevant to the current task.

Do not:
Do not commit generated artifacts unless the task explicitly requires them.

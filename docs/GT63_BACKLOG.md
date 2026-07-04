# GT63 Backlog

Version: 1.0

This backlog captures future ideas that are useful but not ready for implementation.

The goal is to preserve architectural direction without starting work before production data justifies it.

## Future Idea — V10.28 Site Layout Resolver

Status:
PARKED

Reason:
Good architecture direction, but too early.

Current priority:
Use Beta Dashboard data to identify and reduce the largest measured review bottleneck.

Do not implement until:

- enough real regression cases exist per provider/layout
- dashboard shows repeated layout-specific failures
- shadow detection can be validated without changing production parsing

Future rollout:

- V10.28A — Layout Detection Shadow Only
- V10.28B — Layout Metrics
- V10.28C — Layout-assisted Parser

GT63 rule:
PRODUCTION DATA BEFORE ARCHITECTURE.

## Future Idea — V11 Dual Source Screenshot Merge

Status:
PARKED

Reason:
Real beta screenshots show that one screenshot is rarely the best source for every field.

Card screenshots usually expose commercial truth more clearly:

- route
- travel dates
- total price
- passenger count
- direct / connecting summary

Detail screenshots usually expose itinerary truth more clearly:

- airline
- segment chain
- airport codes
- flight numbers
- layovers
- baggage

Do not implement until:

- enough real card + detail pairs exist in the Regression Library
- Beta Health confirms repeated failures in price, route, or date selection that card screenshots would solve
- the merge can run in shadow mode without changing production parsing
- the system can prove which screenshot supplied each final field

Future rollout:

- V11A — Dual Source Detection Shadow Only
- V11B — Field Source Metrics
- V11C — Card + Detail Merge Shadow
- V11D — Production merge only after regression confidence

Source priority draft:

- Card wins for price, route, dates, passenger count.
- Detail wins for segments, airline, flight numbers, layovers, baggage.
- Existing parser behavior remains the fallback until shadow confidence is proven.

GT63 rule:
USE THE STRONGEST SCREENSHOT SOURCE PER FIELD.

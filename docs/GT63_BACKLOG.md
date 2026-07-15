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

## Future Idea - Roamy Stay Program Engine

Status:
PARKED

Reason:
GT63 offers can become more valuable if they include a day-by-day stay program in the Roamy style: hidden gems, local discoveries, quieter premium experiences, and less obvious places worth visiting.

Do not implement inside the GT63 extraction or offer engine yet.

Future architecture:

- GT63 Product Model
- Roamy Adapter
- Roamy Stay Program Engine
- Stay Program JSON
- GT63 Proposal Renderer

Input draft:

- destination
- travel dates
- nights
- travelers
- hotel area
- travel style

Output draft:

- title
- day-by-day plan
- hidden gems
- local food / culture / walk ideas
- practical notes

Do not implement until:

- current GT63 Core corrections are stable
- editable review fields are reliable
- client proposals consistently render flight and hotel data cleanly
- Roamy can be tested with fixtures before live generation

GT63 rule:
CUSTOMER VALUE FIRST, BUT DO NOT MERGE PRODUCT ENGINES TOO EARLY.

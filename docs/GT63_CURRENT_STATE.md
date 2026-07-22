# GT63 Current State

## Last Verified

Last verified:

- Date: 2026-07-22
- Commit: 1c2be86d92ca025e29f52feada7c16255b80f4cb
- Branch: main

## Release Status

GT63 V11.5 FINAL CLIENT EXPERIENCE LOCK = PASS

GT63 PRINT PRESENTATION MODE V1 = PASS / PRODUCTION VERIFIED / LOCKED

## Relevant Commits

- 8b57b9a - GT63 V11.5 final data consistency lock
- cd08292 - GT63 V11.5 final client experience lock / release marker
- ed311a5 - GT63 Print V1 shared presentation view model foundation
- 76f2647 - GT63 Print V1 dedicated print HTML route
- e45c984 - GT63 Print V1 Puppeteer print pipeline
- 1c2be86 - GT63 Print V1 PDF image resilience

## Locked Product Areas

- Interactive client HTML;
- unlimited multi-hotel comparison;
- selected hotel synchronization;
- dynamic selected price;
- meal-plan consistency;
- Bulgarian client copy;
- evidence-bound recommendation;
- client timeline;
- WhatsApp CTA;
- desktop presentation;
- Android/mobile presentation;
- dedicated Print HTML;
- Puppeteer PDF export;
- PDF image resilience.

## Production

Facts verified from git history, release report, or live checks on 2026-07-22:

- GitHub main branch: verified aligned to `1c2be86d92ca025e29f52feada7c16255b80f4cb`.
- Railway auto deploy: triggered by push to `main`; production checks confirmed the deployed behavior after the new build became active.
- `/api/health`: live check returned `200`.
- `/gt63-core/product/`: live check returned `200`.
- `/api/smart-import`: live unauthenticated POST returned `400 Bad Request`, indicating the route is available and expects a normal upload/auth workflow.
- Gemini test endpoint protection: live unauthenticated POST to `/api/import-image-gemini-test` and `/api/universal-travel-intake-gemini-test` returned `403 Forbidden`.
- `GT63_ENABLE_VISION_TEST_ENDPOINTS`: test endpoints are protected by `requireVisionTestEndpointEnabled` in `server.js`; keep disabled by default unless explicitly testing.
- Production offer `OFF-1784592983358-rahea`: selected Print HTML returned `200`.
- Production offer `OFF-1784592983358-rahea`: comparison Print HTML returned `200`.
- Production offer `OFF-1784592983358-rahea`: selected PDF returned `200` with valid `%PDF-` header after the PDF image resilience fix.
- Production offer `OFF-1784592983358-rahea`: comparison PDF returned `200` with valid `%PDF-` header.

Reported but not independently verified in this documentation task:

- Creating a new authenticated production proposal through the full Smart Import UI flow.

## QA Lock

Latest passing commands and results recorded on 2026-07-22:

- `node --check server.js`: PASS
- `node --check scripts/print-presentation-route-regression.js`: PASS
- `node scripts/print-presentation-route-regression.js`: PASS
- `node scripts/proposal-renderer-registry-regression.js`: PASS
- `node scripts/final-client-renderer-registry-regression.js`: PASS
- `npm.cmd run qa`: PASS
- Smart Import adapter regression: PASS
- Proposal renderer registry regression: PASS
- Final client renderer registry regression: PASS
- Presentation view model regression: PASS
- Print presentation route regression: PASS
- Luxury V11 renderer regression: PASS
- GT63 Core E2E smoke: PASS
- V9 boundary test: PASS

Observation:

- A transient GT63 Core E2E smoke failure was observed during Print V1 work, then the specific test passed standalone and the repeated full QA suite passed. This is tracked as a test stability observation, not a Print V1 defect.

## Current Capabilities

- Smart Import;
- Review Draft;
- reviewedModel;
- approvedModel;
- readiness gate;
- proposal preview;
- Create Offer bridge;
- unlimited hotelOptions[];
- selected hotel synchronization;
- dynamic final price;
- hotel galleries;
- hotel URLs;
- Bulgarian client HTML;
- GT63 recommendation;
- timeline;
- WhatsApp CTA;
- desktop/mobile experience;
- dedicated static Bulgarian Print HTML;
- selected and comparison print modes;
- validated selectedHotelId with controlled errors;
- text-selectable A4 PDF through Puppeteer;
- Print PDF resilience to slow, broken, invalid, DNS-failing or empty external image URLs.

## Known Limitations

- Newly generated production proposals should still be manually verified after significant deployment changes.
- Provider Resilience is a separate future task only if normal Smart Import continues to show provider failures.
- Interactive HTML remains locked.
- Generated QA, runtime DB and local PDF artifacts remain uncommitted by default.
- Further Print V1 changes require a documented production defect, accessibility defect or user-tested issue.

## Update Rule

Every completed milestone must update this file in the same commit or release marker.

## New Chat Bootstrap

Read these files first:

- docs/GT63_CANONICAL_CONTEXT.md
- docs/GT63_CURRENT_STATE.md
- docs/GT63_NEXT_TASK.md
- AGENTS.md, if present

Then inspect:

- git status
- current branch
- latest commits
- remote alignment
- relevant renderer, server, Puppeteer and regression files

Treat the documents as project guidance, but verify the code and git state before acting.

If documentation conflicts with code or git history, stop and report the mismatch.

Do not silently redesign or adapt the architecture.

Summarize your understanding in no more than 15 lines, then continue with the exact task in docs/GT63_NEXT_TASK.md.

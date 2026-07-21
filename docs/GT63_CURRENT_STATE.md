# GT63 Current State

## Last Verified

Last verified:

- Date: 2026-07-21
- Commit: cd08292
- Branch: main

## Release Status

GT63 V11.5 FINAL CLIENT EXPERIENCE LOCK = PASS

## Relevant Commits

- 8b57b9a - GT63 V11.5 final data consistency lock
- cd08292 - GT63 V11.5 final client experience lock / release marker
- bb4c65c - GT63 V11.5 final client copy polish
- 9f653db - GT63 V11.5 sync hero chips and CTAs
- 65c6b5b - GT63 V11.5 final selected hotel sync

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
- Android/mobile presentation.

## Production

Facts verified from git history, release report, or live checks on 2026-07-21:

- GitHub main branch: reported and verified aligned to `cd08292`.
- Railway auto deploy: reported as triggered by push to `main`.
- `/api/health`: live check returned `200`.
- `/gt63-core/product/`: live check returned `200`.
- `/api/smart-import`: live unauthenticated POST returned `400 Bad Request`, indicating the route is available and expects a normal upload/auth workflow.
- Gemini test endpoint protection: live unauthenticated POST to `/api/import-image-gemini-test` and `/api/universal-travel-intake-gemini-test` returned `403 Forbidden`.
- `GT63_ENABLE_VISION_TEST_ENDPOINTS`: test endpoints are protected by `requireVisionTestEndpointEnabled` in `server.js`; keep disabled by default unless explicitly testing.
- Production `gt63-core/renderers/multi-hotel.js`: live asset contained V11.5 lock markers such as `Хранене за потвърждение` and `най-достъпният от шестте`.

Reported but not independently verified in this documentation task:

- Creating a new authenticated production proposal through the full Smart Import UI flow.

## QA Lock

Latest passing commands and results recorded on 2026-07-21:

- `npm.cmd run qa`: PASS
- Smart Import adapter regression: PASS
- Proposal renderer registry regression: PASS
- Final client renderer registry regression: PASS
- Luxury V11 renderer regression: PASS
- GT63 Core E2E smoke: PASS
- V9 boundary test: PASS

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
- desktop/mobile experience.

## Known Limitations

- Print Presentation Mode is not yet implemented.
- Existing PDF/Puppeteer behavior must be inspected before implementation.
- Newly generated production proposals should still be manually verified after significant deployment changes.
- Provider Resilience is a separate future task only if normal Smart Import continues to show provider failures.
- Interactive HTML remains locked.

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

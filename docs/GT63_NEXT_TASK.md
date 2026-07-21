# GT63 Print Presentation Mode V1

## Goal

Generate a premium, factual, Bulgarian A4 Print HTML presentation from approved proposal data and export it through Puppeteer as a text-selectable PDF.

Interactive HTML remains the primary locked product.

## Phase 0 - Discovery

Before coding:

- locate renderer registry;
- locate shared presentation logic;
- locate selected hotel resolver;
- locate price and meal-plan resolver;
- locate server routes;
- locate current Puppeteer/PDF flow;
- locate regression fixtures;
- report any mismatch between documentation and code.
- If documentation conflicts with current code or git history, stop and report the mismatch before implementation.

## Architecture

Approved Proposal Model
-> Shared Presentation View Model
├── Interactive Client Renderer
└── Print Presentation Renderer
    -> Dedicated Print HTML
    -> Puppeteer
    -> Luxury PDF

## Required Deliverables

- dedicated /print route;
- shared presentation view model;
- selected print mode;
- comparison print mode;
- validated selectedHotelId;
- persisted selected hotel fallback;
- static Bulgarian Print HTML;
- A4 print CSS;
- deterministic page breaks;
- existing Puppeteer infrastructure;
- text-selectable PDF;
- clickable links where supported;
- no JavaScript-dependent content;
- no interactive hotel switching;
- no admin controls;
- unlimited hotelOptions[];
- selected hotel consistency;
- print and interactive data consistency;
- regression tests;
- visual fixtures.

## Selected Hotel Resolution

Rules:

- explicit selectedHotelId must belong to proposal.hotelOptions[];
- invalid explicit ID returns controlled error;
- no silent fallback to hotelOptions[0] when an explicit invalid ID is supplied;
- when no explicit ID exists, use persisted canonical selected hotel;
- only use the first hotel as a documented final fallback when no selected state exists.

## Print Modes

### selected

- default mode;
- full brochure for one selected hotel;
- selected hotel details only;
- no full details for every hotel.

### comparison

- concise comparison of all hotelOptions[];
- unlimited options;
- stable pagination;
- selected hotel visibly marked;
- no full-page detail section for every option by default.

## Non-Goals

- no OCR changes;
- no Gemini/OpenAI prompt changes;
- no SerpAPI changes;
- no Smart Import contract changes;
- no pricing changes;
- no persistence migration;
- no Interactive HTML redesign;
- no direct PDF drawing engine;
- no screenshot PDF;
- no duplicated business logic.

## Acceptance Criteria

- valid print route returns 200;
- invalid selectedHotelId returns controlled error;
- selected and comparison modes work;
- selected hotel matches Interactive HTML;
- price matches;
- meal plan matches;
- recommendation matches;
- flight summary matches;
- no internal workflow labels;
- no interactive controls;
- no blank trailing page;
- CTA/contact block remains together;
- comparison handles 1, 3, 6 and 10 hotels;
- Locked Interactive HTML regression suite remains PASS after shared-helper extraction.
- Puppeteer creates a non-empty valid PDF;
- Bulgarian text is readable;
- destination and selected hotel appear in PDF text;
- generated PDF fixtures are not committed by default.

## Visual Fixtures

- Tokyo selected hotel;
- Tokyo comparison with 6 hotels;
- Maldives selected hotel;
- missing stars;
- unknown meal plan;
- missing baggage;
- long hotel name;
- 10 hotel options.

## Final Status

Use exactly one:

GT63 PRINT PRESENTATION MODE V1 = PASS

GT63 PRINT PRESENTATION MODE V1 = PASS WITH WARNINGS

GT63 PRINT PRESENTATION MODE V1 = NOT READY

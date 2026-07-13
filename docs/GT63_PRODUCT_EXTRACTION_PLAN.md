# GT63 Product Extraction Plan

## Decision

GT63 should become a separate product through extraction, not through a full rewrite.

The existing repository remains the working engine and proof base:

```text
2L1P Neural Travel Lab / Legacy Engine
```

The new product becomes:

```text
GT63 Core Platform
```

The product shell should use stable API contracts against the current engine first. Only after a module is stable, isolated, and proven should it be physically extracted.

## 1. Product Definition

GT63 turns raw travel information into a checked, sellable client proposal with minimal operator effort.

The core product workflow is:

```text
Client + Destination
-> Smart Import
-> Flight extraction / Hotel enrichment
-> Agent Review
-> Travel JSON
-> Luxury HTML Proposal
-> WhatsApp / PDF
```

GT63 is:

- an operator console for travel agents;
- a proposal experience engine;
- a screenshot-to-offer workflow;
- a review-first system where uncertain extraction is allowed to stop for operator review;
- a bridge between travel data, visual proposal presentation, and client conversion.

GT63 is not:

- an ERP;
- a booking engine;
- an accounting system;
- a full CRM;
- a GDS;
- a payment processor;
- an internal debugging dashboard.

The product boundary is the shortest reliable path between:

```text
"I have a client"
```

and:

```text
"I sent a proposal"
```

## 2. Existing System Inventory

| Module | Purpose | Maturity | Current files | Dependencies | Decision |
| --- | --- | --- | --- | --- | --- |
| Smart Import | One upload entry that classifies screenshots and routes flight/hotel sources | New but strategically important | `server.js`, `public/admin.html`, `public/admin.js` | Gemini, SerpAPI, upload storage | Expose through API, then move into Core product shell |
| Gemini Flight Intake | Extract structured flight data from screenshots | Proven enough for beta flight intake | `server.js`, `scripts/v10.26a-vision-spike.js` | `OPENAI_API_KEY` / Gemini-compatible vision path depending runtime, screenshot files | Expose through stable engine API first |
| Hotel Hint + SerpAPI Enrichment | Use screenshot hints plus search authority for hotels | Proven direction, still needs polish | `server.js` | `SERPAPI_KEY`, hotel screenshot hints, image search | Keep in Lab until quality stabilizes, then extract adapter |
| Legacy OCR / parsers | Historical OCR and provider-specific parsing fallback | Useful fallback, high complexity | `server.js`, `scripts/v10-flight-ocr-regression.js`, `data/ocr-patterns.json`, `CONFIG/ocr-patterns.json` | Tesseract, OCR pattern DB, legacy profile rules | Keep in Lab as fallback and benchmark |
| Bulgarian flight display | Human-readable Bulgarian itinerary rendering | Good extraction candidate | `server/flight-display-bg.js`, `server/renderers/flight-display-bg.js`, `server/travel-normalizers/airport-normalizer.js`, `server/travel-normalizers/date-normalizer.js`, `data/reference/airport-bg.json`, `data/reference/iata-airports-bg.json` | Airport/date reference data | Extract early as pure renderer/normalizer package |
| Airport shadow database | Airport metadata and shadow resolver safety | Useful infrastructure | `data/airports.json`, `CONFIG/airports.json`, `data/README.md`, `server.js` | Runtime config, hardcoded fallback | Keep in Lab until contracts are stable; extract reference data later |
| Offer Builder / renderer | Builds client-facing HTML proposal | Proven, product-critical | `server.js`, `public/offer.html`, `public/styles.css`, `modules/pdfGenerator.js`, `templates/`, `prototypes/luxury-proposal-v11.html` | Offer data, images, QR/PDF tooling | Wrap through API first, extract after proposal V1 stabilizes |
| HTML-to-PDF | Converts offers to PDF | Operational | `server.js`, `modules/pdfGenerator.js`, `public/offer.html` | Puppeteer | Keep behind engine endpoint, extract worker later |
| WhatsApp / client delivery | Client sharing and QR flow | Operational | `server.js`, `public/offer.html`, `public/admin.js` | Offer IDs, QR generation | Include in Core V1, but reuse current engine |
| GT63 HOME | Operator entry point | New product layer | `public/admin.html`, `public/admin.js` | Existing offers API, Smart Import | Rebuild in product shell, not as deep admin dashboard |
| Admin workspace | Large operational/debug console | Mature but too technical for product shell | `public/admin.html`, `public/admin.js`, `server.js` | Most APIs | Keep in Lab as engineering console |
| Regression Library | Archive screenshots/OCR/parser outputs | Valuable internal QA | `server.js`, `storage/regression-library/`, `scripts/v10-flight-ocr-regression.js` | Persistent storage | Keep in Lab |
| Beta Health | Measures import/review workload | Valuable internal QA | `server.js`, `public/admin.js` | Regression Library | Keep in Lab |
| Source Evidence | Preserve original screenshots | Product and audit value | `server.js`, `storage/source-evidence/` | Uploaded files | Expose through product where needed, store implementation stays in Lab initially |
| Auth / agency scope | User roles and agency boundaries | Required but can be simplified for V1 | `server.js`, `DATABASE/database.json`, `scripts/v9-boundary-test.js` | DB persistence, capability middleware | Reuse initially; extract only after Core proves itself |
| CRM / payments / commissions | Future business workflow | Not V1 | mixed historical/admin fields | Stripe/Revolut future integrations | Postpone |

## 3. Legacy Engine Boundary

The Lab keeps everything that is either experimental, historical, diagnostic, or too coupled to move safely.

Permanently or temporarily inside Lab:

- legacy OCR and provider-specific parsers;
- regression fixtures and screenshot archives;
- Beta Health and import review analytics;
- airport/price shadow metrics;
- Universal Intake deprecated/internal tools;
- diagnostics and trace viewers;
- historical offers and test cases;
- monolithic `server.js` until API contracts are stable;
- current `public/admin.html` / `public/admin.js` engineering console;
- fallback parsers and benchmark scripts.

The Lab should remain deployed and usable while GT63 Core is being extracted.

## 4. GT63 Core V1 Boundary

GT63 Core V1 should include only the operator-facing product path:

1. HOME
2. Smart Import
3. Review
4. Offers
5. Proposal Preview
6. WhatsApp
7. HTML-to-PDF

Out of V1:

- CRM expansion;
- payments;
- commissions;
- accounting;
- agent performance dashboards;
- AI sales assistant;
- booking engine;
- public marketplace features;
- deep diagnostics.

The Core UI should feel like a travel proposal command center, not a developer dashboard.

## 5. Stable API Contracts

These contracts should be frozen before a new repository depends on the engine.

### Source Classification

```http
POST /engine/classify-source
```

Request:

```json
{
  "intakeId": "string",
  "sources": [
    {
      "sourceId": "string",
      "filename": "string",
      "mimeType": "string"
    }
  ]
}
```

Response:

```json
{
  "sources": [
    {
      "sourceId": "string",
      "sourceType": "flight|hotel|mixed|unknown",
      "confidence": 0.0,
      "reason": "string"
    }
  ],
  "warnings": []
}
```

Current implementation source: `/api/smart-import` in `server.js`, `classifySmartImportSource()`.

### Gemini Flight Extraction

```http
POST /engine/extract-flight
```

Request:

```json
{
  "intakeId": "string",
  "destination": "string",
  "sourceIds": ["string"]
}
```

Response:

```json
{
  "flight": {
    "airline": "string",
    "route": "string",
    "outboundSegments": [],
    "inboundSegments": [],
    "price": 0,
    "baggage": "string",
    "notes": "string"
  },
  "canonical": {},
  "warnings": []
}
```

Current implementation source: `extractFlightWithGeminiVision()` in `server.js`.

### Hotel Hint Extraction

```http
POST /engine/extract-hotel
```

Response:

```json
{
  "hotelHints": {
    "name": "string",
    "area": "string",
    "room": "string",
    "meal": "string",
    "price": 0
  },
  "missingFields": [],
  "warnings": []
}
```

Current implementation source: `extractHotelHintWithSerpApi()` in `server.js`.

### SerpAPI Hotel Enrichment

```http
POST /engine/enrich-hotel
```

Response:

```json
{
  "hotel": {
    "name": "string",
    "stars": "",
    "area": "string",
    "description": "string",
    "imageUrls": []
  },
  "sourceAuthority": {
    "source": "serpapi|screenshot|manual",
    "warnings": []
  }
}
```

Current implementation source: `findHotelImagesWithSerpApi()`, `normalizeHotelTextToBulgarian()`, `mergeImportedHotelRecords()` in `server.js`.

### Travel Data Normalization

```http
POST /engine/normalize-offer
```

Response:

```json
{
  "offer": {
    "clientName": "string",
    "destination": "string",
    "travelDates": "string",
    "flights": [],
    "hotels": [],
    "warnings": []
  }
}
```

Current implementation source: `normalizeOffer()` and related helpers in `server.js`.

### Proposal Rendering

```http
POST /engine/render-proposal
```

Response:

```json
{
  "html": "string",
  "viewUrl": "string",
  "offerId": "string"
}
```

Current implementation source: `renderOfferHtml()` and `/api/offers/view/:id` in `server.js`.

### PDF Rendering

```http
POST /engine/render-pdf
```

Response:

```json
{
  "pdfUrl": "string",
  "offerId": "string"
}
```

Current implementation source: `/api/offers/:id/pdf`, `modules/pdfGenerator.js`, Puppeteer dependency.

## 6. Extraction Order

Extract in this order:

1. Schemas and canonical Travel JSON types.
2. Reference data:
   - `data/reference/airport-bg.json`
   - `data/reference/iata-airports-bg.json`
   - stable portions of `data/airports.json`
3. Pure normalizers:
   - `server/travel-normalizers/airport-normalizer.js`
   - `server/travel-normalizers/date-normalizer.js`
4. Pure renderers:
   - `server/renderers/flight-display-bg.js`
5. External service adapters:
   - Gemini flight extraction wrapper
   - SerpAPI hotel enrichment wrapper
6. Proposal renderer wrapper.
7. PDF worker.
8. Persistence/auth only after V1 product usage is proven.

Do not extract first:

- the monolithic `server.js`;
- the current admin UI;
- historical OCR profiles;
- Beta Health;
- regression archive internals.

## 7. Product Shell Strategy

Build the new GT63 product shell as a clean operator frontend that calls the current engine through stable APIs.

Initial product shell:

```text
GT63 Core UI
-> Engine API adapter
-> Existing 2L1P Lab server
```

This lets the product become clean without freezing the working beta.

The new shell should not import `server.js`, `public/admin.js`, or Lab internals directly. It should know only stable contracts.

The old admin remains available as:

```text
Engineering Console
```

## 8. Repository Strategy

Do not create a new repository immediately.

Create a new repository when these are true:

- Smart Import flow is locked.
- Flight and hotel JSON contracts are stable.
- At least one engine API contract is live and tested.
- HOME and Review can work without direct dependency on old `admin.js`.
- The old repository remains deployed and operational.

Proposed names:

```text
2l1p-neural-travel-lab
gt63-core-platform
```

Possible package strategy later:

```text
@gt63/travel-schema
@gt63/flight-display-bg
@gt63/proposal-renderer
@gt63/engine-client
```

Compatibility rules:

- API contracts are versioned.
- Breaking changes require a new version.
- The Core product depends on contracts, not internal files.
- Lab can evolve internally as long as contracts remain stable.

## 9. Migration Phases

### Phase 0: Document and Freeze Contracts

- Keep production unchanged.
- Define engine contracts.
- Document current dependencies.
- Add contract tests around Smart Import and proposal rendering.

### Phase 1: New Product Shell Using Legacy APIs

- Build clean HOME, Smart Import, Review, Offers, Preview.
- Use the current engine APIs.
- Keep current admin as diagnostics.
- No module movement yet.

### Phase 2: Extract Pure Modules

- Move schemas, reference data, date/airport normalizers, and Bulgarian renderers.
- Keep identical outputs through regression tests.
- No service extraction yet.

### Phase 3: Extract Gemini / SerpAPI / PDF Services

- Wrap external providers behind service adapters.
- Add retry/error diagnostics per provider.
- Keep Lab fallback available.

### Phase 4: Independent Persistence/Auth

- Only after GT63 Core proves real proposal workflow value.
- Move offer persistence and agency auth if needed.
- Keep migration reversible.

### Phase 5: Legacy Admin Retirement

- Retire old admin only after GT63 Core handles real operational usage.
- Keep Lab accessible for diagnostics until no longer needed.

## 10. Safety and Rollback

Safety rules:

- Existing beta remains operational.
- No destructive migration.
- No production resolver/parser switch hidden inside extraction work.
- Use feature flags for new shell and new API contracts.
- Keep parallel deployment until usage is proven.
- Keep source screenshots and review corrections.
- Keep rollback path to Lab admin.

Rollback path:

```text
GT63 Core issue
-> route operator back to Lab admin
-> keep engine and historical offers intact
-> patch Core without blocking proposal delivery
```

## 11. Exit Criteria

### Create New Repo

Create `gt63-core-platform` only when:

- Smart Import is stable enough for normal operator use;
- Flight/hotel JSON contracts are documented;
- product shell can call engine APIs;
- offer creation, preview, WhatsApp, and PDF work from the shell;
- the Lab remains deployed.

### Switch Agents to GT63 Core

Switch agents when:

- 20-30 real offers pass through Core without blocking rollback;
- Smart Import and manual correction flow are faster than old admin;
- proposal preview and PDF are reliable;
- source evidence is preserved;
- critical failures show clear operator messages.

### Stop Old Admin

Stop old admin only when:

- GT63 Core covers daily operator workflow;
- diagnostics are either no longer needed or moved into a Lab-only internal route;
- no rollback to old admin has been needed for a defined period;
- historical offers remain accessible.

### Retire Legacy Routes

Retire legacy routes only when:

- replacement contracts have run in production;
- archived regression cases replay successfully;
- no current operator workflow depends on them;
- there is a documented recovery plan.

## 12. Explicitly Out of Scope

Do not include in GT63 Core V1:

- CRM expansion;
- payments and deposits;
- commissions;
- accounting;
- agent performance;
- AI sales assistant;
- booking engine;
- large dashboard analytics;
- provider-specific parser rewrites;
- full rewrite of `server.js`.

## Recommended Next Step

Continue with Phase 0:

1. Keep the existing Lab deployed.
2. Freeze the first Smart Import response contract.
3. Add contract tests around:
   - source classification;
   - flight result shape;
   - hotel result shape;
   - proposal handoff shape.
4. Only then start a clean GT63 Core product shell.

The goal is not to make the codebase beautiful first.

The goal is to create a clean product boundary while preserving the engine that already works.

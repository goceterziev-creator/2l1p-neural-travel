# GT63 Canonical Context

## Product Identity

- 2L1P Neural Travel is the Lab / Engine.
- GT63 Core is the product and agency workflow layer.
- GT63 transforms approved travel data into a clear client decision.
- GT63 is not primarily a PDF generator.
- Interactive HTML is the primary product artifact.

## Canonical Product Flow

Client Context
-> Smart Import
-> Review Draft
-> Readiness Gate
-> Approved Proposal Model
-> Shared Presentation Logic
-> Proposal Presentation
-> Create Offer
-> Interactive Client HTML

## Model Integrity

originalModel
-> reviewedModel
-> approvedModel

Rules:

- originalModel remains immutable evidence;
- operator edits create reviewedModel;
- approvedModel is the presentation source;
- Preview and Create Offer use reviewed/approved data;
- renderers do not mutate or repair persisted data;
- renderer logic does not independently recalculate business prices.

## Multi-Hotel Invariants

- hotelOptions[] is unlimited;
- no artificial three-hotel maximum;
- comparison renders all hotelOptions[];
- selected hotel details render exactly one selectedHotel;
- Hero, price, meal plan, recommendation, timeline, selected details and WhatsApp use one selectedHotel source of truth;
- selected hotel images belong only to selectedHotel;
- no hotelOption1 / hotelOption2 / hotelOption3 architecture.

## Canonical Presentation Architecture

Approved Proposal Model
-> Shared Presentation Logic
-> Interactive HTML Proposal

Approved Proposal Model
-> Shared Presentation Logic
-> Print Presentation Mode
-> Dedicated Print HTML
-> Puppeteer
-> Luxury PDF

State:

- Interactive HTML is primary.
- PDF derives from dedicated Print HTML.
- Do not build a direct PDF drawing engine.
- Do not print the interactive page as-is.
- Do not create screenshot-based PDF.
- Do not duplicate pricing, selection, meal plan, recommendation or flight logic.
- Interactive and Print modes consume the same resolved presentation values.

## Engineering Laws

RULE #17 - Proactive Better Path

If a faster, safer, simpler or more valuable path appears, state it immediately.

RULE #19 - Move One Layer Higher

OCR
-> Proposal Engine
-> Agency Workflow
-> Client Conversion

Additional laws:

- Render displays.
- Validation detects.
- Persistence stores.
- Migration transforms.
- Fix the narrowest responsible layer.
- Do not redesign working architecture without evidence.
- Never invent recommendation claims unsupported by approved data.
- Client-facing copy remains Bulgarian.
- Internal workflow labels never appear in client HTML.
- Generated QA, runtime DB and local PDF artifacts are not committed.

## Protected Areas

Do not modify unless explicitly requested:

- OCR pipeline;
- Gemini/OpenAI extraction prompts;
- SerpAPI enrichment;
- Smart Import contract;
- Proposal Input Adapter contract;
- Offer Engine pricing and margin logic;
- persistence architecture;
- V9 boundary/security logic.

## Product Locks

GT63 V11.5 Final Client Experience is locked.

Interactive HTML may change only for:

- proven regression;
- production bug;
- accessibility defect;
- documented real user feedback.

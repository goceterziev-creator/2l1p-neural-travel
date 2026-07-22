# GT63 Next Task

## Current Release Lock

GT63 PRINT PRESENTATION MODE V1 = PASS / PRODUCTION VERIFIED / LOCKED

The Print V1 implementation is complete and locked at:

- ed311a5 - GT63 Print V1 shared presentation view model foundation
- 76f2647 - GT63 Print V1 dedicated print HTML route
- e45c984 - GT63 Print V1 Puppeteer print pipeline
- 1c2be86 - GT63 Print V1 PDF image resilience

## Operating Rule

Do not start a new feature implementation from this file alone.

Before any next milestone:

- read `docs/GT63_CANONICAL_CONTEXT.md`;
- read `docs/GT63_CURRENT_STATE.md`;
- inspect git status, current branch, latest commits and remote alignment;
- inspect the relevant source and regression files for the requested task;
- stop and report any mismatch between documentation, code and git history before implementation.

## Locked Architecture

Approved Proposal Model
-> Shared Presentation View Model
   -> Interactive Client Renderer
   -> Print Presentation Renderer
      -> Dedicated Print HTML
      -> Puppeteer
      -> Luxury PDF

Rules:

- Interactive HTML remains the primary product artifact.
- Print HTML is a dedicated route.
- Puppeteer prints the dedicated Print HTML route.
- Do not print the interactive page as-is.
- Do not build a direct PDF drawing engine.
- Do not build screenshot-based PDF.
- Do not duplicate pricing, selected hotel, meal plan, recommendation or flight logic.
- Do not change locked Interactive HTML unless a real regression, accessibility defect or documented user-tested issue requires it.

## Eligible Next Work

Only start one of these after an explicit user request:

- production bug fix;
- accessibility defect fix;
- documented user-tested issue;
- Provider Resilience investigation if normal Smart Import shows provider failures;
- release documentation update after a completed milestone.

## Non-Goals

- no OCR changes;
- no Gemini/OpenAI prompt changes;
- no SerpAPI changes;
- no Smart Import contract changes;
- no pricing changes;
- no persistence migration;
- no Interactive HTML redesign;
- no Print V1 redesign;
- no direct PDF engine;
- no screenshot PDF;
- no generated QA, runtime DB or PDF artifacts in commits;
- never use `git add .`.

## Verification Baseline

For any future change touching presentation, print, PDF or shared view-model logic, keep these checks in scope:

- relevant targeted regression for the changed area;
- locked Interactive HTML regression suite remains PASS;
- Print presentation route regression remains PASS;
- PDF endpoint still uses dedicated Print HTML, not Interactive HTML;
- selected and comparison PDF modes remain valid;
- production smoke for a real offer when release readiness is claimed.

## Final Status Format

Use exactly one:

GT63 NEXT TASK = PASS

GT63 NEXT TASK = PASS WITH WARNINGS

GT63 NEXT TASK = NOT READY

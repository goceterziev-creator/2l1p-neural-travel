# GT63 Core Product Shell Boundary

## Status

Phase B.0 - Product Shell Boundary

This document locks the boundary between the current sandbox proof and the future GT63 Core product shell.

Phase A proved the independent chain:

```text
Smart Import Contract v1.0
-> Fixtures
-> Consumer Adapter
-> Product Model
-> Human Review
-> Readiness Gate
-> Client Preview
```

Phase B must turn that proof into a real product shell without reconnecting every screen directly to the Lab engine.

## Decision

GT63 Core UI must consume one product-facing provider interface.

It must not call legacy engine endpoints directly from each screen.

The provider can be backed by:

```text
Fixture Provider
Live Smart Import Provider
```

but both providers must return the same product model:

```json
{
  "flight": {},
  "hotel": {},
  "warnings": [],
  "readiness": "ready",
  "blockingIssues": []
}
```

The UI should not know whether the data came from offline fixtures or the live engine.

## Sandbox Assets

These files become the proof base for Core development:

| File | Role | Phase B decision |
| --- | --- | --- |
| `gt63-core/smart-import-consumer-adapter.js` | Converts Smart Import Contract v1.0 into GT63 product model | Keep as source of truth |
| `test/fixtures/smart-import/*.json` | Offline engine contract examples | Keep as fixture provider inputs |
| `gt63-core/mock-shell.html` | Raw product model proof | Keep as sandbox/demo only |
| `gt63-core/mock-review.html` | Operator review proof | Use as reference for Core Review |
| `gt63-core/mock-proposal-preview.html` | Client preview proof | Use as reference for Core Preview |
| `scripts/smart-import-consumer-adapter-regression.js` | Offline contract and leak regression | Keep in QA |

## Product Provider Boundary

Core UI talks to:

```text
Core Data Provider
```

The provider exposes:

```js
loadProductModel(input)
```

and returns:

```js
{
  flight,
  hotel,
  warnings,
  readiness,
  blockingIssues
}
```

Allowed provider implementations:

| Provider | Purpose |
| --- | --- |
| Fixture Provider | Offline development, regression, demos, rollback |
| Live Smart Import Provider | Calls the Lab engine Smart Import API and passes the response through the consumer adapter |

## What Core UI May Read

Core UI may read only:

- `flight`
- `hotel`
- `warnings`
- `readiness`
- `blockingIssues`

## What Core UI Must Not Read

Core UI must not read:

- `contractVersion`
- `mode`
- `sources`
- `classifications`
- `debug`
- `metadata`
- `universalIntakeDeprecated`
- raw Gemini JSON
- raw SerpAPI payloads
- legacy parser traces
- confidence internals

Those remain Lab or admin/debug concerns.

## Readiness Contract

Readiness is the product decision.

```text
READY
-> Proposal preview enabled
-> Continue to proposal

REVIEW
-> Proposal preview disabled
-> Operator must resolve blocking issues first
```

Warnings are informative.

Blocking issues are stopping conditions.

```text
Warnings != Blocking Issues
```

## Fixture To Live Swap

The transition from sandbox to product shell should follow this path:

```text
Core UI
-> Core Data Provider
   -> Fixture Provider
   -> Live Smart Import Provider
-> Product Model
```

The UI must not change when switching from fixture data to live Smart Import data.

If live Smart Import is unstable, Core can fall back to Fixture Provider for local development and demos.

## Rollback Strategy

Core must keep fixtures as a rollback and regression path.

If live integration fails:

1. keep Core UI working with Fixture Provider;
2. inspect Smart Import Contract response;
3. fix adapter or engine contract mismatch;
4. rerun offline regression before reconnecting live provider.

## Phase B.1 Entry Criteria

Phase B.1 may start when:

- Phase A sandbox chain is green;
- consumer adapter regression passes;
- fixture provider behavior is stable;
- Core UI remains isolated from legacy endpoints;
- no new mock screens are needed to prove the boundary.

## Phase B.1 Target

Create the first provider module:

```text
Fixture Provider
Live Smart Import Provider
```

with one shared interface:

```text
loadProductModel()
```

The first implementation may use fixtures only.

The second implementation may call the existing live Smart Import API, but it must still return the same product model and must pass through the existing consumer adapter.

## Non-Goals

Do not add in Phase B.0:

- new UI screens;
- upload flow;
- Gemini prompt changes;
- SerpAPI changes;
- proposal rendering changes;
- PDF generation;
- WhatsApp delivery;
- CRM;
- payments;
- commissions;
- accounting.

## Principle

GT63 Core is a product shell.

2L1P Neural Travel Lab remains the engine and experimentation layer.

The shell should stay simple:

```text
Product Model
-> Operator Decision
-> Client Proposal
```

Do not rebuild the Lab inside the Core.

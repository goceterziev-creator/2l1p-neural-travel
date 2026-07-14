# GT63 Core Product UI Boundary

## Status

Phase C.0 - Product UI Boundary

Phase A and Phase B are closed and passed.

GT63 Core is no longer proving architecture. Phase C starts the first real operator-facing product UI.

## Proven Chain

```text
Smart Import
-> Contract v1.0
-> Consumer Adapter
-> Core Data Provider
-> Product Model
-> Readiness Gate
-> Preview Decision
```

## Core UI Rule

GT63 Core UI talks only to the Core Data Provider.

The UI consumes only:

```json
{
  "flight": {},
  "hotel": {},
  "warnings": [],
  "readiness": "ready|review",
  "blockingIssues": []
}
```

## Forbidden UI Inputs

Core UI must not read:

- `contractVersion`
- `mode`
- `sources`
- `classifications`
- `debug`
- `metadata`
- Gemini internals
- SerpAPI internals
- deprecated flags
- legacy parser fields

Those belong to the Lab, diagnostics, or engine boundary.

## Development Source Mode

Fixture/live mode is a development control only.

Allowed providers:

```text
Fixture Provider
Live Smart Import Provider
```

Both providers must return the same product model shape.

The product UI must not change when switching provider.

## Phase C Scope

Phase C is product UI work.

Do not change:

- Smart Import contract
- Consumer Adapter
- Core Data Provider contract
- Gemini extraction
- SerpAPI logic
- Offer Engine
- production admin
- database schema

## Product UI Questions

The operator screen must answer three questions within 10 seconds:

```text
1. How do I start?
2. What was recognized?
3. Can I continue?
```

If the operator can answer those three questions quickly, the shell is successful.

## Phase C.1 HOME Shell Scope

The first product shell should include only:

- Home header
- proposal context fields
- screenshot input
- small dev-only source mode control
- start action
- review area
- readiness gate
- proposal preview

## Out Of Scope

Do not add:

- CRM
- payments
- commissions
- agent performance
- analytics
- client timeline
- tasks
- AI sales assistant
- archive
- offer history
- PDF
- WhatsApp
- authentication redesign
- database changes
- diagnostics panels
- admin workspace features

## Principle

Phase C is where GT63 starts becoming a product for a human operator.

The screen should feel like:

```text
Travel Proposal Workspace
```

not:

```text
Developer Dashboard
```

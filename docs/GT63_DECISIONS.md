# GT63 Decisions

Version: 1.0

This file records canonical GT63 decisions that should not be reopened without a new reason, new evidence, or explicit GT63 approval.

## Decision Format

Each decision should include:

- date or period
- subject
- decision
- status
- reason
- allowed next action
- blocked next action

## 2026-06 — LOT / Toronto

Decision:
Accepted beta limitation.

Status:
REVIEW

Reason:
The system imports successfully and operator review is available. The case is not a production blocker for controlled closed beta.

Allowed next action:
Collect real beta evidence and review only if this becomes frequent or business-critical.

Blocked next action:
No further V10.24 micro-patches for LOT / Toronto without explicit GT63 approval.

## 2026-06 — Airport Resolver

Decision:
Shadow migration first.

Status:
V10.25A

Reason:
Airport metadata should move out of `server.js`, but production resolver behavior must stay unchanged until shadow mode proves parity.

Allowed next action:
Observe shadow metrics, mismatch history, and real beta traffic.

Blocked next action:
Do not switch production airport resolution to JSON until GT63 approves V10.25B.

## 2026-06 — OCR Confidence Policy

Decision:
Review is valid production behavior.

Status:
ACTIVE

Reason:
The system must not invent missing route, date, price, hotel, or flight details when confidence is low.

Allowed next action:
Show admin/operator warnings and preserve clean client output.

Blocked next action:
Do not hide uncertainty by autofilling guessed client-facing fields.

## 2026-06 — Client Offer Surface

Decision:
Client proposal stays clean; debug and risk details stay admin-only.

Status:
ACTIVE

Reason:
The client buys a curated travel proposal, not an automation trace.

Allowed next action:
Improve wording, layout, and clarity for client-facing sections.

Blocked next action:
Do not expose OCR errors, parser warnings, capability messages, shadow resolver diagnostics, or internal QA details on client offer pages.

## 2026-06 — Parser Expansion

Decision:
Prefer global patterns over carrier-specific patches.

Status:
ACTIVE

Reason:
Carrier-specific patches create long-term parser debt. Global structures such as dates, times, airport codes, prices, segments, transfer times, and totals should be handled once where possible.

Allowed next action:
Add generic extraction, confidence, or shadow diagnostics.

Blocked next action:
Do not add airline-only fixes unless the issue is truly airline-specific and cannot be generalized safely.

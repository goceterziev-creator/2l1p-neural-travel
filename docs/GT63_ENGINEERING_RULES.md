# GT63 Engineering Rules

Version: 1.1

These rules define how GT63 changes are reviewed, stabilized, and promoted toward production behavior.

## RULE #1 — КАСПАРОВ REVIEW

Every meaningful change must be reviewed like a strong opponent is trying to find the weak move.

Before locking a change, check:

- What can break?
- What can regress silently?
- What can look correct but be wrong for the client?
- What should remain operator-only and never leak to the client?
- What needs proof before it becomes canonical behavior?

The goal is not to slow development down. The goal is to avoid winning the move and losing the position.

## RULE #2 — SHADOW BEFORE SWITCH

New production-critical resolvers, parsers, mappings, and decision layers must run in shadow mode before they replace existing behavior.

Shadow mode means:

- old behavior remains the production result
- new behavior observes the same input
- differences are counted and logged
- mismatches are visible to the operator/admin layer
- no production switch happens until GT63 explicitly approves it

Shadow mode is not optional for risky changes. It is the safe bridge between "implemented" and "trusted".

## RULE #3 — REVIEW IS A VALID OUTCOME

The system must not guess when confidence is low.

If a parser, resolver, OCR result, or validation layer is uncertain, the correct result can be:

- import with operator review
- warning only in admin
- no client-facing warning
- blocked import when core data is missing

Review is not failure. Review is production discipline.

The client should see a clean proposal. The operator should see the truth.

## RULE #4 — REGRESSION OR IT DIDN'T HAPPEN

A fix is not locked just because it works once in the browser.

Every production-relevant parser, resolver, pricing, OCR, PDF, or persistence change needs a regression proof when feasible.

Regression proof can be:

- a focused script fixture
- an existing QA harness assertion
- a before/after OCR trace
- a documented manual test with exact screenshot/PDF evidence

If a bug happened once, GT63 assumes it can happen again. The fix should teach the system how to catch it next time.

## RULE #5 — AUTOMATE THE 2ND REPETITION

The first repetition can be manual.

The second repetition should become a checklist, fixture, script, admin diagnostic, or documented rule.

If the same type of issue appears twice, GT63 should stop treating it as an isolated bug and start treating it as a workflow or system gap.

Examples:

- repeated OCR false positives become a confidence or validation rule
- repeated resolver mismatches become shadow diagnostics
- repeated PDF layout issues become print/layout constraints
- repeated manual checks become QA fixtures or admin visibility

Automation does not always mean code. Sometimes the right automation is a canonical document that prevents the same decision from being reopened.

# GT63 Engineering Rules

Version: 1.0

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

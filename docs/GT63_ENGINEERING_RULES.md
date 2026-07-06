# GT63 Engineering Rules

Version: 2.0

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

---

## RULE #2 — SHADOW BEFORE SWITCH

For any critical migration:

1. Keep production behavior.
2. Run shadow implementation.
3. Compare outputs.
4. Measure mismatches.
5. Switch only after confidence is proven.

Never switch blind.

Shadow mode is not optional for risky changes. It is the safe bridge between implemented and trusted.

---

## RULE #3 — REVIEW IS A VALID OUTCOME

The system is allowed to say:

REVIEW

instead of:

PASS

when confidence is insufficient.

Review is preferable to guessing.

The client should see a clean proposal. The operator should see the truth.

---

## RULE #4 — REGRESSION OR IT DIDN'T HAPPEN

If a bug was fixed:

- create regression
- verify regression fails before fix
- verify regression passes after fix

No regression = fix not complete.

If a bug happened once, GT63 assumes it can happen again. The fix should teach the system how to catch it next time.

---

## RULE #5 — AUTOMATE THE 2ND REPETITION

After the second repetition of the same manual task:

STOP

Ask:

- can this become automation?
- can this become configuration?
- can this become database?
- can this become workflow?

Do not accept endless repetition.

Automation does not always mean code. Sometimes the right automation is a canonical document that prevents the same decision from being reopened.

---

## RULE #6 — DEMOS BEFORE FEATURES

Before building a new feature:

Show the current workflow to a real user.

If the user cannot validate the value:
do not build the feature yet.

Real feedback beats assumptions.

---

## RULE #7 — SCREENSHOT FIRST

When investigating OCR issues:

1. screenshot
2. raw OCR
3. parser output
4. production decision

Never debug parser output before seeing the screenshot.

The screenshot is the source of truth.

---

## RULE #8 — DIVERSITY BEFORE VOLUME

When building regression libraries:

Prefer:

10 different providers

over

100 screenshots from one provider.

Diversity reveals architecture weaknesses.

Volume reveals implementation weaknesses.

---

## RULE #9 — FIX THE PATTERN, NOT THE WEBSITE

After the third similar fix:

STOP

Identify the common pattern.

Do not create provider-specific fixes if a shared solution exists.

Fix the pattern.

Not the website.

---

## RULE #10 — ONE BOTTLENECK AT A TIME

Identify the largest source of review cases.

Focus engineering effort on that bottleneck only.

Do not optimize secondary problems before measuring impact.

Metrics decide priority.

---

## RULE #11 — SHADOW BEFORE SWITCH

For any critical migration:

1. keep production behavior
2. run shadow implementation
3. compare outputs
4. measure mismatches
5. switch only after confidence is proven

Never switch blind.

---

## RULE #12 — REVIEW IS A VALID OUTCOME

The system is allowed to say:

REVIEW

instead of:

PASS

when confidence is insufficient.

Review is preferable to guessing.

---

## RULE #13 — METRICS BEFORE OPINIONS

If metrics exist:

use metrics.

Do not prioritize work using intuition alone.

Dashboard data overrides assumptions.

---

## RULE #14 — PRODUCTION DATA BEFORE ARCHITECTURE

Before building a new subsystem:

Collect real production examples.

Architecture should be driven by observed patterns,
not theoretical possibilities.

---

## RULE #15 — ARCHIVE BEFORE FIX

Before fixing a production issue:

Archive:

- screenshot
- OCR
- parser output
- review reasons

The case must be reproducible before modification begins.

---

## RULE #16 — 80/20 FIRST

Prioritize the smallest change that removes the largest amount of review workload.

Do not attempt to solve every problem simultaneously.

Solve the highest-impact problem first.

Measure again.

Repeat.

---

## RULE #17 — RIGHT ORDER BEATS MORE FIXES

The project wins by choosing the correct next fix, not by adding more fixes.

Before implementing:

- decide whether the idea is needed now
- decide whether it is too early
- decide whether it should be shadowed first
- decide whether it belongs in backlog, dashboard, configuration, or parser code

Do not build what sounds interesting.

Build what the product needs next.

Protect beta stability while making the system smarter.

---

## RULE #18 — USE THE STRONGEST SOURCE PER FIELD

When multiple screenshots describe the same offer, do not force one screenshot to answer every question.

Prefer the source where the product already displays that field most clearly.

For flight imports:

- Card screenshots are usually strongest for price, route, dates, passenger count, and direct / connecting summary.
- Detail screenshots are usually strongest for segments, airline, flight numbers, layovers, and baggage.

This rule does not mean immediate implementation.

Before changing production behavior:

- archive real paired examples
- run shadow comparison
- measure field-level improvement
- keep the old parser as fallback until confidence is proven

Fix the information flow, not just another regex.

---

## RULE #19 — PROACTIVE BETTER PATH

If a faster, simpler, safer, cheaper, more scalable, or higher-leverage solution becomes visible during analysis, design, implementation, testing, or review, it must be explicitly stated.

Do not optimize only the requested task.

Always evaluate whether the current work attacks the real bottleneck.

Before implementing any solution, ask:

1. Is this solving the actual business problem?
2. Is there a simpler path to the same outcome?
3. Is this infrastructure or customer value?
4. Would a customer notice this improvement?
5. If this task disappeared tomorrow, would the product become less valuable?

If a better path exists:

- state it immediately
- explain why it is better
- estimate impact
- explain risks
- recommend one of:
  - CONTINUE
  - PAUSE
  - REPLACE
  - EXPERIMENT

Never remain silent because the current task was requested.

The responsibility of GT63 engineering is not to complete tasks.

The responsibility of GT63 engineering is to maximize product value and minimize wasted effort.

Examples:

BAD:

```text
Parser accuracy improved from 94% to 96%.
```

GOOD:

```text
Parser accuracy improved from 94% to 96%, but proposal quality remains unchanged.
Recommendation: PAUSE parser optimization and invest in Proposal Experience.
```

BAD:

```text
Implemented new OCR profile.
```

GOOD:

```text
Implemented new OCR profile, but extraction is becoming a commodity.
Recommendation: keep maintenance only and shift effort to Luxury Proposal Engine.
```

BAD:

```text
Completed requested feature.
```

GOOD:

```text
Completed requested feature. However, analysis suggests a higher-leverage solution exists and should be evaluated before further investment.
```

GT63 Principle:

Technology is not the goal.

Customer value is the goal.

Infrastructure exists only to support customer value.

When a conflict appears between infrastructure optimization and customer-visible value, customer-visible value has priority unless reliability or safety is at risk.

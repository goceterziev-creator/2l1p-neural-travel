# V10.26A Vision JSON Extraction Spike Sample

This is a sanitized example of the local report format. Real spike outputs are
written under `reports/vision-spike/` and should stay local unless manually
reviewed and sanitized.

Provider: openai
Cases tested: 2
Route matches: 1/2
Price matches: 1/2
Dates present: 2/2

| Case | Decision | Route match | Price match | Dates | Segments | Airline |
| --- | --- | --- | --- | --- | --- | --- |
| sample_direct_flight_PASS | PASS | YES | YES | YES | 2 | YES |
| sample_review_missing_price_REVIEW | REVIEW | YES | NO | YES | 4 | YES |

Use this spike to compare Vision JSON extraction against existing archived
`parsed_output.json` and `metadata.json`. Do not use it to change production
behavior directly.

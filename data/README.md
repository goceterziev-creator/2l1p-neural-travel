# GT63 Airport Database

`data/airports.json` is the repository seed for the airport metadata database.

## Runtime Behavior

At startup the server ensures `/data/CONFIG/airports.json` exists when running on Railway-style persistent storage. If the runtime file is missing, the seed file is copied there.

If the runtime file is invalid or cannot be parsed, the server logs a warning and continues using the existing hardcoded airport resolver.

## Shadow Migration

V10.25A loads the JSON airport database in shadow mode only.

For airport lookups the server:

1. Uses the existing hardcoded resolver as the production result.
2. Resolves the same lookup through the JSON database.
3. Compares both results.
4. Logs structured mismatches.
5. Always returns the hardcoded resolver result.

No production airport resolution behavior changes in V10.25A.

## Schema

```json
{
  "_schemaVersion": 1,
  "_lastUpdated": "2026-06-26",
  "airports": {
    "SOF": {
      "active": true,
      "city": "Sofia",
      "country": "Bulgaria",
      "airport": "Sofia Airport",
      "aliases": ["SOF", "Sofia", "Sofia Airport", "София"]
    }
  }
}
```

## Adding Airports

Add a new IATA code under `airports`. Keep aliases broad but intentional:

- IATA code
- English city name
- Local city name when useful
- Common airport name
- Booking/airline OCR variants when stable

## Migration Strategy

V10.25A is observe-only. V10.25B may switch production resolution only after GT63 approval and shadow validation shows zero unexpected mismatches.

---

# GT63 OCR Pattern Database

`data/ocr-patterns.json` is the repository seed for OCR pattern metadata.

V10.26A uses it in shadow mode for flight price extraction only.

The production price parser remains unchanged. The pattern database observes the
same OCR text, proposes a shadow price candidate, compares it with the
production price, and records metrics.

## Runtime Behavior

At startup the server ensures `/data/CONFIG/ocr-patterns.json` exists when
running on Railway-style persistent storage. If the runtime file is missing, the
seed file is copied there.

If the runtime file is invalid or cannot be parsed, the server logs a warning
and continues using the existing price parser.

## Price Sections

- `currencySymbols`: accepted currency symbols and common OCR substitutions
- `positiveContexts`: labels that make a nearby amount more likely to be a final flight price
- `excludeContexts`: add-ons, fees, and taxes that should not become the flight price

## Migration Strategy

V10.26A is observe-only. A future switch may happen only after shadow metrics
show that pattern extraction improves coverage without unexpected mismatches.

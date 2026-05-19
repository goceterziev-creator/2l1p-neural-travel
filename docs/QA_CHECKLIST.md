# GT63 QA Checklist - Stable Build

## Foundation Lock

**GT63 V8.4.1 = FOUNDATION_LOCK**

**GT63 V8.18.1 = RELEASE_CANDIDATE_LOCK**

This build state marks the core runtime as stable. From this point forward, core runtime changes are allowed only as bugfixes, refactors, migrations, or explicitly approved stability work.

V8 is now locked as a stable operational shell. No more V8 feature work is allowed. V8 changes are limited to hotfixes, QA fixes, stability patches, release documentation, and proof-artifact preservation.

Core separation rule:

`Render displays. Validation detects. Persistence stores. Migration transforms.`

## GT63 Product Roadmap Status

- `V8.4.1 FOUNDATION_LOCK` - PASS
- `V8.5 Experience Layer` - PASS
- `V8.6 Operational Visualization` - PASS
- `V8.6.2 UX Polish` - PASS
- `V8.7 CRM Context Layer` - PASS
- `V8.7.2 Client CRM Drawer` - PASS
- `V8.8 Offer Workspace` - PASS
- `V8.12 Focus + Navigation Memory` - PASS
- `V8.13.2 Operational Query Layer` - PASS
- `V8.14 Collapsible Create Surface` - PASS
- `V8.16 Workspace Performance / Shell Polish` - PASS
- `V8.17 Workspace Header / Entity Identity Strip` - PASS
- `V8.17.3-V8.17.5 Operational Layout Discipline` - PASS
- `V8.18 Release Candidate Stabilization` - PASS
- `V8.18.1 Release Candidate Lock` - PASS
- `V9.0 Multi-Agency Architecture Layer` - STARTED
- `V9.1 Centralized Agency Scope Helpers` - PASS
- `V9.2 Role Capability Matrix` - PASS
- `V9.3 Audit Consistency Layer` - PASS
- `V9.4 Boundary Test Harness` - PASS
- `V9 Multi-Agency OS` - PLANNED

Current operating model:

`CORE = locked`

`V8 UX = locked`

`V9 = architecture-first`

New V8.x UI feature work is closed. Any remaining V8 work must read from persisted state and must not mutate, repair, or infer hidden data in the render layer.

V9 must start as an architecture layer, not UI expansion. Multi-agency work must begin with data boundaries, agency scoping, role contracts, migration-safe reads, and audit consistency before new dashboards or visual workflows.

V9 architecture gate:

`node scripts/v9-architecture-check.js`

Shell state rule:

`Shell state is read-only navigation memory.`

Allowed shell state:

- last opened workspace
- last selected client
- active workspace tab
- list/kanban view mode
- offer filters
- ops panel open/closed state

Not allowed in shell state:

- silent business mutations
- auto-saving offer data
- hidden workflow execution
- status, pricing, or pipeline mutation outside controlled workflow actions

## GT63 Release Gates

### DEV

- Parser changes allowed
- Schema changes allowed
- Render experiments allowed
- Feature exploration allowed

### STABILIZATION

- No new features
- Only bugfixes, refactors, and stability work
- Smoke tests mandatory
- QA report required
- No core runtime rewrites

### RELEASE_CANDIDATE

- All QA checklist items pass
- Migrations verified
- No duplicate core functions
- PDF/browser render parity verified
- Agency boundaries verified
- `QA_REPORT.json` result is `PASS`
- V8 feature work is closed
- Proof artifacts are preserved

### PRODUCTION_LOCK

- OCR version frozen
- `schemaVersion` frozen
- No render architecture changes
- No parser rewrites
- Only hotfix patches allowed

## Core Runtime Functions

Treat these as protected runtime functions. Do not edit directly for feature work; use wrappers, services, middleware, feature flags, or migration layers.

- `renderOfferHtml`
- `readDb`
- `writeDb`
- `normalizeOffer`
- `buildValidationWarnings`
- `sanitizeHotelImages`
- Activity logger
- OCR normalization layer

## Core API

- `/api/health` returns `ok: true`
- `/api/offers` loads
- `/api/clients` loads
- `/api/activities` loads
- `/api/activities/stats` loads
- `/api/agency` loads

## Offer Save

- Save creates `validationWarnings` when QA rules detect risk
- Update refreshes `validationWarnings`
- `warningsDismissed` resets when warning content changes
- Invalid hotel image URLs are filtered before persistence

## OCR

- OCR parser returns `source`
- OCR parser returns `missingFields`
- OCR engine version is locked to `8.3.2`
- No hallucinated flight times
- No hallucinated airline

## PDF

- PDF renders correctly
- Hero is visible and readable
- Warnings are visible
- Warning bullet list renders for one or many warnings
- Images load correctly
- Print layout is stable

## Validation

- Flight dates mismatch detected
- Guest mismatch detected
- Hotel availability warning detected
- Invalid hotel image URLs filtered
- Warning close button hides the banner without deleting persisted warnings

## Stability

- `node --check server.js` passes
- `node --check scripts/smoke-test.js` passes
- `node --check scripts/visual-smoke-v818.js` passes
- `node --check scripts/v9-architecture-check.js` passes
- `node --check scripts/v9-boundary-test.js` passes
- `node scripts/smoke-test.js` passes while the server is running
- `node scripts/visual-smoke-v818.js` passes while the server is running
- `node scripts/v9-architecture-check.js` passes before V9 UI work
- `node scripts/v9-boundary-test.js` passes before V9 UI work
- `node scripts/smoke-test.js --write-qa` passes before release builds
- `storage/generated/QA_REPORT.json` is generated
- `storage/generated/QA_REPORT.md` is generated
- `storage/generated/V8.18_VISUAL_SMOKE_WORKSPACE.png` is generated by visual smoke
- `storage/generated/V8.18_VISUAL_SMOKE_KANBAN_NARROW.png` is generated by visual smoke
- V8.18 visual smoke screenshots are retained as release-candidate proof artifacts
- No duplicate `renderOfferHtml()`
- No duplicate `readDb()`
- No duplicate `writeDb()`
- No render-time mutation of persisted data

## Data Integrity

- Every offer has `offerId` or `id`
- Every client-linked offer references an existing `clientId`
- No orphan client offer references
- `schemaVersion` is persisted after migrations
- Invalid hotel image URLs are absent from persisted hotel images

## Activity System

- `offer_viewed` activity persists correctly
- `status_changed` activity persists correctly
- Migration/system events are deduplicated
- Activity timestamps are valid ISO strings
- Activity stats totals match the activity collection shape

## Agency Layer

- Viewer role cannot mutate offers
- Agent role can update offers but not agency settings
- Admin role can access agency endpoints
- Agency-scoped endpoints do not leak cross-agency data
- V9 architecture contract exists in `docs/V9_MULTI_AGENCY_ARCHITECTURE.md`
- V9 work follows `Identity -> Agency Scope -> Role Contract -> Data Access -> Audit -> UI`
- V9 UI work is blocked until architecture checks pass
- Routes call centralized agency scope helpers
- Protected list endpoints use `scopeOffers`, `scopeClients`, and `scopeActivities`
- New offers stamp `agencyId` from the authenticated request
- Route-level scattered agency filtering is not allowed
- Routes use `requireCapability(...)` instead of direct role checks
- `ROLE_CAPABILITIES` is the single source of truth for route permissions
- Public V8 client routes remain compatibility routes and are not new protected V9 workflows
- Protected mutations append audit events through `appendAuditEvent(...)`
- Audit events include agency, actor, capability, role, entity type, and entity id context
- Routes do not hand-roll activity objects
- Boundary harness proves Agency A cannot read or mutate Agency B data
- Viewer mutation attempts are rejected server-side
- Agent agency-management attempts are rejected server-side
- Admin agency endpoints remain accessible for own agency
- Boundary harness uses an isolated test database and does not write to the live database

## Render Consistency

- Browser render and PDF render use the same `renderOfferHtml()`
- Warning rendering uses the same persisted `validationWarnings`
- Client page and PDF use the same validation source
- Render layer does not sanitize, repair, or mutate DB data

## Experience Layer

- QA Runtime reads persisted `validationWarnings`
- Pipeline Preview is read-only
- Kanban View is read-only
- Kanban has no drag/drop mutation
- Client CRM Drawer is read-only
- Client Drawer warnings are grouped by type from persisted warnings
- Client Drawer source footer is visible
- Context navigation filters existing offers without changing persisted data
- Command Palette is read-only navigation/query only
- Operational queries are deterministic and do not use AI reasoning
- Navigation state uses local UI memory only
- Collapsible Create Surface does not change save/update semantics
- Workspace tabs render only the active tab
- Activity, Assets, and QA workspace sections are lazy-rendered
- Offer cards are entry points; workspace is the intelligence/context layer
- Overlay hierarchy is explicit: Palette > Workspace > CRM > Shell
- Workspace width adapts to compact, medium, and wide viewports
- Kanban card density adapts to available viewport width
- Login/session visual smoke reaches the authenticated admin shell
- Overlay conflict smoke tests command palette + workspace + CRM together
- Narrow viewport smoke verifies compact Kanban metadata behavior

## V8.8-V8.17 Workspace System

Goal: turn an offer from a card/form object into a workspace entity and mature the surrounding operational shell.

Completed:

- Read-only workspace panel
- Offer summary
- QA panel
- Pricing breakdown
- Activity stream
- PDF/client preview link
- Assets/client/PDF links
- Workspace focus mode
- Navigation state memory
- Command Palette
- Operational Query Layer
- Collapsible Create Surface
- Lazy workspace tab rendering
- Sidebar density reduction
- Ops panel open/closed memory
- Double-click offer card quick open
- Workspace Entity Header
- Workspace width intelligence
- Multi-overlay layer hierarchy
- Kanban adaptive density

Still required:

- OCR/source/missing-fields panel when available
- Attachments/screenshots section when available
- No render-time repair
- No hidden mutation
- No replacement of the current admin form until workspace is stable

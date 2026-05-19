# GT63 V9 Multi-Agency Operations OS - Architecture Contract

## Status

`GT63 V9.0 = ARCHITECTURE_LAYER_START`

V9 starts as architecture, data boundaries, and operational contracts. It must not begin with dashboards, visual workflows, or new UI surfaces.

## Non-Negotiable Rules

- V8 remains `RELEASE_CANDIDATE_LOCK`.
- V9 work must preserve the current offer creation, OCR, PDF, QA, workspace, and command workflows.
- Multi-agency behavior must be implemented through data boundaries before UI.
- Agency-scoped reads must never leak cross-agency data.
- Role checks must be explicit, deterministic, and testable.
- Render code must not repair, sanitize, infer, or mutate persisted data.
- Shell state remains read-only navigation memory.

## Architecture Principle

`Identity -> Agency Scope -> Role Contract -> Data Access -> Audit -> UI`

UI comes last. Every V9 feature must first answer:

- Which agency owns the data?
- Which user is acting?
- Which role allows the action?
- Which records are readable?
- Which records are mutable?
- Which activity event proves the action happened?

## Entity Ownership

### agencies

Required identity fields:

- `agencyId`
- `name`
- `status`
- `createdAt`
- `updatedAt`

### users

Required SaaS fields:

- `id`
- `agencyId`
- `role`
- `name`
- `email`
- `createdAt`
- `updatedAt`

Allowed roles:

- `admin`
- `agent`
- `viewer`

### offers

Required SaaS fields:

- `id` or `offerId`
- `agencyId`
- `createdBy`
- `visibility`
- `status`
- `createdAt`
- `updatedAt`

### clients

Required SaaS fields:

- `clientId` or `id`
- `agencyId`
- `name`
- `phone`
- `offerHistory` or `offerIds`
- `createdAt`
- `updatedAt`

### activities

Required SaaS fields:

- `id`
- `type`
- `agencyId`
- `userId`
- `timestamp`
- `metadata`

## Read Scope Contract

Default read scope is agency scoped.

Allowed:

- Admin reads own agency data.
- Agent reads own agency data.
- Viewer reads own agency data.
- Public client offer routes read only the requested public offer and may record public engagement.

Not allowed:

- Cross-agency list endpoints.
- Cross-agency client summaries.
- Cross-agency activity timelines.
- UI-side filtering as the only security boundary.

## Mutation Contract

Allowed:

- Admin can mutate agency settings and agency-owned offers.
- Agent can create and update agency-owned offers.
- Viewer cannot mutate offers, clients, agency settings, or workflow state.
- Public routes can only record controlled engagement events such as view/click/book, where already supported by V8.

Not allowed:

- Hidden status mutation through navigation.
- Frontend-only permission enforcement.
- Silent agency reassignment.
- Render-time writes.

## Audit Contract

Every future V9 mutation must be able to produce an activity record with:

- `type`
- `category`
- `agencyId`
- `userId`
- affected entity id
- ISO timestamp
- small metadata payload

## V9 Implementation Order

1. Architecture checks and contracts.
2. Migration-safe agency defaults.
3. Centralized agency scope helpers.
4. Role permission matrix.
5. Endpoint boundary tests.
6. Audit consistency checks.
7. Only then: agency dashboards and team UI.

## Current V9 Gate

`node scripts/v9-architecture-check.js`

This check must pass before V9 UI work begins.

## V9.1 Centralized Agency Scope Helpers

Status:

`GT63 V9.1 = CENTRALIZED_AGENCY_SCOPE_HELPERS`

Routes must not invent agency filtering. All protected API reads and mutations must go through centralized helpers.

Required helpers:

- `getCurrentAgencyId(req)`
- `requireAgencyScope(req)`
- `scopeOffers(db, req)`
- `scopeClients(db, req)`
- `scopeActivities(db, req)`
- `scopeUsers(db, req)`
- `assertSameAgency(entity, agencyId)`

Route rule:

`routes call helpers; routes do not define scope logic`

Compatibility rule:

Legacy V8 records without `agencyId` are treated as belonging to `AGY-AYA` until a migration explicitly normalizes them.

## V9.2 Role Capability Matrix

Status:

`GT63 V9.2 = ROLE_CAPABILITY_MATRIX`

Routes must not check roles directly. Routes must request capabilities.

Required helpers:

- `ROLE_CAPABILITIES`
- `getCurrentUserRole(userOrReq)`
- `can(userOrReq, capability)`
- `requireCapability(capability)`

Route rule:

`routes require capabilities; routes do not check roles`

Allowed route pattern:

`app.post("/api/offers", requireCapability("offers.create"), handler)`

Blocked route pattern:

`if (user.role === "admin")`

Compatibility rule:

Public V8 client routes can remain public when they already existed for client viewing, engagement tracking, or PDF access. New V9 protected routes must use `requireCapability(...)`.

## V9.3 Audit Consistency Layer

Status:

`GT63 V9.3 = AUDIT_CONSISTENCY_LAYER`

Protected mutations must write audit events through one helper. Routes must not hand-roll activity objects.

Required helpers:

- `createAuditEvent(req, event)`
- `appendAuditEvent(db, req, event)`

Audit event minimum fields:

- `id`
- `type`
- `category`
- `userId`
- `actorType`
- `agencyId`
- `timestamp`
- `createdAt`
- `metadata.capability`
- `metadata.role`
- `metadata.entityType`
- `metadata.entityId`

Mutation rule:

`protected mutation -> capability -> agency scope -> mutation -> audit event -> writeDb`

Compatibility rule:

Public V8 engagement routes can keep their current controlled counters. New V9 protected mutations must use `appendAuditEvent(...)`.

## V9.4 Boundary Test Harness

Status:

`GT63 V9.4 = BOUNDARY_TEST_HARNESS`

Architecture is not considered proven until boundary behavior is tested with controlled agency contexts.

Required script:

`node scripts/v9-boundary-test.js`

The harness must verify:

- Agency A user cannot see Agency B offers.
- Agency A user cannot see Agency B clients.
- Agency A user cannot see Agency B activities.
- Agency A user cannot read or update Agency B offers.
- Viewer cannot mutate offers.
- Agent cannot manage agency users.
- Admin can access own agency endpoints.
- Command/search/workspace/client sources derive from agency-scoped data.

Data safety rule:

The boundary harness must use an isolated test database and must not write to the live production database.

## V9.5 UI Capability Reflection

Status:

`GT63 V9.5 = UI_CAPABILITY_REFLECTION`

Frontend may reflect server capabilities, but must not enforce authorization.

Server rule:

`/api/auth/me` returns the authenticated user's role and capability list.

UI rule:

The admin shell can disable or label actions based on capabilities for clarity, but every protected action must remain enforced by server-side `requireCapability(...)`.

Allowed:

- Disable create/update/import controls for roles without capabilities.
- Show read-only guidance for viewer-like roles.
- Reflect role/capability count in the session area.

Not allowed:

- Frontend-only permission enforcement.
- Hidden mutation endpoints.
- Trusting CSS, hidden buttons, or local state as authorization.

## V9.6 Session / Identity Consistency Layer

Status:

`GT63 V9.6 = SESSION_IDENTITY_CONSISTENCY`

Identity must be normalized before agency scope, capability checks, audit, or UI reflection.

Session rule:

`session -> identity -> agency scope -> capability -> audit -> UI reflection`

Required helpers:

- `normalizeSessionIdentity(user)`
- `resolveSessionContext(req)`
- `isSessionValidForUser(session, user)`
- `appendSessionAuditEvent(db, user, type, metadata)`

`/api/auth/me` must return a normalized shape:

- `user`
- `identity`
- `session`
- `agency`

Session identity fields:

- `userId`
- `agencyId`
- `role`
- `sessionVersion`
- `capabilities`

Invalidation rules:

- A session is invalid if `userId` no longer exists.
- A session is invalid if token `agencyId` conflicts with the persisted user agency.
- A session is invalid if token `role` conflicts with the persisted user role.
- A session is invalid if token `sessionVersion` conflicts with persisted `sessionVersion`.
- Legacy test tokens without optional V9.6 identity fields remain valid only when `userId` resolves.

Auth audit rule:

Login, registration, and logout should create auth-category audit events when persistence is available.

Not allowed:

- UI-first auth fixes.
- Route-local identity parsing.
- Client-side session authority.
- Silent role or agency repair during render.

## V9.7 Agency Onboarding / Invite Architecture

Status:

`GT63 V9.7 = AGENCY_INVITE_ARCHITECTURE`

Agency onboarding begins with invite contracts, not dashboard UI.

Order:

`identity -> agency -> invite -> role -> first login -> audit -> UI`

Required helpers:

- `createAgencyInvite(req, input)`
- `findInviteByToken(db, token)`
- `isInviteAcceptable(invite)`
- `publicInvite(invite)`
- `scopeInvites(db, req)`

Invite model fields:

- `id`
- `agencyId`
- `email`
- `role`
- `status`
- `tokenHash`
- `invitedBy`
- `createdAt`
- `updatedAt`
- `expiresAt`
- `acceptedAt`
- `acceptedBy`

Route rules:

- Agency invite management requires `users.manage`.
- Invite list reads must use `scopeInvites(db, req)`.
- Invite creation stamps `agencyId` from current session identity.
- Invite acceptance assigns agency and role from the invite, not from client input.
- Accepted invite registration sets first-login onboarding state.

Audit rules:

- Invite creation writes `agency_invite_created`.
- Invite acceptance writes `agency_invite_accepted`.

Not allowed:

- Billing during V9.7.
- Large onboarding UI before contract tests.
- Client-selected agency during invite acceptance.
- Plain invite token persistence.

## V9.8 Subscription / Plan Boundary Architecture

Status:

`GT63 V9.8 = SUBSCRIPTION_PLAN_BOUNDARIES`

Commercial boundaries are server contracts before payment provider integration.

Order:

`agency -> subscription -> plan contract -> limits -> feature gates -> audit -> billing provider`

Required contracts/helpers:

- `PLAN_CONTRACTS`
- `getPlanContract(plan)`
- `getAgencySubscription(agency)`
- `subscriptionAllows(subscription, feature)`
- `requireSubscriptionFeature(feature)`
- `agencyUsage(db, req)`
- `assertSeatAvailable(db, req)`

Plan contract fields:

- `plan`
- `status`
- `limits.seats`
- `limits.agencies`
- `limits.monthlyOffers`
- `features`

Subscription states:

- `trialing`
- `active`
- `grace`
- `suspended`

Route rules:

- Commercial feature gates must be centralized.
- Seat limits are checked on invite creation before issuing an invite token.
- `/api/agency/subscription` is read-only and scoped to the current agency.
- Subscription identity belongs to agency, not user.

Not allowed:

- Stripe UI during V9.8.
- Client-side plan authority.
- Route-local plan checks.
- Payment-provider coupling inside core workflow routes.

## V9.9 Production Readiness Gate

Status:

`GT63 V9.9 = PRODUCTION_READINESS_GATE`

Production readiness is a gate, not a feature.

Required command:

`npm run production:check`

The gate must check:

- environment mode
- required production secrets
- live base URL shape
- database file presence
- database backup availability
- storage folders
- generated artifact folder
- database agency/user/offer shape
- PDF engine dependency sanity
- auth/session production config
- persistent data env for production
- Render start command
- canonical docs presence

Rule:

`qa pass -> production check pass -> commit -> deploy candidate`

Not allowed:

- Deploying beta without production readiness report.
- Treating local smoke pass as production readiness.
- Production `AUTH_SECRET` fallback.
- Missing database backup before beta deployment.
- Production database stored only on ephemeral app filesystem.

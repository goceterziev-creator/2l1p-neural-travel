# GT63 MASTER HANDOVER - V9

## PROJECT

2L1P Neural Travel  
Operational Travel OS  
GT63 Architecture Line

---

# CURRENT STATUS

## V8

V8.18.1 = RELEASE_CANDIDATE_LOCK

Status:
PASS

V8 is considered operationally stable.

Locked:
- Operational Shell
- Workspace UX
- CRM Drawer
- Kanban Visualization
- Command Palette
- Navigation State
- Focus Mode
- Performance Polish
- QA Contracts
- Release Gates

Rule:
V8 UX is LOCKED.
Only hotfixes / QA fixes allowed.

---

# V9 STATUS

## V9.0
Multi-Agency Architecture Layer
PASS

## V9.1
Centralized Agency Scope Helpers
PASS

## V9.2
Role Capability Matrix
PASS

## V9.3
Audit Consistency Layer
PASS

## V9.4
Boundary Test Harness
PASS

## V9.5
Tenant-Aware UI Reflection
PASS

## V9.6
Session / Identity Consistency Layer
PASS

## V9.7
Agency Onboarding / Invite Architecture
PASS

## V9.8
Subscription / Plan Boundary Architecture
PASS

## V9.9
Production Readiness Gate
PASS

---

# ARCHITECTURE RULES

## CORE RULES

CORE = locked  
UX = iterative

Frontend reflects permissions.  
Server enforces permissions.

Read from persisted state.  
Do not repair on display.  
Do not mutate from visualization.

Render displays.  
Validation detects.  
Persistence stores.  
Migration transforms.

No business mutation logic in:
- shell
- workspace header
- CRM drawer
- kanban
- palette
- visualization layers

---

# CURRENT PRODUCT POSITION

The system is no longer:
- PDF generator
- travel admin panel

The system is now:
Operational Travel OS

Current layers:
- Workspace
- CRM Context
- Audit Layer
- Capability Layer
- Agency Scope
- Navigation Memory
- QA Runtime
- Operational Visualization

---

# MULTI-AGENCY CONTRACT

Order:

Identity
-> Agency Scope
-> Role Capability
-> Data Access
-> Audit
-> UI Reflection

Rules:
- routes never self-scope
- routes never hardcode role checks
- routes use capabilities
- routes use centralized scope helpers

---

# ROLE CAPABILITY MODEL

Routes DO NOT check:
if role === admin

Routes DO:
requireCapability("offers.update")

Capabilities are server-defined.

Frontend only reflects capability state.

---

# AUDIT CONTRACT

Protected mutation flow:

capability
-> agency scope
-> mutation
-> audit event
-> writeDb

Audit events include:
- agencyId
- userId
- role
- capability
- entityType
- entityId
- timestamp

---

# BOUNDARY TESTING

Boundary tests exist:
scripts/v9-boundary-test.js

Test DB isolation:
DB_FILE env override

Boundary guarantees:
- no cross-agency offer access
- no cross-agency client access
- no cross-agency activity access
- no unauthorized mutation
- workspace/client/palette are scoped

---

# QA COMMANDS

## Core QA

npm run smoke

npm run qa

## Architecture

npm run v9:check

npm run v9:boundary

## Visual

node scripts/visual-smoke-v818.js

---

# CURRENT UX STATE

Operational Shell:
PASS

Workspace:
PASS

Client CRM Drawer:
PASS

Kanban:
PASS

Command Palette:
PASS

Navigation State:
PASS

Focus Mode:
PASS

Workspace Layering:
PASS

Overlay Contract:
Palette 120
Workspace 110
CRM 90
Shell base

---

# CURRENT PERFORMANCE RULES

Workspace tabs:
lazy render only

No hidden inactive tab rendering.

Shell state:
read-only navigation memory only

No business auto-save.

No silent mutation.

---

# NEXT ROADMAP

## V9.5
Tenant-Aware UI Reflection

Status:
PASS

Scope:
- tenant identity strip
- capability reflection
- disabled/hidden actions
- palette scope reflection
- workspace context reflection

NO:
- new workflows
- new mutations
- permission enforcement in frontend

---

## V9.6
Auth Hardening

Status:
FOUNDATION PASS

Planned:
- centralized auth/session shape
- normalized /api/auth/me
- session audit consistency
- tenant identity persistence
- role/session invalidation rules
- session expiration
- secure cookies
- reset tokens
- invite tokens
- brute-force protection
- auth audit events
- CSRF strategy

---

## V9.7
Agency Onboarding

Status:
FOUNDATION PASS

Planned:
- invite token model
- agency user invite flow
- role assignment contract
- first-login onboarding state
- invite audit events
- create agency
- invite users
- role assignment
- first login flow

---

## V9.8
Billing Skeleton

Status:
FOUNDATION PASS

Planned:
- plans
- subscription boundaries
- feature gates
- seat limits
- agency limits
- billing identity model
- grace/suspended states
- Stripe integration structure
- usage model

---

## V10
Closed Beta SaaS

Status:
ACTIVE

Target:
2-5 real agencies

Focus:
- operational stability
- onboarding
- trust
- audit
- scoped multi-agency runtime
- beta demo package
- real agency discovery

Precondition:
- npm run qa
- npm run production:check

Runbook:
- docs/V10_CLOSED_BETA_PREP.md
- docs/V10_BETA_DEMO_PACKAGE.md

Current V10 layers:
- V10.3 Luxury PDF Brochure = PASS
- V10.4 Hotel Image Resolver = PASS
- V10.5 WhatsApp QR CTA = PASS
- V10.6 Beta Demo Package = ACTIVE

---

# IMPORTANT

This is a long-running operational software project.

Priority:
stability > architecture > audit > boundaries > UX polish > new features

Avoid:
- uncontrolled rewrites
- scattered permissions
- runtime mutation in visualization
- feature chaos

Maintain:
- centralized contracts
- deterministic shell behavior
- scoped data access
- audit consistency
- QA discipline

---

# LOAD COMMAND

For new chat:

GT63 LOAD HANDOVER V9

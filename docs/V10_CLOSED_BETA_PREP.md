# GT63 V10 CLOSED BETA PREP

## Status

V10 Closed Beta Prep = ACTIVE

V8 = RELEASE_CANDIDATE_LOCK  
V9 = SaaS Foundation PASS  
V9.9 = Production Readiness Gate PASS

## Rule

No new product features before closed beta.

Allowed:
- deployment hardening
- onboarding setup
- seed data
- stability fixes
- backup routines
- beta feedback collection
- production readiness fixes

Not allowed:
- new workflows
- new dashboards
- Stripe UI
- public launch changes
- uncontrolled feature expansion

## Required Gates

Before beta deployment:

1. `npm run qa`
2. `npm run production:check`
3. Review `storage/generated/QA_REPORT.json`
4. Review `storage/generated/PRODUCTION_CHECK.json`
5. Confirm production env values in Render
6. Confirm database/storage persistence strategy
7. Confirm backup routine

## Render Production Environment

Required env vars:

- `NODE_ENV=production`
- `AUTH_SECRET=<strong random secret, 32+ chars>`
- `LIVE_BASE_URL=https://<real-domain>`
- `DATA_DIR=<Render persistent disk mount>` or `DB_FILE=<persistent database path>`
- `PORT` supplied by Render
- `ADMIN_EMAIL=<owner email>`
- `ADMIN_PASSWORD=<temporary bootstrap password>`
- `ADMIN_NAME=<owner name>`

Rules:

- Never use `dev-auth-secret-change-me` in production.
- `LIVE_BASE_URL` must be HTTPS.
- `DATABASE/database.json` must live on persistent storage, not the ephemeral app filesystem.
- Bootstrap password must be changed after first production login.
- Render start command must remain `node server.js`.

## Domain / LIVE_BASE_URL

Checklist:

- Real domain or Render URL selected.
- `LIVE_BASE_URL` matches the public HTTPS origin.
- Public offer links open from beta user devices.
- PDF links render with the same public origin.
- WhatsApp share links use the production origin.

## Persistent Data Strategy

Current filesystem database:

- `DATABASE/database.json`
- `DATABASE/database.json.bak`
- `backups/*.json`
- `storage/generated/*.json`

Closed beta requirement:

- Confirm Render disk persistence or external database strategy before real agencies use the system.
- Confirm backup files survive deploy/restart.
- Confirm generated QA reports do not replace business backups.

Recommended minimum for beta:

- Persistent disk mounted and exposed through `DATA_DIR` or `DB_FILE`.
- `DATABASE/database.json` stored under that persistent mount.
- Manual backup before each deploy.
- Manual restore test before inviting beta agencies.

Render example:

- attach persistent disk mounted at `/var/data`
- set `DATA_DIR=/var/data`
- keep `DB_FILE` unset unless a custom file path is required

## Backup Routine

Before deploy:

1. Download/copy `DATABASE/database.json`.
2. Download/copy latest `DATABASE/database.json.bak`.
3. Download/copy latest `backups/*.json`.
4. Run `npm run production:check`.
5. Store backup outside Render.

After deploy:

1. Log in.
2. Open admin.
3. Open one offer.
4. Generate one PDF.
5. Run smoke check against production base URL.

## First Agency Seed

Seed target:

- one owner/admin
- one agency
- one test offer
- one test client
- one invite

Rules:

- First real agency must have clear `agencyId`.
- First admin must have `owner` or `admin` role.
- Invite users through V9.7 invite contract.
- Do not manually assign cross-agency users.

## Beta Agencies

Target:

- 2-5 agencies

Acceptance:

- each agency can see only its own offers
- each agency can invite its own users
- viewer cannot mutate offers
- agent cannot manage users
- admin can manage own agency users/invites
- subscription snapshot is agency-scoped

## Beta Feedback Checklist

Collect feedback on:

- login/session stability
- offer creation
- PDF generation
- client links
- WhatsApp sharing
- agency user invites
- role expectations
- performance on real data
- confusing disabled actions
- missing audit/history context

Do not collect feedback on:

- billing UI
- public self-serve signup
- advanced automation
- white-labeling
- enterprise API

Those belong after closed beta foundation stability.

## Beta Password Recovery

Closed beta uses manual admin reset only.

Allowed:

- `POST /api/admin/reset-password`
- protected by `users.manage`
- scoped to the current agency
- writes audit event
- invalidates existing sessions through `sessionVersion`
- marks `passwordResetRequired`

Not allowed during beta prep:

- forgot password UI
- email provider integration
- magic links
- OTP flows
- public recovery endpoints

## Go / No-Go

Go when:

- QA PASS
- production check PASS
- backup confirmed
- Render env confirmed
- persistent storage confirmed
- first agency can complete core workflow
- beta user invite flow works

No-go when:

- production secret is missing
- persistence is unclear
- backup is untested
- PDF generation fails
- cross-agency boundary fails
- invite acceptance assigns wrong agency or role
